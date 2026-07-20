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
    if (!value) throw new Error(`J-005 failed: ${message}`);
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
    throw new Error(`J-005 timed out: ${message}`);
}
function auth(token) {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDE_CONFIG_DIR'),
        '.credentials.json']);
    GLib.file_set_contents(path, JSON.stringify({claudeAiOauth: {accessToken: token}}));
}
function startClaude() {
    const process = Gio.Subprocess.new([GLib.getenv('CLAUDEX_FAKE_CLAUDE'),
        '-c', 'import time; time.sleep(30)'], Gio.SubprocessFlags.NONE);
    process.fixturePid = process.get_identifier();
    const directory = GLib.build_filenamev(
        [GLib.getenv('CLAUDEX_PROC_ROOT'), process.fixturePid]);
    GLib.mkdir_with_parents(directory, 0o700);
    GLib.file_set_contents(GLib.build_filenamev([directory, 'comm']), 'claude\n');
    return process;
}
function stopClaude(process) {
    const directory = Gio.File.new_for_path(GLib.build_filenamev(
        [GLib.getenv('CLAUDEX_PROC_ROOT'), process.fixturePid]));
    process.force_exit(); directory.get_child('comm').delete(null);
    directory.delete(null);
}
export async function run() {
    const state = {short: 12, weekly: 37, malformed: false, hold: false,
        held: null, requests: 0, authorization: null};
    const server = new Soup.Server();
    const reply = (message, short = state.short, weekly = state.weekly) => {
        const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();
        const body = state.malformed ? '{' : JSON.stringify({
            five_hour: {utilization: short, resets_at: iso(5 * 3600 * 1000)},
            seven_day: {utilization: weekly, resets_at: iso(7 * 86400 * 1000)},
        });
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
    let removeCompanion = null;
    try {
        await waitFor(() => !extension.getSurfaceSnapshot().visible,
            'initial absence');
        const absentRequests = state.requests;
        await Scripting.sleep(300);
        assert(!Main.panel.statusArea[UUID] && state.requests === absentRequests,
            'confirmed absence schedules no usage request');
        process = startClaude();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 12, 'initial short usage');
        assert(Main.panel.statusArea[UUID] &&
            state.authorization === 'Bearer journey-token',
        'test-owned process enables authenticated Claude usage');
        assert(extension.getSurfaceSnapshot().providers[0]?.metrics[1]?.percent === 37,
            'weekly window accompanies the short window');
        const indicator = Main.panel.statusArea[UUID];
        indicator.menu.open();
        await waitFor(() => labels(indicator.menu.actor, []).includes('12%'),
            'short popup value');
        assert(labels(indicator.menu.actor, []).includes('37%'),
            'weekly popup value');
        assert(labels(indicator.menu.actor, []).some(value =>
            value.startsWith('Resets in')), 'popup shows reset time');
        auth('rotated-journey-token');
        state.short = 24; state.weekly = 54; extension.refresh();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 24, 'manual refresh');
        assert(indicator.menu.isOpen &&
            state.authorization === 'Bearer rotated-journey-token',
        'fresh credential updates without closing the popup');
        state.malformed = true; extension.refresh();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.availability === 'unavailable', 'malformed response');
        assert(!labels(indicator.menu.actor, []).includes('24%'),
            'unavailable state clears stale values');
        indicator.menu.close();
        await Scripting.sleep(100);
        state.malformed = false; state.hold = true; extension.refresh();
        await waitFor(() => state.held, 'delayed request');
        stopClaude(process);
        process = null;
        await waitFor(() => !extension.getSurfaceSnapshot().visible,
            'process exit removes eligibility');
        assert(!Main.panel.statusArea[UUID], 'last session removes the panel item');
        reply(state.held, 99, 99);
        server.unpause_message(state.held); state.held = null;
        await waitFor(() => !extension.getSurfaceSnapshot().refreshing,
            'cancelled refresh settlement');
        assert(!extension.getSurfaceSnapshot().visible,
            'cancelled completion cannot resurrect an absent provider');
        const companion = {
            id: 'eligibility-companion',
            order: 99,
            label: 'Companion',
            detail: 'Journey-only eligible provider',
            marks: {
                darkPanel: 'icons/codex.svg',
                lightPanel: 'icons/codex-light.svg',
                popup: 'icons/codex.svg',
                accessibleName: 'Journey companion mark',
            },
            windows: [{
                id: 'weekly',
                label: 'Weekly window',
                dataRole: 'dataCodexWeekly',
            }],
            isEligible: () => true,
            subscribeEligibility: () => () => {},
            refresh: async () => ({status: 'available', readings: [{
                id: 'weekly',
                percent: 33,
                resetAtMs: Date.now() + 86400 * 1000,
            }]}),
        };
        removeCompanion = extension.registerProvider(companion);
        await waitFor(() => extension.getSurfaceSnapshot().providers
            .some(item => item.id === 'eligibility-companion' &&
                item.availability === 'available'), 'companion owns the cadence timer');
        const requestsBeforeReeligibility = state.requests;
        state.short = 61; process = startClaude();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 61, 'reeligible refresh');
        assert(state.requests === requestsBeforeReeligibility + 1,
            'Claude eligibility requests usage immediately instead of waiting for cadence');
    } finally {
        if (process)
            stopClaude(process);
        if (state.held) {
            reply(state.held);
            server.unpause_message(state.held);
        }
        removeCompanion?.();
        server.disconnect();
    }
}
