import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');

const UUID = 'claudex-usage@hugo.local';
const CAPTURES = [
    'surface-settings-dark-100.png',
    'surface-settings-toggle-off-focus-hover.png',
    'surface-settings-cadence-focus-hover.png',
    'surface-settings-light-100.png',
];

export const METRICS = {};
export function init() {}

function assert(condition, message) {
    if (!condition)
        throw new Error(`J-003 failed: ${message}`);
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

function findClass(root, fragment) {
    if (!root)
        return null;
    if ((root.style_class ?? '').includes(fragment))
        return root;
    for (const child of root.get_children?.() ?? []) {
        const found = findClass(child, fragment);
        if (found)
            return found;
    }
    return null;
}

function findClasses(root, fragment, result = []) {
    if (!root)
        return result;
    if ((root.style_class ?? '').includes(fragment))
        result.push(root);
    for (const child of root.get_children?.() ?? [])
        findClasses(child, fragment, result);
    return result;
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
    return Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent()
        .get_child('design').get_child('captures');
}

async function captureActor(actor, filename) {
    const directory = captureDirectory();
    if (!directory.query_exists(null)) {
        directory.make_directory_with_parents(null);
    }
    let geometry = null;
    for (let attempt = 0; attempt < 60; attempt++) {
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        if (actor.is_mapped() && Number.isFinite(x) && Number.isFinite(y) &&
            width > 0 && height > 0) {
            geometry = {x, y, width, height};
            break;
        }
        await Scripting.sleep(80);
    }
    assert(geometry, `${filename} actor has no capturable geometry`);
    const {x, y, width, height} = geometry;
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(Math.max(0, Math.floor(x - 8)),
        Math.max(0, Math.floor(y - 8)), Math.ceil(width + 16), Math.ceil(height + 16), stream);
    stream.close(null);
}

async function settle() {
    await Scripting.sleep(260);
}

function provider({id, order, label, detail, windows, readings, refreshCounts}) {
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
        windows,
        isEligible: () => true,
        subscribeEligibility: callback => {
            listener = callback;
            return () => {
                listener = null;
            };
        },
        refresh: async () => {
            refreshCounts[id] = (refreshCounts[id] ?? 0) + 1;
            return {status: 'available', readings};
        },
    };
}

function registerFixtures(extension, nowMs) {
    const refreshCounts = {};
    const removers = [
        extension.registerProvider(provider({
            id: 'claude', order: 0, label: 'Claude', detail: 'Two usage windows',
            windows: [
                {
                    id: 'short',
                    label: '5-hour window',
                    dataRole: 'dataClaudeShort',
                    durationMs: 5 * 3600000,
                },
                {
                    id: 'weekly',
                    label: 'Weekly window',
                    dataRole: 'dataClaudeWeekly',
                    durationMs: 7 * 86400000,
                },
            ],
            readings: [
                {id: 'short', percent: 8, resetAtMs: nowMs + 3 * 3600000},
                {id: 'weekly', percent: 68, resetAtMs: nowMs + 4 * 86400000},
            ],
            refreshCounts,
        })),
        extension.registerProvider(provider({
            id: 'codex', order: 1, label: 'Codex', detail: 'Weekly usage window',
            windows: [{
                id: 'weekly',
                label: 'Weekly window',
                dataRole: 'dataCodexWeekly',
                durationMs: 7 * 86400000,
            }],
            readings: [{id: 'weekly', percent: 42,
                resetAtMs: nowMs + 4 * 86400000}],
            refreshCounts,
        })),
    ];
    return {removers, refreshCounts};
}

function preferences(snapshot) {
    return snapshot.preferences;
}

