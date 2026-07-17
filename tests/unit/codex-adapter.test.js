import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createCodexProvider, CodexRuntime} from '../../extension/codex-runtime.js';

function assert(value, message) {
    if (!value) throw new Error(message);
}
function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function throws(callback) {
    try { callback(); } catch { return; }
    throw new Error('expected rejection');
}
function write(path, value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    Gio.File.new_for_path(path).replace_contents(bytes, null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}
function removeTree(path) {
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        return;
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) ===
        Gio.FileType.DIRECTORY) {
        const entries = file.enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info;
        while ((info = entries.next_file(null)))
            removeTree(GLib.build_filenamev([path, info.get_name()]));
        entries.close(null);
    }
    file.delete(null);
}
function input(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes));
}
function usage(percent = 37, reset = 100) {
    return JSON.stringify({rate_limit: {primary_window: {used_percent: percent,
        limit_window_seconds: 604800, reset_at: reset}, secondary_window: null}});
}

class Session {
    constructor(responses = []) {
        this.responses = responses; this.requests = [];
    }
    async send(message, cancellable) {
        this.requests.push({message, method: message.method,
            path: message.get_uri().get_path(),
            auth: message.request_headers.get_one('Authorization')});
        const response = this.responses.shift() ?? {};
        if (response.pending)
            return await new Promise((_resolve, reject) =>
                cancellable.connect(() => reject(new Error('cancelled'))));
        return {statusCode: response.status ?? 200,
            stream: input(response.body ?? usage())};
    }
    abort() {}
}
const root = GLib.dir_make_tmp('claudex-codex-unit-XXXXXX');
const procRoot = GLib.build_filenamev([root, 'proc']);
const codexHome = GLib.build_filenamev([root, 'home']);
const processPath = GLib.build_filenamev([procRoot, '123']);
const authPath = GLib.build_filenamev([codexHome, 'auth.json']);
GLib.mkdir_with_parents(procRoot, 0o700);
GLib.mkdir_with_parents(codexHome, 0o700);
function process(name = 'codex') {
    GLib.mkdir_with_parents(processPath, 0o700);
    write(GLib.build_filenamev([processPath, 'comm']), `${name}\n`);
}
function auth(token = 'fixture-token') {
    write(authPath, JSON.stringify({tokens: {access_token: token}}));
}
function runtime(session = new Session(), extra = {}) {
    return new CodexRuntime({procRoot, codexHome,
        currentUser: GLib.get_user_name(), endpoint: 'http://127.0.0.1:19876/usage',
        schedule: () => 1, cancel: () => {}, session, ...extra});
}
async function idleUntil(callback) {
    while (!callback())
        await new Promise(resolve => GLib.idle_add(0, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }));
}
let passed = 0;
async function test(name, callback) {
    await callback(); print(`ok ${++passed} - ${name}`);
}
try {
    await test('provider and runtime reject malformed public boundaries', async () => {
        let listener;
        let cancelled = 0;
        const source = {isPresent: () => true,
            subscribePresence: callback => (listener = callback, () => {}),
            refreshUsage: async () => ({status: 'unavailable'}),
            cancelRefresh: () => cancelled++};
        const provider = createCodexProvider(source);
        assert(Object.isFrozen(provider) && provider.id === 'codex' &&
            provider.windows[0].dataRole === 'dataCodexWeekly', 'metadata');
        let observed;
        provider.subscribeEligibility(value => observed = value);
        listener('invalid');
        assert(observed === false && cancelled === 1, 'eligibility');
        equal(await provider.refresh(), {status: 'unavailable'}, 'refresh');
        throws(() => createCodexProvider({}));
        for (const options of [null, {unknown: true}, {procRoot: 'relative'},
            {codexHome: ''}, {currentUser: ''}, {endpoint: 'file:///tmp/x'},
            {presenceIntervalMs: 0}, {authMaxBytes: 1.5},
            {responseMaxBytes: '8'}, {schedule: () => 1},
            {session: {send() {}}}])
            throws(() => new CodexRuntime(options));
    });

    await test('presence is exact, current-user, change-only, and disposable', () => {
        process();
        let tick;
        let cancels = 0;
        const instance = runtime(new Session(), {
            schedule: callback => (tick = callback, 7),
            cancel: () => cancels++,
        });
        const changes = [];
        const unsubscribe = instance.subscribePresence(value => changes.push(value));
        tick();
        removeTree(processPath); tick();
        process(); tick();
        equal(changes, [false, true], 'changes');
        unsubscribe(); unsubscribe(); instance.dispose();
        assert(cancels === 1, 'unsubscribe');
        const wrongOwner = runtime(new Session(), {currentUser: 'other-user'});
        assert(!wrongOwner.isPresent(), 'owner'); wrongOwner.dispose();
        process('codex-helper');
        const wrongName = runtime();
        assert(!wrongName.isPresent(), 'comm'); wrongName.dispose();
        removeTree(processPath);
    });

    await test('refresh rereads auth and clears request secrets', async () => {
        process(); auth('first-token');
        const session = new Session([{body: usage(37, 100)},
            {body: usage(54, 200)}, {status: 302}]);
        const instance = runtime(session);
        equal(await instance.refreshUsage(), {status: 'available',
            readings: [{id: 'weekly', percent: 37, resetAtMs: 100000}]}, 'first');
        auth('rotated-token');
        equal(await instance.refreshUsage(), {status: 'available',
            readings: [{id: 'weekly', percent: 54, resetAtMs: 200000}]}, 'rotated');
        equal(await instance.refreshUsage(), {status: 'unavailable'}, 'status');
        equal(session.requests.map(item => [item.method, item.path, item.auth]), [
            ['GET', '/usage', 'Bearer first-token'],
            ['GET', '/usage', 'Bearer rotated-token'],
            ['GET', '/usage', 'Bearer rotated-token']], 'request');
        assert(session.requests.every(item =>
            item.message.request_headers.get_one('Authorization') === null), 'cleanup');
        instance.dispose(); removeTree(processPath);
    });

    await test('fatal UTF-8 and ingress ceilings fail closed', async () => {
        process();
        write(authPath, new Uint8Array([
            ...new TextEncoder().encode('{"tokens":{"access_token":"bad'),
            0xff, 34, 125, 125]));
        let session = new Session();
        let instance = runtime(session);
        equal(await instance.refreshUsage(), {status: 'unavailable'}, 'auth UTF-8');
        assert(session.requests.length === 0, 'auth transmission'); instance.dispose();
        auth();
        for (const [options, body] of [[{}, new Uint8Array([0xff])],
            [{responseMaxBytes: 8}, usage()]]) {
            instance = runtime(new Session([{body}]), options);
            equal(await instance.refreshUsage(), {status: 'unavailable'}, 'response');
            instance.dispose();
        }
        session = new Session(); instance = runtime(session, {authMaxBytes: 8});
        equal(await instance.refreshUsage(), {status: 'unavailable'}, 'auth ceiling');
        assert(session.requests.length === 0, 'ceiling transmission');
        instance.dispose(); removeTree(processPath);
    });

    await test('stale cancellation cannot clear a reeligible attempt', async () => {
        process(); auth();
        const session = new Session([{pending: true}, {body: usage(61, 400)}]);
        const instance = runtime(session);
        const stale = instance.refreshUsage();
        await idleUntil(() => session.requests.length === 1);
        instance.cancelRefresh(); removeTree(processPath); instance._pollPresence();
        process(); instance._pollPresence();
        const current = instance.refreshUsage();
        equal(await stale, {status: 'unavailable'}, 'cancelled');
        equal(await current, {status: 'available',
            readings: [{id: 'weekly', percent: 61, resetAtMs: 400000}]}, 'current');
        instance.dispose(); removeTree(processPath);
    });
} finally {
    removeTree(root);
}
print(`Codex adapter unit suite: ${passed} passed`);
