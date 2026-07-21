import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');

const UUID = 'claudex-usage-design@hugo.local';
const EXPECTED_CAPTURES = [
    'panel-dark-100.png',
    'usage-dark-100.png',
    'usage-range-7d-focus-hover.png',
    'settings-dark-100.png',
    'settings-toggle-off-focus-hover.png',
    'panel-visibility-off.png',
    'panel-light-100.png',
    'panel-dark-200.png',
    'usage-refinement-a-panel-dark-100.png',
    'usage-refinement-a-popup-dark-100.png',
    'usage-refinement-a-settings-dark-100.png',
    'usage-refinement-b-panel-dark-100.png',
    'usage-refinement-b-popup-dark-100.png',
    'usage-refinement-c-panel-dark-100.png',
    'usage-refinement-c-popup-dark-100.png',
];

export const METRICS = {};

export function init() {
    console.log('J-001: automation module loaded');
}

function assert(condition, message) {
    if (!condition)
        throw new Error(`J-001 failed: ${message}`);
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

async function settle() {
    await Scripting.sleep(180);
}

function captureDirectory() {
    const override = GLib.getenv('CLAUDEX_CAPTURE_DIR');
    if (override)
        return Gio.File.new_for_path(override);
    const repo = Gio.File.new_for_uri(import.meta.url)
        .get_parent()
        .get_parent()
        .get_parent();
    return repo.get_child('design').get_child('captures');
}

async function captureActor(actorSource, filename, padding = 8,
    useAllocation = false) {
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        directory.make_directory_with_parents(null);

    const getActor = typeof actorSource === 'function'
        ? actorSource
        : () => actorSource;
    let actor = null;
    let geometry = null;
    for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = getActor();
        if (candidate?.is_mapped()) {
            if (!useAllocation) {
                const [actorX, actorY] = candidate.get_transformed_position();
                const [actorWidth, actorHeight] = candidate.get_transformed_size();
                if (Number.isFinite(actorX) && Number.isFinite(actorY) &&
                    actorWidth > 0 && actorHeight > 0) {
                    actor = candidate;
                    geometry = {actorX, actorY, actorWidth, actorHeight};
                    break;
                }
            }
            if (useAllocation) {
                let child = candidate;
                let ancestor = child.get_parent();
                let offsetX = child.x;
                let offsetY = child.y;
                while (ancestor) {
                    const [ancestorX, ancestorY] = ancestor.get_transformed_position();
                    if (Number.isFinite(ancestorX) && Number.isFinite(ancestorY) &&
                        candidate.width > 0 && candidate.height > 0) {
                        actor = candidate;
                        geometry = {
                            actorX: ancestorX + offsetX,
                            actorY: ancestorY + offsetY,
                            actorWidth: candidate.width,
                            actorHeight: candidate.height,
                        };
                        break;
                    }
                    child = ancestor;
                    ancestor = child.get_parent();
                    offsetX += child.x;
                    offsetY += child.y;
                }
                if (geometry) {
                    break;
                }
            }
        }
        await Scripting.sleep(80);
    }
    assert(actor?.is_mapped(), `${filename} actor is not mapped`);
    assert(geometry, `${filename} capture has empty geometry`);

    const {actorX, actorY, actorWidth, actorHeight} = geometry;
    const x = Math.max(0, Math.floor(actorX - padding));
    const y = Math.max(0, Math.floor(actorY - padding));
    const width = Math.min(global.screen_width - x,
        Math.ceil(actorWidth + padding * 2));
    const height = Math.min(global.screen_height - y,
        Math.ceil(actorHeight + padding * 2));

    const file = directory.get_child(filename);
    const stream = file.replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(x, y, width, height, stream);
    stream.close(null);
}

function click(actor, description) {
    assert(actor, `${description} actor exists`);
    actor.emit('clicked', 1);
}

function setShellColorScheme(scheme) {
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}