async function writePhase(extension, indicator, refreshCounts) {
    const initial = preferences(extension.getSurfaceSnapshot());
    assert(initial.visibility.dataClaudeShort === false &&
        initial.visibility.dataClaudeWeekly === true &&
        initial.visibility.dataCodexWeekly === false &&
        initial.refreshInterval.ms === 900000 &&
        initial.localHistory === false && initial.historyRange.id === '7d',
    'legacy visibility, cadence, and history preferences survive the additive schema');
    assert(initial.usageDisplay.id === 'used' &&
        extension._settings.get_user_value('usage-display') === null,
    'a legacy backend with no usage-display key resolves to Used without writing it');
    assert(initial.timePace === true &&
        extension._settings.get_user_value('show-time-pace') === null,
    'a legacy backend with no Time pace key resolves on without writing it');
    assert(initial.weeklyPace.id === 'every-day' &&
        extension._settings.get_user_value('weekly-pace') === null,
    'a legacy backend with no weekly pace key resolves to Every day without writing it');
    let icons = findClasses(findActor(indicator, 'claudex-live-panel'),
        'claudex-panel-provider-icon');
    assert(icons[0]?.get_accessible_name() === 'Claude mark, 68 percent used' &&
        icons[1]?.get_accessible_name() === 'Codex mark, no panel percentages',
    'the additive default names the Used basis in the panel');

    const beforeNormalize = {...refreshCounts};
    extension._settings.set_boolean('show-claude-short', true);
    extension._settings.set_boolean('show-codex-weekly', true);
    extension._settings.set_enum('refresh-interval', 0);
    extension._settings.set_boolean('show-usage-history', true);
    extension._settings.set_enum('history-range', 1);
    await settle();
    assert(JSON.stringify(refreshCounts) === JSON.stringify(beforeNormalize),
        'normalizing legacy preferences does not refresh providers');

    indicator.menu.open();
    await settle();
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    let popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(popover?.is_mapped() && collectLabelText(popover).includes('Settings'),
        'gear opens the in-place settings view');
    assert(!findActor(popover, 'history-chart') &&
        !collectLabelText(popover).includes('Keep local usage history'),
        'settings omits deferred history controls');
    let usedChoice = findActor(popover, 'usage-display-choice');
    assert(usedChoice.get_accessible_name() === 'Usage display, Used' &&
        collectLabelText(usedChoice).includes('Used  ›'),
    'settings exposes the default Used display choice');
    assert(findActor(popover, 'toggle-showTimePace').checked,
        'settings exposes the default-on Time pace switch');
    const weeklyPaceChoice = findActor(popover, 'weekly-pace-choice');
    assert(weeklyPaceChoice.get_accessible_name() === 'Weekly pace, Every day' &&
        collectLabelText(weeklyPaceChoice).includes('Every day  ›'),
    'settings places the default weekly pace choice beneath Time pace');
    await captureActor(indicator.menu.actor, CAPTURES[0]);

    const beforePaceChange = {...refreshCounts};
    findActor(popover, 'toggle-showTimePace').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).timePace === false &&
        findActor(popover, 'toggle-showTimePace').checked === false &&
        JSON.stringify(refreshCounts) === JSON.stringify(beforePaceChange),
    'Time pace turns off in place without refreshing a provider');
    findActor(popover, 'back-button').emit('clicked', 1);
    await settle();
    assert(!findActor(indicator.menu.actor, 'pace-claude--short') &&
        !findActor(indicator.menu.actor, 'pace-claude--weekly') &&
        !findActor(indicator.menu.actor, 'pace-codex--weekly'),
    'turning Time pace off removes every current marker');
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    findActor(popover, 'toggle-showTimePace').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).timePace === true &&
        findActor(popover, 'toggle-showTimePace').checked &&
        JSON.stringify(refreshCounts) === JSON.stringify(beforePaceChange),
    'Time pace turns back on without refreshing a provider');

    const beforeDisplayChange = {...refreshCounts};
    usedChoice = findActor(popover, 'usage-display-choice');
    usedChoice.emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(indicator.menu.isOpen &&
        preferences(extension.getSurfaceSnapshot()).usageDisplay.id === 'left' &&
        findActor(popover, 'usage-display-choice').get_accessible_name() ===
            'Usage display, Left' &&
        JSON.stringify(refreshCounts) === JSON.stringify(beforeDisplayChange),
    'Left applies in place without refreshing a provider');
    const panel = findActor(indicator, 'claudex-live-panel');
    const panelText = collectLabelText(panel).join(' ');
    icons = findClasses(panel, 'claudex-panel-provider-icon');
    assert(panelText.includes('92%') && panelText.includes('32%') &&
        panelText.includes('58%') &&
        icons[0]?.get_accessible_name() ===
            'Claude mark, 92 percent left, 32 percent left' &&
        icons[1]?.get_accessible_name() === 'Codex mark, 58 percent left',
    'Left immediately complements panel values and names their basis');

    findActor(popover, 'back-button').emit('clicked', 1);
    await settle();
    let usageText = collectLabelText(indicator.menu.actor).join(' ');
    const shortProgress = findActor(indicator.menu.actor, 'progress-claude--short');
    const shortFill = findActor(shortProgress, 'progress-fill-claude--short');
    const shortPace = findActor(shortProgress, 'pace-claude--short');
    assert(indicator.menu.isOpen && usageText.includes('USAGE') &&
        usageText.includes('92%') && usageText.includes('32%') &&
        usageText.includes('58%'),
    'back shows every complemented popup value');
    assert(shortFill.width === 291,
        'back shows complemented popup progress geometry');
    assert(shortPace?.x === 189 &&
        shortProgress.get_accessible_name() ===
            'Claude 5-hour window at 92 percent left; Time pace 60 percent left',
    'back complements Time pace geometry and accessibility with the display basis');
    const weeklyProgress = findActor(indicator.menu.actor,
        'progress-claude--weekly');
    assert(findActor(weeklyProgress, 'pace-claude--weekly')?.x === 180 &&
        weeklyProgress.get_accessible_name() ===
            'Claude Weekly window at 32 percent left; Time pace 57 percent left',
    'Every day remains the default weekly pace basis');
    const rawProviders = extension.getSurfaceSnapshot().providers;
    assert(rawProviders[0].metrics[0].percent === 8 &&
        rawProviders[0].metrics[1].percent === 68 &&
        rawProviders[1].metrics[0].percent === 42,
    'the surface snapshot remains canonical Used data');
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');

    const beforeWeeklyPaceChange = {...refreshCounts};
    findActor(popover, 'weekly-pace-choice').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).weeklyPace.id === 'weekdays' &&
        findActor(popover, 'weekly-pace-choice').get_accessible_name() ===
            'Weekly pace, Weekdays' &&
        JSON.stringify(refreshCounts) === JSON.stringify(beforeWeeklyPaceChange),
    'Weekdays applies in place without refreshing a provider');
    findActor(popover, 'back-button').emit('clicked', 1);
    await settle();
    const weekdayShortProgress = findActor(indicator.menu.actor,
        'progress-claude--short');
    const weekdayWeeklyProgress = findActor(indicator.menu.actor,
        'progress-claude--weekly');
    assert(findActor(weekdayShortProgress, 'pace-claude--short')?.x === 189 &&
        weekdayShortProgress.get_accessible_name() ===
            'Claude 5-hour window at 92 percent left; Time pace 60 percent left',
    'Weekdays leaves the rolling 5-hour pace unchanged');
    assert(findActor(weekdayWeeklyProgress, 'pace-claude--weekly')?.x === 220 &&
        weekdayWeeklyProgress.get_accessible_name() ===
            'Claude Weekly window at 32 percent left; Time pace 70 percent left',
    'Weekdays compresses the weekly provider window onto local weekdays');
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');

    findActor(popover, 'toggle-showClaudeShort').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    findActor(popover, 'toggle-showClaudeWeekly').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const visibilityPanel = findActor(indicator, 'claudex-live-panel');
    assert(indicator.menu.isOpen &&
        !collectLabelText(visibilityPanel).join(' ').includes('92%') &&
        !collectLabelText(visibilityPanel).join(' ').includes('32%') &&
        collectLabelText(visibilityPanel).join(' ').includes('58%') &&
        findClass(visibilityPanel, 'muted'),
    'visibility updates panel immediately and preserves a muted Claude mark');
    findActor(popover, 'toggle-showCodexWeekly').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(!collectLabelText(findActor(indicator, 'claudex-live-panel')).join(' ').match(/\d+%/) &&
        findClass(findActor(indicator, 'claudex-live-panel'), 'muted'),
    'all hidden limits retain muted eligible-provider marks without metrics');
    findActor(popover, 'toggle-showCodexWeekly').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const toggle = findActor(popover, 'toggle-showClaudeWeekly');
    toggle.add_style_pseudo_class('hover');
    toggle.grab_key_focus();
    await captureActor(indicator.menu.actor, CAPTURES[1]);
    toggle.remove_style_pseudo_class('hover');

    const choice = findActor(popover, 'refresh-interval-choice');
    choice.emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).refreshInterval.ms === 600000 &&
        collectLabelText(popover).some(text => text.includes('10 min')),
    'cadence choice persists and applies to the live controller');
    const focusedChoice = findActor(popover, 'refresh-interval-choice');
    focusedChoice.add_style_pseudo_class('hover');
    focusedChoice.grab_key_focus();
    await captureActor(indicator.menu.actor, CAPTURES[2]);
    focusedChoice.remove_style_pseudo_class('hover');

    const beforeFinalPaceChange = {...refreshCounts};
    findActor(popover, 'toggle-showTimePace').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).timePace === false &&
        findActor(popover, 'toggle-showTimePace').checked === false &&
        JSON.stringify(refreshCounts) === JSON.stringify(beforeFinalPaceChange),
    'the final Time pace choice persists without provider activity');

    const scheme = Main.sessionMode.colorScheme;
    Main.sessionMode.colorScheme = 'prefer-light';
    St.Settings.get().notify('color-scheme');
    await settle();
    await captureActor(indicator.menu.actor, CAPTURES[3]);
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}

