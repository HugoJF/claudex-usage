import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');

const UUID = 'claudex-usage@hugo.local';
const EXPECTED_CAPTURES = [
    'surface-panel-dark-100.png',
    'surface-popup-dark-100.png',
    'surface-refresh-focus-hover.png',
    'surface-unavailable-popup.png',
    'surface-panel-light-100.png',
    'surface-panel-dark-200.png',
];

export const METRICS = {};

export function init() {
    console.log('J-002: automation module loaded');
}

function assert(condition, message) {
    if (!condition)
        throw new Error(`J-002 failed: ${message}`);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

function findActor(root, name) {
    if (!root)
        return null;
    if (root.get_name?.() === name)
        return root;
    for (const child of root.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found)
            return found;
    }
    return null;
}

function collectLabelText(root, result = []) {
    if (!root)
        return result;
    if (root instanceof St.Label)
        result.push(root.text);
    for (const child of root.get_children?.() ?? [])
        collectLabelText(child, result);
    return result;
}

function captureDirectory() {
    const override = GLib.getenv('CLAUDEX_CAPTURE_DIR');
    if (override)
        return Gio.File.new_for_path(override);
    const repo = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent();
    return repo.get_child('design').get_child('captures');
}

async function captureActor(target, filename, padding = 8) {
    let actor = null;
    let actorWidth = 0;
    let actorHeight = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
        actor = typeof target === 'function' ? target() : target;
        if (actor?.is_mapped())
            [actorWidth, actorHeight] = actor.get_transformed_size();
        if (actorWidth > 0 && actorHeight > 0)
            break;
        await Scripting.sleep(50);
    }
    assert(actor?.is_mapped(), `${filename} actor is not mapped`);
    assert(actorWidth > 0 && actorHeight > 0,
        `${filename} actor has no allocated geometry`);
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        directory.make_directory_with_parents(null);
    const [actorX, actorY] = actor.get_transformed_position();
    const x = Math.max(0, Math.floor(actorX - padding));
    const y = Math.max(0, Math.floor(actorY - padding));
    const width = Math.min(global.screen_width - x, Math.ceil(actorWidth + padding * 2));
    const height = Math.min(global.screen_height - y, Math.ceil(actorHeight + padding * 2));
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(x, y, width, height, stream);
    stream.close(null);
}

async function settle() {
    await Scripting.sleep(260);
}

function setShellColorScheme(scheme) {
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}

function usageProvider({id, order, label, detail, window, reading, refresh}) {
    let eligible = true;
    let listener = null;
    return {
        id,
        order,
        label,
        detail,
        marks: {
            darkPanel: `icons/${id}.svg`,
            lightPanel: `icons/${id}-light.svg`,
            popup: `icons/${id}.svg`,
            accessibleName: `${label} mark`,
        },
        windows: [window],
        isEligible: () => eligible,
        subscribeEligibility: callback => {
            listener = callback;
            return () => {
                listener = null;
            };
        },
        refresh: refresh ?? (async () => ({status: 'available', readings: [reading()]})),
        setEligible(value) {
            eligible = value;
            listener?.(value);
        },
    };
}

