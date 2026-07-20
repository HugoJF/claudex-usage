import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const UUID = 'claudex-usage@hugo.local', PORT = 19876;
const LEFT_CAPTURE = 'surface-left-popup-dark-100.png';
const RANGE_CAPTURES = {
    dark: 'surface-history-range-open-dark-100.png',
    light: 'surface-history-range-open-light-100.png',
    scaled: 'surface-history-range-open-dark-200.png',
};
Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');
export const METRICS = {};
export function init() {}
function assert(value, message) {
    if (!value) throw new Error(`J-006 failed: ${message}`);
}
function findActor(root, name) {
    if (root?.get_name?.() === name)
        return root;
    for (const child of root?.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found)
            return found;
    }
    return null;
}
function labels(root, values = []) {
    if (root instanceof St.Label)
        values.push(root.text);
    for (const child of root?.get_children?.() ?? [])
        labels(child, values);
    return values;
}
function hasState(actor, state) {
    return actor.get_accessible().ref_state_set().contains_state(state);
}
function hasRelation(source, type, target) {
    const relation = source.get_accessible().ref_relation_set()
        .get_relation_by_type(type);
    return relation?.get_target().includes(target.get_accessible()) ?? false;
}
function setShellColorScheme(scheme) {
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}
function virtualKeyboard() {
    return Clutter.get_default_backend().get_default_seat().create_virtual_device(
        Clutter.InputDeviceType.KEYBOARD_DEVICE);
}
async function pressKey(keyboard, keyval) {
    const time = Clutter.get_current_event_time();
    keyboard.notify_keyval(time, keyval, Clutter.KeyState.PRESSED);
    await Scripting.sleep(20);
    keyboard.notify_keyval(time, keyval, Clutter.KeyState.RELEASED);
    await Scripting.sleep(100);
}
function captureDirectory() {
    const override = GLib.getenv('CLAUDEX_CAPTURE_DIR');
    if (override)
        return Gio.File.new_for_path(override);
    return Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent()
        .get_child('design').get_child('captures');
}
async function captureActor(target, filename, padding = 8) {
    let actor = null;
    let width = 0;
    let height = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
        actor = typeof target === 'function' ? target() : target;
        if (actor?.is_mapped())
            [width, height] = actor.get_transformed_size();
        if (width > 0 && height > 0)
            break;
        await Scripting.sleep(80);
    }
    assert(actor?.is_mapped(), `${filename} actor is not mapped`);
    assert(width > 0 && height > 0, `${filename} actor has no allocated geometry`);
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        directory.make_directory_with_parents(null);
    const [actorX, actorY] = actor.get_transformed_position();
    const x = Math.max(0, Math.floor(actorX - padding));
    const y = Math.max(0, Math.floor(actorY - padding));
    const captureWidth = Math.min(global.screen_width - x,
        Math.ceil(width + padding * 2));
    const captureHeight = Math.min(global.screen_height - y,
        Math.ceil(height + padding * 2));
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(x, y, captureWidth, captureHeight, stream);
    stream.close(null);
}
async function waitFor(callback, message) {
    for (let attempt = 0; attempt < 120; attempt++) {
        if (callback())
            return;
        await Scripting.sleep(100);
    }
    throw new Error(`J-006 timed out: ${message}`);
}
function auth(token) {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDE_CONFIG_DIR'),
        '.credentials.json']);
    GLib.file_set_contents(path, JSON.stringify({claudeAiOauth: {accessToken: token}}));
}
function historyWindows() {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDEX_HISTORY_DIR'), 'history.json']);
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        return {};
    return JSON.parse(new TextDecoder('utf-8').decode(bytes)).windows ?? {};
}
function historyText() {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDEX_HISTORY_DIR'), 'history.json']);
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, 'history file is readable');
    return new TextDecoder('utf-8').decode(bytes);
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
    const state = {short: 12, weekly: 37, hold: false, held: null, requests: 0};
    const server = new Soup.Server();
    const reply = message => {
        const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();
        const body = JSON.stringify({
            five_hour: {utilization: state.short, resets_at: iso(5 * 3600 * 1000)},
            seven_day: {utilization: state.weekly, resets_at: iso(7 * 86400 * 1000)},
        });
        message.set_status(Soup.Status.OK, null);
        message.set_response('application/json', Soup.MemoryUse.COPY,
            new TextEncoder().encode(body));
    };
    server.add_handler('/usage', (_server, message) => {
        state.requests++;
        if (state.hold) {
            state.hold = false;
            state.held = message;
            server.pause_message(message);
        } else {
            reply(message);
        }
    });
    server.listen_local(PORT, Soup.ServerListenOptions.IPV4_ONLY);
    await Scripting.sleep(300);
    const extension = Main.extensionManager.lookup(UUID)?.stateObj;
    assert(extension, 'production extension is enabled');
    auth('journey-token');
    const seeded = historyWindows()['claude:short']?.length ?? 0;
    assert(seeded > 0, 'harness seeded prior history');
    let process = null;
    let removeCompanion = null;
    try {
        process = startClaude();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 12, 'live Claude usage');
        await waitFor(() => (historyWindows()['claude:short']?.length ?? 0) > seeded,
            'the completed refresh records a durable sample');
        const afterInitial = historyWindows()['claude:short'].length;
        let companionListener = null;
        let companionEligible = false;
        const companion = {
            id: 'history-eligibility-companion',
            order: 99,
            label: 'Companion',
            detail: 'Journey-only eligible provider',
            marks: {
                darkPanel: 'icons/codex.svg',
                lightPanel: 'icons/codex-light.svg',
                popup: 'icons/codex.svg',
                accessibleName: 'History journey companion mark',
            },
            windows: [{
                id: 'weekly',
                label: 'Weekly window',
                dataRole: 'dataCodexWeekly',
            }],
            isEligible: () => companionEligible,
            subscribeEligibility: callback => {
                companionListener = callback;
                return () => companionListener = null;
            },
            refresh: async () => ({status: 'available', readings: [{
                id: 'weekly',
                percent: 45,
                resetAtMs: Date.now() + 86400 * 1000,
            }]}),
        };
        removeCompanion = extension.registerProvider(companion);
        state.short = 24;
        state.hold = true;
        extension.refresh();
        await waitFor(() => state.held !== null, 'first refresh is held');
        companionEligible = true;
        companionListener(true);
        const firstHeld = state.held;
        state.held = null;
        state.hold = true;
        reply(firstHeld);
        server.unpause_message(firstHeld);
        await waitFor(() => state.held !== null &&
            (historyWindows()['claude:short']?.length ?? 0) === afterInitial + 1,
        'first completion records before the queued refresh settles');
        let rows = historyWindows()['claude:short'];
        assert(rows.at(-1)[1] === 24,
            'the first completion records its exact Claude percentage');

        state.short = 31;
        const secondHeld = state.held;
        state.held = null;
        reply(secondHeld);
        server.unpause_message(secondHeld);
        await waitFor(() => (historyWindows()['claude:short']?.length ?? 0) ===
            afterInitial + 2, 'queued completion records a second sample');
        rows = historyWindows()['claude:short'];
        assert(rows.at(-2)[1] === 24 && rows.at(-1)[1] === 31 &&
            rows.at(-2)[0] < rows.at(-1)[0],
        'queued refresh samples preserve value and timestamp order');
        const indicator = Main.panel.statusArea[UUID];
        indicator.menu.open();
        await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
            'usage popup shows the history chart');
        const legend = labels(indicator.menu.actor, []);
        assert(legend.includes('Claude 5-hour') && legend.includes('Claude weekly'),
            'chart legend names both Claude series');
        let rangeTrigger = findActor(indicator.menu.actor, 'select-history-range');
        let rangeOptions = findActor(indicator.menu.actor,
            'select-history-range-options');
        const sixHourOption = findActor(indicator.menu.actor,
            'select-history-range-option-6h');
        assert(rangeTrigger.accessible_role === Atk.Role.COMBO_BOX &&
            hasState(rangeTrigger, Atk.StateType.EXPANDABLE) &&
            rangeTrigger.get_accessible_name() === 'Usage history range, 6h',
        'the default range uses an accessible compact select');
        assert(rangeOptions.accessible_role === Atk.Role.LIST_BOX &&
            hasRelation(rangeTrigger, Atk.RelationType.CONTROLLER_FOR,
                rangeOptions) &&
            hasRelation(rangeOptions, Atk.RelationType.CONTROLLED_BY,
                rangeTrigger),
        'the range trigger controls its accessible option list');
        assert(!rangeOptions.visible && !rangeOptions.is_mapped() &&
            !sixHourOption.can_focus && sixHourOption.checked,
        'closed range options leave the visible and focus trees');

        const historyBeforeDisplayChange = historyText();
        const requestsBeforeDisplayChange = state.requests;
        findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'usage-display-choice'),
            'settings exposes the usage-display choice');
        const displayChoice = findActor(indicator.menu.actor, 'usage-display-choice');
        assert(displayChoice.get_accessible_name() === 'Usage display, Used',
            'history starts in the canonical Used presentation');
        displayChoice.emit('clicked', 1);
        await waitFor(() => extension.getSurfaceSnapshot().preferences.usageDisplay.id ===
            'left', 'Left preference applies');
        assert(state.requests === requestsBeforeDisplayChange,
            'changing display basis does not request provider data');
        findActor(indicator.menu.actor, 'back-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
            'Left history chart is visible');
        const rawClaude = extension.getSurfaceSnapshot().providers
            .find(provider => provider.id === 'claude');
        assert(rawClaude.metrics[0].percent === 31 &&
            rawClaude.metrics[1].percent === 37,
        'the public snapshot remains canonical Used data');
        const leftLabels = labels(indicator.menu.actor, []).join(' ');
        const shortProgress = findActor(indicator.menu.actor, 'progress-claude--short');
        assert(leftLabels.includes('69%') && leftLabels.includes('63%') &&
            leftLabels.includes('55%'),
        'current cards show every Left complement');
        const shortFill = findActor(shortProgress, 'progress-fill-claude--short');
        assert(shortFill.width === 218,
            'current progress geometry uses the Left complement');
        assert(shortProgress.get_accessible_name() ===
            'Claude 5-hour window at 69 percent left',
        'current progress accessibility names the Left complement');
        assert(findActor(indicator.menu.actor, 'history-chart').get_accessible_name() ===
            'Usage history for 6h, percentage left, from zero to one hundred percent',
        'the composed chart names its Left data basis');
        assert(historyText() === historyBeforeDisplayChange,
            'changing display basis leaves durable canonical history byte-identical');
        await captureActor(() => indicator.menu.actor, LEFT_CAPTURE);

        const keyboard = virtualKeyboard();
        const historyBeforeRangeInteraction = historyText();
        const requestsBeforeRangeInteraction = state.requests;
        const rangeSettings = extension.getSettings();
        let rangeChanges = 0;
        const rangeChangedId = rangeSettings.connect(
            'changed::history-range', () => rangeChanges++);
        const reopenUsagePopup = async () => {
            indicator.menu.open();
            await waitFor(() => indicator.menu.isOpen &&
                findActor(indicator.menu.actor, 'select-history-range')?.is_mapped(),
            'usage popup reopens with its mapped range selector');
            rangeTrigger = findActor(indicator.menu.actor, 'select-history-range');
            rangeOptions = findActor(indicator.menu.actor,
                'select-history-range-options');
        };

        rangeTrigger = findActor(indicator.menu.actor, 'select-history-range');
        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_space);
        rangeOptions = findActor(indicator.menu.actor,
            'select-history-range-options');
        assert(rangeOptions.visible && rangeOptions.is_mapped() &&
            hasState(rangeTrigger, Atk.StateType.EXPANDED) &&
            [...rangeOptions.get_children()].every(option => option.can_focus) &&
            global.stage.get_key_focus()?.get_name() ===
                'select-history-range-option-6h',
        'Space opens the list and focuses its selected option');
        await captureActor(() => indicator.menu.actor, RANGE_CAPTURES.dark);

        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_Escape);
        await waitFor(() => !indicator.menu.isOpen && !rangeOptions.visible,
            'Shell Escape closes the popup and resets the inline option list');

        const originalScheme = Main.sessionMode.colorScheme;
        setShellColorScheme('prefer-light');
        await Scripting.sleep(150);
        await reopenUsagePopup();
        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_space);
        rangeOptions = findActor(indicator.menu.actor,
            'select-history-range-options');
        await captureActor(() => indicator.menu.actor, RANGE_CAPTURES.light);
        await pressKey(keyboard, Clutter.KEY_Escape);
        await waitFor(() => !indicator.menu.isOpen && !rangeOptions.visible,
            'option Escape follows the native Shell popup-close behavior');

        setShellColorScheme(originalScheme);
        await Scripting.sleep(150);
        await reopenUsagePopup();
        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_space);
        const historySection = findActor(indicator.menu.actor, 'history-section');
        const isolatedForScale = [
            findActor(indicator.menu.actor, 'provider-card-claude'),
            findActor(indicator.menu.actor,
                'provider-card-history-eligibility-companion'),
            ...historySection.get_children().slice(1),
        ].filter(Boolean);
        for (const actor of isolatedForScale)
            actor.hide();
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const originalScale = themeContext.scale_factor;
        themeContext.set_scale_factor(2);
        await Scripting.sleep(150);
        await captureActor(() => indicator.menu.actor, RANGE_CAPTURES.scaled);
        themeContext.set_scale_factor(originalScale);
        for (const actor of isolatedForScale)
            actor.show();
        await Scripting.sleep(150);
        await pressKey(keyboard, Clutter.KEY_Escape);
        await waitFor(() => !indicator.menu.isOpen && !rangeOptions.visible,
            'scaled selector resets after Shell Escape');

        await reopenUsagePopup();
        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_Down);
        await pressKey(keyboard, Clutter.KEY_Down);
        assert(global.stage.get_key_focus()?.get_name() ===
            'select-history-range-option-1d',
        'Down moves to the next option');
        await pressKey(keyboard, Clutter.KEY_Home);
        assert(global.stage.get_key_focus()?.get_name() ===
            'select-history-range-option-1h',
        'Home focuses the first option');
        await pressKey(keyboard, Clutter.KEY_Up);
        assert(global.stage.get_key_focus()?.get_name() ===
            'select-history-range-option-30d',
        'Up wraps from the first option to the last');
        await pressKey(keyboard, Clutter.KEY_Down);
        assert(global.stage.get_key_focus()?.get_name() ===
            'select-history-range-option-1h',
        'Down wraps from the last option to the first');
        await pressKey(keyboard, Clutter.KEY_End);
        assert(global.stage.get_key_focus()?.get_name() ===
            'select-history-range-option-30d',
        'End focuses the last option');
        await pressKey(keyboard, Clutter.KEY_Escape);
        await waitFor(() => !indicator.menu.isOpen && !rangeOptions.visible,
            'navigation Escape closes and resets the popup');
        await reopenUsagePopup();
        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_Up);
        assert(global.stage.get_key_focus()?.get_name() ===
            'select-history-range-option-6h',
        'trigger Up opens on the selected option');
        await pressKey(keyboard, Clutter.KEY_Escape);
        await waitFor(() => !indicator.menu.isOpen && !rangeOptions.visible,
            'trigger Up path resets after Shell Escape');

        await reopenUsagePopup();
        rangeTrigger.grab_key_focus();
        await pressKey(keyboard, Clutter.KEY_Return);
        await pressKey(keyboard, Clutter.KEY_Home);
        await pressKey(keyboard, Clutter.KEY_space);
        await waitFor(() => extension.getSurfaceSnapshot().preferences
            .historyRange.id === '1h', 'Space selects the 1-hour range');
        rangeTrigger = findActor(indicator.menu.actor, 'select-history-range');
        assert(rangeSettings.get_enum('history-range') === 0 &&
            indicator.menu.isOpen && global.stage.get_key_focus() === rangeTrigger &&
            findActor(indicator.menu.actor, 'history-chart'),
        'changed selection persists and restores focus without closing the popup');

        await pressKey(keyboard, Clutter.KEY_Down);
        await pressKey(keyboard, Clutter.KEY_End);
        await pressKey(keyboard, Clutter.KEY_Return);
        await waitFor(() => findActor(indicator.menu.actor, 'history-empty'),
            'an uncovered range shows the empty state');
        rangeTrigger = findActor(indicator.menu.actor, 'select-history-range');
        assert(rangeSettings.get_enum('history-range') === 4 &&
            extension.getSurfaceSnapshot().preferences.historyRange.id === '30d' &&
            !findActor(indicator.menu.actor, 'history-chart') &&
            rangeTrigger && global.stage.get_key_focus() === rangeTrigger,
        'the uncovered range persists and keeps the selector as an escape');

        await pressKey(keyboard, Clutter.KEY_space);
        await pressKey(keyboard, Clutter.KEY_space);
        assert(rangeChanges === 2 && rangeSettings.get_enum('history-range') === 4 &&
            global.stage.get_key_focus() === rangeTrigger,
        'reselecting the active range closes without another durable change');

        await pressKey(keyboard, Clutter.KEY_Down);
        await pressKey(keyboard, Clutter.KEY_Home);
        await pressKey(keyboard, Clutter.KEY_Down);
        await pressKey(keyboard, Clutter.KEY_Return);
        await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
            'switching back to a covered range restores the chart');
        rangeTrigger = findActor(indicator.menu.actor, 'select-history-range');
        assert(rangeSettings.get_enum('history-range') === 1 &&
            extension.getSurfaceSnapshot().preferences.historyRange.id === '6h' &&
            rangeChanges === 3 && indicator.menu.isOpen &&
            global.stage.get_key_focus() === rangeTrigger,
        'restored range persists once and preserves popup focus ownership');
        assert(state.requests === requestsBeforeRangeInteraction &&
            historyText() === historyBeforeRangeInteraction,
        'all range interactions preserve provider requests and history bytes');
        rangeSettings.disconnect(rangeChangedId);

        findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'toggle-showUsageHistory'),
            'settings view exposes the local-history toggle');
        findActor(indicator.menu.actor, 'toggle-showUsageHistory').emit('clicked', 1);
        await Scripting.sleep(100);
        findActor(indicator.menu.actor, 'back-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'provider-card-claude'),
            'return to the usage view');
        assert(!findActor(indicator.menu.actor, 'history-chart'),
            'disabling local history removes the chart');
        assert(findActor(indicator.menu.actor, 'provider-card-claude'),
            'the current-value provider card stays live');
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