async function readPhase(extension, indicator, refreshCounts) {
    const snapshot = extension.getSurfaceSnapshot();
    assert(preferences(snapshot).visibility.dataClaudeShort === false &&
        preferences(snapshot).visibility.dataClaudeWeekly === false &&
        preferences(snapshot).visibility.dataCodexWeekly === true &&
        preferences(snapshot).refreshInterval.ms === 600000 &&
        preferences(snapshot).localHistory === true &&
        preferences(snapshot).historyRange.id === '6h' &&
        preferences(snapshot).usageDisplay.id === 'left' &&
        preferences(snapshot).timePace === false &&
        preferences(snapshot).weeklyPace.id === 'weekdays',
    'fresh Shell restores every persisted preference');
    const panel = findActor(indicator, 'claudex-live-panel');
    const panelIcons = findClasses(panel, 'claudex-panel-provider-icon');
    assert(!collectLabelText(panel).join(' ').includes('92%') &&
        !collectLabelText(panel).join(' ').includes('32%') &&
        collectLabelText(panel).join(' ').includes('58%') &&
        panelIcons[1]?.get_accessible_name() === 'Codex mark, 58 percent left' &&
        findClass(panel, 'muted'),
    'restored settings control the new session panel');
    indicator.menu.open();
    await settle();
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    let popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(collectLabelText(popover).some(text => text.includes('10 min')) &&
        findActor(popover, 'toggle-showClaudeShort').checked === false &&
        findActor(popover, 'toggle-showClaudeWeekly').checked === false &&
        findActor(popover, 'toggle-showTimePace').checked === false &&
        findActor(popover, 'usage-display-choice').get_accessible_name() ===
            'Usage display, Left' &&
        findActor(popover, 'weekly-pace-choice').get_accessible_name() ===
            'Weekly pace, Weekdays',
    'restored settings are rendered in the fresh popup');
    findActor(popover, 'back-button').emit('clicked', 1);
    await settle();
    assert(!findActor(indicator.menu.actor, 'pace-codex--weekly'),
        'the restored off choice omits Time pace markers');
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const beforePaceChange = {...refreshCounts};
    findActor(popover, 'toggle-showTimePace').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).timePace === true &&
        findActor(popover, 'toggle-showTimePace').checked &&
        JSON.stringify(refreshCounts) === JSON.stringify(beforePaceChange),
    'the fresh session can restore Time pace without refreshing providers');
    findActor(popover, 'back-button').emit('clicked', 1);
    await settle();
    const codexProgress = findActor(indicator.menu.actor, 'progress-codex--weekly');
    assert(findActor(codexProgress, 'pace-codex--weekly') &&
        codexProgress.get_accessible_name() ===
            'Codex Weekly window at 58 percent left; Time pace 70 percent left',
    'restored popup accessibility and geometry use the persisted Left basis');
}

export async function run() {
    await settle();
    const extension = Main.extensionManager.lookup(UUID)?.stateObj;
    assert(extension, 'production extension is enabled');
    const productionClock = extension._now;
    const nowMs = new Date(2026, 6, 21, 12).getTime();
    extension._now = () => nowMs;
    const historyRoot = GLib.getenv('CLAUDEX_HISTORY_DIR');
    assert(historyRoot && GLib.path_is_absolute(historyRoot) &&
        historyRoot !== GLib.build_filenamev([
            GLib.get_user_data_dir(), 'claudex-usage',
        ]),
    'settings journey keeps any enabled history writes in its isolated directory');
    const {removers, refreshCounts} = registerFixtures(extension, nowMs);
    await settle();
    const indicator = Main.panel.statusArea[UUID];
    assert(indicator, 'eligible providers create the surface');
    if (GLib.getenv('CLAUDEX_J003_PHASE') === 'restore')
        await readPhase(extension, indicator, refreshCounts);
    else
        await writePhase(extension, indicator, refreshCounts);
    removers.forEach(remove => remove());
    extension._now = productionClock;
}