export async function run() {
    console.log('J-001: journey started');
    await settle();

    const extension = Main.extensionManager.lookup(UUID);
    assert(extension?.stateObj, 'catalog extension is installed and enabled');
    const catalog = extension.stateObj;
    let actors = catalog.getCatalogActors();
    assert(actors.indicator === Main.panel.statusArea[UUID],
        'catalog owns the registered panel indicator');
    assert(actors.panel.height <= Main.panel.height,
        'panel indicator stays within the native panel height');
    assert(collectLabelText(actors.panel).join(' ').includes('8% · 68%'),
        'panel shows both Claude percentages');
    assert(collectLabelText(actors.panel).join(' ').includes('42%'),
        'panel shows the Codex weekly percentage');
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[0], 6, true);
    await settle();

    assert(!actors.indicator.menu.isEmpty(), 'Shell popup contains the catalog');
    actors.indicator.menu.open();
    await settle();
    actors = catalog.getCatalogActors();
    assert(actors.indicator.menu.isOpen, 'Shell popup menu opens');
    const usageText = collectLabelText(actors.popover);
    for (const expected of ['Claude 5-hour', 'Claude weekly', 'Codex weekly',
        '100%', '75%', '50%', '25%', '0%']) {
        assert(usageText.includes(expected), `usage popup includes ${expected}`);
    }
    assert(findActor(actors.popover, 'history-chart'),
        'usage popup includes the merged chart');
    const shortFill = findActor(actors.popover, 'progress-fill-claudeShort');
    const weeklyFill = findActor(actors.popover, 'progress-fill-claudeWeekly');
    assert(shortFill.width === 25, 'Claude 5-hour bar uses exact 8% geometry');
    assert(weeklyFill.width === 215, 'Claude weekly bar uses exact 68% geometry');
    const settingsButton = findActor(actors.popover, 'settings-button');
    assert(settingsButton.get_accessible_name() === 'Open settings',
        'settings action has an accessible name');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[1]);

    const range = findActor(actors.popover, 'range-7d');
    click(range, '7-day range');
    await settle();
    actors = catalog.getCatalogActors();
    assert(catalog.getCatalogSnapshot().activeRange === '7d',
        'range selection updates process-local state');
    assert(actors.indicator.menu.isOpen,
        'range selection does not close the Shell popup');
    const selectedRange = findActor(actors.popover, 'range-7d');
    selectedRange.add_style_pseudo_class('hover');
    selectedRange.grab_key_focus();
    assert(global.stage.get_key_focus() === selectedRange,
        'range control accepts keyboard focus');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[2]);
    selectedRange.remove_style_pseudo_class('hover');

    click(findActor(actors.popover, 'settings-button'), 'settings');
    await settle();
    actors = catalog.getCatalogActors();
    assert(catalog.getCatalogSnapshot().view === 'settings',
        'settings opens in the current Shell popup');
    assert(actors.indicator.menu.isOpen,
        'settings replaces the popup content in place');
    const settingsText = collectLabelText(actors.popover);
    for (const expected of ['Claude 5-hour', 'Claude weekly', 'Codex weekly',
        'Only while providers are present', 'Keep local usage history']) {
        assert(settingsText.includes(expected), `settings includes ${expected}`);
    }
    const claudeShortToggle = findActor(actors.popover, 'toggle-showClaudeShort');
    assert(claudeShortToggle.accessible_role === Atk.Role.SWITCH,
        'custom switch row exposes the switch role');
    assert(claudeShortToggle.checked,
        'custom switch row exposes its checked state');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[3]);

    click(claudeShortToggle, 'Claude 5-hour visibility switch');
    await settle();
    actors = catalog.getCatalogActors();
    assert(catalog.getCatalogSnapshot().showClaudeShort === false,
        'visibility switch updates process-local state');
    assert(actors.indicator.menu.isOpen,
        'visibility switch leaves the settings popup open');
    const offToggle = findActor(actors.popover, 'toggle-showClaudeShort');
    assert(!offToggle.checked, 'off switch exposes an unchecked state');
    offToggle.add_style_pseudo_class('hover');
    offToggle.grab_key_focus();
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[4]);
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[5], 6, true);
    offToggle.remove_style_pseudo_class('hover');

    click(offToggle, 'Claude 5-hour visibility switch restore');
    await settle();
    actors = catalog.getCatalogActors();
    actors.indicator.menu.close();
    await settle();

    catalog.showRefinementVariant('a');
    await settle();
    actors = catalog.getCatalogActors();
    assert(collectLabelText(actors.panel).join(' ').includes('8% · 68%'),
        'variant A keeps compact percentages');
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[8], 6, true);
    actors.indicator.menu.open();
    await settle();
    actors = catalog.getCatalogActors();
    assert(findActor(actors.popover, 'refinement-refresh-button')
        .get_accessible_name() === 'Refresh usage',
    'variant A moves refresh beside settings');
    assert(findActor(actors.popover, 'refinement-range-select')
        .accessible_role === Atk.Role.COMBO_BOX,
    'variant A exposes the compact range as a select');
    assert(findActor(actors.popover, 'pace-claudeShort'),
        'variant A shows a Time pace marker');
    assert(!collectLabelText(findActor(actors.popover, 'refinement-provider-claude'))
        .includes('Two usage windows'),
    'variant A removes redundant provider detail');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[9]);
    click(findActor(actors.popover, 'settings-button'), 'variant A settings');
    await settle();
    actors = catalog.getCatalogActors();
    const paceToggle = findActor(actors.popover, 'toggle-timePace');
    assert(paceToggle?.checked &&
        collectLabelText(actors.popover).includes('Time pace markers'),
    'variant A settings expose Time pace enabled by default');
    const weeklyPace = findActor(actors.popover, 'weekly-pace-choice');
    assert(weeklyPace?.get_accessible_name() === 'Weekly pace, Every day' &&
        collectLabelText(weeklyPace).includes('Every day  ›'),
    'variant A places the default weekly pace choice beneath Time pace');
    click(weeklyPace, 'weekday pace');
    await settle();
    actors = catalog.getCatalogActors();
    assert(findActor(actors.popover, 'weekly-pace-choice')?.get_accessible_name() ===
        'Weekly pace, Weekdays',
    'weekly pace choice exposes its alternate state in place');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[10]);
    click(findActor(actors.popover, 'toggle-timePace'), 'Time pace off');
    await settle();
    actors = catalog.getCatalogActors();
    click(findActor(actors.popover, 'back-button'), 'variant A settings back');
    await settle();
    actors = catalog.getCatalogActors();
    assert(!findActor(actors.popover, 'pace-claudeShort'),
        'Time pace setting removes every marker');
    actors.indicator.menu.close();
    await settle();

    catalog.showRefinementVariant('b');
    await settle();
    actors = catalog.getCatalogActors();
    assert(collectLabelText(actors.panel).join(' ').includes('5h 8% · 68%'),
        'variant B labels the compact 5-hour value');
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[11], 6, true);
    actors.indicator.menu.open();
    await settle();
    actors = catalog.getCatalogActors();
    assert(collectLabelText(actors.popover).includes('Refreshing…') &&
        collectLabelText(actors.popover).includes('Time pace 23%') &&
        collectLabelText(actors.popover).includes('Last 6 hours'),
    'variant B makes refresh, pace, and range explicit');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[12]);
    actors.indicator.menu.close();
    await settle();

    catalog.showRefinementVariant('c');
    await settle();
    actors = catalog.getCatalogActors();
    assert(collectLabelText(actors.panel).join(' ').includes('8% | 68%'),
        'variant C uses a stronger compact separator');
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[13], 6, true);
    actors.indicator.menu.open();
    await settle();
    actors = catalog.getCatalogActors();
    const variantCText = collectLabelText(actors.popover);
    assert(findActor(actors.popover, 'refinement-status-refresh') &&
        variantCText.includes('Pace 23%') &&
        !findActor(actors.popover, 'refinement-footer'),
    'variant C composes status and pace into the denser header rail');
    await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[14]);
    actors.indicator.menu.close();
    await settle();

    catalog.disable();
    await settle();
    assert(!Main.panel.statusArea[UUID],
        'disable removes the panel indicator and its actor tree');
    catalog.enable();
    await settle();
    assert(Main.panel.statusArea[UUID],
        'catalog can be enabled again after complete cleanup');

    const originalScheme = Main.sessionMode.colorScheme;
    setShellColorScheme('prefer-light');
    await settle();
    actors = catalog.getCatalogActors();
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[6], 6, true);
    setShellColorScheme(originalScheme);
    await settle();

    const themeContext = St.ThemeContext.get_for_stage(global.stage);
    const originalScale = themeContext.scale_factor;
    themeContext.set_scale_factor(2);
    await settle();
    actors = catalog.getCatalogActors();
    assert(actors.panel.height <= Main.panel.height,
        'panel indicator remains bounded at 200% scaling');
    await captureActor(() => catalog.getCatalogActors().panel,
        EXPECTED_CAPTURES[7], 6, true);
    themeContext.set_scale_factor(originalScale);
    await settle();
}
