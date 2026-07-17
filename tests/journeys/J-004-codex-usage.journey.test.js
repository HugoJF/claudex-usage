import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const UUID = 'claudex-usage@hugo.local', PORT = 19876;
export const METRICS = {};
export function init() {}
function assert(value, message) {
    if (!value) throw new Error(`J-004 failed: ${message}`);
}
function labels(root, values = []) {
    if (root instanceof St.Label) values.push(root.text);
    for (const child of root?.get_children?.() ?? [])
        labels(child, values);
    return values;
}
async function waitFor(callback, message) {
    for (let attempt = 0; attempt < 120; attempt++) {
        if (callback())
            return;
        await Scripting.sleep(100);
    }
    throw new Error(`J-004 timed out: ${message}`);
}
function auth(token) {
    const path = GLib.build_filenamev([GLib.getenv('CODEX_HOME'), 'auth.json']);
    GLib.file_set_contents(path, JSON.stringify({tokens: {access_token: token}}));
}
function startCodex() {
    const process = Gio.Subprocess.new([GLib.getenv('CLAUDEX_FAKE_CODEX'),
        '-c', 'import time; time.sleep(30)'], Gio.SubprocessFlags.NONE);
    process.fixturePid = process.get_identifier();
    const directory = GLib.build_filenamev(
        [GLib.getenv('CLAUDEX_PROC_ROOT'), process.fixturePid]);
    GLib.mkdir_with_parents(directory, 0o700);
    GLib.file_set_contents(GLib.build_filenamev([directory, 'comm']), 'codex\n');
    return process;
}
function stopCodex(process) {
    const directory = Gio.File.new_for_path(GLib.build_filenamev(
        [GLib.getenv('CLAUDEX_PROC_ROOT'), process.fixturePid]));
    process.force_exit(); directory.get_child('comm').delete(null);
    directory.delete(null);
}
export async function run() {
    const state = {percent: 37, malformed: false, hold: false,
        held: null, requests: 0, authorization: null};
    const server = new Soup.Server();
    const reply = (message, percent = state.percent) => {
        const body = state.malformed ? '{' : JSON.stringify({rate_limit: {
            primary_window: {used_percent: percent, limit_window_seconds: 604800,
                reset_at: Math.floor(Date.now() / 1000) + 604800},
            secondary_window: null,
        }});
        message.set_status(Soup.Status.OK, null);
        message.set_response('application/json', Soup.MemoryUse.COPY,
            new TextEncoder().encode(body));
    };
    server.add_handler('/usage', (_server, message) => {
        state.requests++;
        state.authorization = message.get_request_headers().get_one('Authorization');
        if (state.hold) {
            state.hold = false; state.held = message;
            server.pause_message(message);
        } else
            reply(message);
    });
    server.listen_local(PORT, Soup.ServerListenOptions.IPV4_ONLY);
    await Scripting.sleep(300);
    const extension = Main.extensionManager.lookup(UUID)?.stateObj;
    assert(extension, 'production extension is enabled');
    let process = null;
    try {
        await waitFor(() => !extension.getSurfaceSnapshot().visible,
            'initial absence');
        const absentRequests = state.requests;
        await Scripting.sleep(300);
        assert(!Main.panel.statusArea[UUID] && state.requests === absentRequests,
            'confirmed absence schedules no usage request');
        process = startCodex();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 37, 'initial weekly usage');
        assert(Main.panel.statusArea[UUID] &&
            state.authorization === 'Bearer journey-token',
        'test-owned process enables authenticated weekly usage');
        const indicator = Main.panel.statusArea[UUID];
        indicator.menu.open();
        await waitFor(() => labels(indicator.menu.actor, []).includes('37%'),
            'weekly popup value');
        assert(labels(indicator.menu.actor, []).some(value =>
            value.startsWith('Resets in')), 'popup shows reset time');
        auth('rotated-journey-token');
        state.percent = 54; extension.refresh();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 54, 'manual refresh');
        assert(indicator.menu.isOpen &&
            state.authorization === 'Bearer rotated-journey-token',
        'fresh credential updates without closing the popup');
        state.malformed = true; extension.refresh();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.availability === 'unavailable', 'malformed response');
        assert(!labels(indicator.menu.actor, []).includes('54%'),
            'unavailable state clears stale values');
        indicator.menu.close();
        await Scripting.sleep(100);
        state.malformed = false; state.hold = true; extension.refresh();
        await waitFor(() => state.held, 'delayed request');
        stopCodex(process);
        process = null;
        await waitFor(() => !extension.getSurfaceSnapshot().visible,
            'process exit removes eligibility');
        assert(!Main.panel.statusArea[UUID], 'last session removes the panel item');
        reply(state.held, 99);
        server.unpause_message(state.held); state.held = null;
        await waitFor(() => !extension.getSurfaceSnapshot().refreshing,
            'cancelled refresh settlement');
        assert(!extension.getSurfaceSnapshot().visible,
            'cancelled completion cannot resurrect an absent provider');
        state.percent = 61; process = startCodex();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 61, 'reeligible refresh');
    } finally {
        if (process)
            stopCodex(process);
        if (state.held) {
            reply(state.held);
            server.unpause_message(state.held);
        }
        server.disconnect();
    }
}