export async function run() {
    await settle();
    const record = Main.extensionManager.lookup(UUID);
    const extension = record?.stateObj;
    assert(extension, 'production extension is installed and enabled');
    assert(!Main.panel.statusArea[UUID], 'provider-free production package has no panel item');
    assert(extension.getSurfaceSnapshot().visible === false,
        'provider-free production package schedules no visible work');

    let claudePercent = 8;
    let claudeReset = Date.now() + 3 * 60 * 60 * 1000 + 50 * 60 * 1000;
    let claudeDeferred = null;
    let claudeCalls = 0;
    const claude = usageProvider({
        id: 'claude',
        order: 0,
        label: 'Claude',
        detail: '5-hour usage window',
        window: {id: 'short', label: '5-hour window', dataRole: 'dataClaudeShort'},
        reading: () => ({id: 'short', percent: claudePercent, resetAtMs: claudeReset}),
        refresh: () => {
            claudeCalls++;
            return claudeDeferred?.promise ?? Promise.resolve({
                status: 'available',
                readings: [{id: 'short', percent: claudePercent, resetAtMs: claudeReset}],
            });
        },
    });
    claude.setEligible(false);
    let codexUnavailable = false;
    let codexPercent = 41;
    let codexCalls = 0;
    const codex = usageProvider({
        id: 'codex',
        order: 1,
        label: 'Codex',
        detail: 'Weekly usage window',
        window: {id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'},
        reading: () => ({id: 'weekly', percent: codexPercent,
            resetAtMs: Date.now() + 4 * 86400000}),
        refresh: () => {
            codexCalls++;
            return codexUnavailable
                ? Promise.reject(new Error('provider response deliberately hidden'))
                : Promise.resolve({status: 'available', readings: [{
                    id: 'weekly', percent: codexPercent,
                    resetAtMs: Date.now() + 4 * 86400000,
                }]});
        },
    });
    const removeClaude = extension.registerProvider(claude);
    const removeCodex = extension.registerProvider(codex);
    await settle();
    assert(codexCalls === 1 && claudeCalls === 0,
        'the initially eligible provider settles before Claude appears');
    codexPercent = 42;
    claude.setEligible(true);
    await settle();

    let indicator = Main.panel.statusArea[UUID];
    assert(indicator, 'eligible stubs create one unified panel item');
    const snapshot = extension.getSurfaceSnapshot();
    assert(snapshot.providers.length === 2 && snapshot.providers.every(item =>
        item.availability === 'available'), 'both provider results settle independently');
    assert(claudeCalls === 1 && codexCalls === 2 &&
        snapshot.providers.find(item => item.id === 'codex')?.metrics[0]?.percent === 42,
    'new Claude eligibility immediately runs one full shared refresh cycle');
    const panel = findActor(indicator, 'claudex-live-panel');
    assert(panel.height <= Main.panel.height, 'unified panel stays at native height');
    assert(collectLabelText(panel).join(' ').includes('8%') &&
        collectLabelText(panel).join(' ').includes('42%'),
    'panel exposes both textual percentages');
    await captureActor(panel, EXPECTED_CAPTURES[0], 6);

    indicator.menu.open();
    await settle();
    assert(indicator.menu.isOpen, 'Shell popup menu opens before capture');
    let popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(popover?.is_mapped(), 'usage popup maps before capture');
    let text = collectLabelText(popover);
    for (const expected of ['Claude', 'Codex', '5-hour window', 'Weekly window',
        '8%', '42%', 'Resets in']) {
        assert(text.some(value => value.includes(expected)), `popup includes ${expected}`);
    }
    const fill = findActor(popover, 'progress-fill-claude--short');
    assert(fill.width === 25, 'percentage uses the canonical zero-origin bar geometry');
    assert(fill.get_parent().accessible_role === Atk.Role.PROGRESS_BAR,
        'usage bar has a progress accessibility role');
    assert(!findActor(popover, 'history-chart') && findActor(popover, 'settings-button'),
        'SURF-003 adds settings without adding history');
    await captureActor(indicator.menu.actor, EXPECTED_CAPTURES[1]);

    claudeDeferred = deferred();
    findActor(popover, 'refresh-button').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(collectLabelText(popover).includes('Refreshing…'),
        'manual refresh visibly enters its in-place pending state');
    const refreshButton = findActor(popover, 'refresh-button');
    refreshButton.add_style_pseudo_class('hover');
    refreshButton.grab_key_focus();
    await captureActor(indicator.menu.actor, EXPECTED_CAPTURES[2]);
    refreshButton.remove_style_pseudo_class('hover');
    claudePercent = 28;
    claudeReset = Date.now() + 55 * 60 * 1000;
    claudeDeferred.resolve({status: 'available', readings: [
        {id: 'short', percent: claudePercent, resetAtMs: claudeReset},
    ]});
    claudeDeferred = null;
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(indicator.menu.isOpen && collectLabelText(popover).includes('Updated just now'),
        'manual refresh updates values and freshness without closing the popup');
    assert(collectLabelText(popover).includes('28%'), 'manual refresh changes visible values');

    codexUnavailable = true;
    extension.refresh();
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const codexCard = findActor(popover, 'provider-card-codex');
    assert(collectLabelText(codexCard).includes('Usage unavailable'),
        'failed provider presents the unavailable treatment');
    assert(!collectLabelText(codexCard).some(value => value.includes('42%') ||
        value.startsWith('Resets')), 'unavailable card drops every stale metric');
    assert(collectLabelText(findActor(popover, 'provider-card-claude')).includes('28%'),
        'other provider remains live when one provider fails');
    await captureActor(indicator.menu.actor, EXPECTED_CAPTURES[3]);

    indicator.menu.close();
    const originalScheme = Main.sessionMode.colorScheme;
    setShellColorScheme('prefer-light');
    await settle();
    indicator = Main.panel.statusArea[UUID];
    await captureActor(findActor(indicator, 'claudex-live-panel'), EXPECTED_CAPTURES[4], 6);
    setShellColorScheme(originalScheme);
    await settle();
    const themeContext = St.ThemeContext.get_for_stage(global.stage);
    const originalScale = themeContext.scale_factor;
    themeContext.set_scale_factor(2);
    await settle();
    await captureActor(
        () => findActor(Main.panel.statusArea[UUID], 'claudex-live-panel'),
        EXPECTED_CAPTURES[5], 6);
    themeContext.set_scale_factor(originalScale);
    await settle();

    claudeDeferred = deferred();
    extension.refresh();
    await settle();
    claude.setEligible(false);
    codex.setEligible(false);
    assert(!Main.panel.statusArea[UUID],
        'last provider ineligibility removes the status-area entry');
    claudeDeferred.resolve({status: 'available', readings: [
        {id: 'short', percent: 99, resetAtMs: Date.now() + 60000},
    ]});
    claudeDeferred = null;
    await settle();
    assert(!Main.panel.statusArea[UUID] && !extension.getSurfaceSnapshot().visible,
        'late completion cannot recreate an absent panel item');
    removeClaude();
    removeCodex();
}
