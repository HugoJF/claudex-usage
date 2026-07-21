import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {CatalogState, HISTORY, RANGES, USAGE} from './catalog-state.js';
import {progressWidth, validateTokens} from './shared/token-geometry.js';
import {
    ChoiceRow,
    FooterStatus,
    HistoryChart,
    IconButton,
    Legend,
    PanelIndicator,
    PopoverScaffold,
    ProgressBar,
    ProviderCard,
    RangeSelector,
    SettingsRow,
} from './shared/primitives.js';

function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL, properties = {}) {
    return new St.BoxLayout({style_class: styleClass, orientation, ...properties});
}

function column(styleClass, properties = {}) {
    return box(styleClass, Clutter.Orientation.VERTICAL, properties);
}

function label(text, styleClass, properties = {}) {
    return new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...properties,
    });
}

function metricModel(usage) {
    return {
        id: usage.id,
        label: usage.window,
        percent: usage.percent,
        resetLabel: usage.reset,
        dataRole: usage.dataRole,
        accessibleName: `${usage.percent}% of ${usage.window} used`,
    };
}

function providerModel(id, labelText, detail, iconPath) {
    return {
        id,
        label: labelText,
        detail,
        iconPath,
        iconAccessibleName: `${labelText} mark`,
    };
}

function providerIcon({path, accessibleName, tokens}) {
    const actor = new St.Icon({
        style_class: 'claudex-provider-icon',
        gicon: new Gio.FileIcon({file: Gio.File.new_for_path(path)}),
        icon_size: tokens.size.providerIcon,
        y_align: Clutter.ActorAlign.CENTER,
    });
    actor.set_accessible_name(accessibleName);
    return actor;
}

function panelIcon({path, accessibleName, tokens}) {
    const actor = new St.Icon({
        style_class: 'claudex-panel-provider-icon',
        gicon: new Gio.FileIcon({file: Gio.File.new_for_path(path)}),
        icon_size: tokens.size.panelProviderIcon,
        y_align: Clutter.ActorAlign.CENTER,
    });
    actor.set_accessible_name(accessibleName);
    return actor;
}

function updatePanelThemeIcons(actor, extensionPath, lightPanel) {
    const providers = ['claude', 'codex'];
    const groups = actor.get_children().filter(child =>
        child.has_style_class_name?.('claudex-panel-provider'));
    groups.forEach((group, index) => {
        const icon = group.get_first_child();
        const provider = providers[index];
        const suffix = lightPanel ? '-light' : '';
        icon.gicon = new Gio.FileIcon({
            file: Gio.File.new_for_path(
                `${extensionPath}/icons/${provider}${suffix}.svg`),
        });
    });
}

function compactPanelValue(text, muted, tokens) {
    return label(text, 'claudex-panel-selected-value', muted
        ? {style: `color: ${tokens.color.foregroundMuted};`}
        : {});
}

function updateRefinementPanel(actor, variant) {
    actor._claudeShortValue.text = variant === 'b' ? '5h 8%' : '8%';
    actor._claudeSeparator.text = variant === 'c' ? '|' : '·';
    actor.queue_relayout();
}

function buildRefinementPanel({variant, extensionPath, tokens, lightPanel}) {
    const actor = box('claudex-panel claudex-panel-selected',
        Clutter.Orientation.HORIZONTAL, {name: 'refinement-panel'});
    const iconPath = provider =>
        `${extensionPath}/icons/${provider}${lightPanel ? '-light' : ''}.svg`;

    const claude = box('claudex-panel-provider');
    claude.add_child(panelIcon({
        path: iconPath('claude'),
        accessibleName: 'Claude mark, 5-hour 8 percent used, weekly 68 percent used',
        tokens,
    }));
    actor._claudeShortValue = compactPanelValue('8%', true, tokens);
    actor._claudeSeparator = compactPanelValue('·', false, tokens);
    claude.add_child(actor._claudeShortValue);
    claude.add_child(actor._claudeSeparator);
    claude.add_child(compactPanelValue('68%', false, tokens));
    actor.add_child(claude);
    actor.add_child(new St.Widget({
        style_class: 'claudex-panel-provider-divider',
        width: 1,
        height: 12,
    }));
    const codex = box('claudex-panel-provider');
    codex.add_child(panelIcon({
        path: iconPath('codex'),
        accessibleName: 'Codex mark, weekly 42 percent used',
        tokens,
    }));
    codex.add_child(compactPanelValue('42%', false, tokens));
    actor.add_child(codex);
    updateRefinementPanel(actor, variant);
    return actor;
}

function rangeLabel(range, variant) {
    if (variant !== 'b')
        return range;
    return {
        '1h': 'Last hour',
        '6h': 'Last 6 hours',
        '1d': 'Last day',
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
    }[range];
}

function rangeSelectPreview({range, variant, onActivate, tokens}) {
    const row = box('selected-choice-row', Clutter.Orientation.HORIZONTAL);
    row.add_child(label(rangeLabel(range, variant), 'selected-choice-value'));
    row.add_child(new St.Icon({
        icon_name: 'pan-down-symbolic',
        icon_size: tokens.size.settingsIcon / 2,
    }));
    const actor = new St.Button({
        name: 'refinement-range-select',
        style_class: 'selected-choice-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: row,
        accessible_role: Atk.Role.COMBO_BOX,
    });
    actor.set_accessible_name(`Usage history range, ${rangeLabel(range, variant)}`);
    actor.connect('clicked', onActivate);
    return actor;
}

function refinementVariantSelector({selected, onSelect}) {
    const actor = box('selected-history-header',
        Clutter.Orientation.HORIZONTAL, {
            name: 'refinement-variant-selector',
            x_expand: true,
        });
    actor.add_child(label('Preview', 'selected-section-title', {
        x_expand: true,
    }));
    actor.add_child(RangeSelector({
        choices: ['a', 'b', 'c'].map(id => ({
            id,
            label: id.toUpperCase(),
            accessibleName: `Preview variant ${id.toUpperCase()}`,
        })),
        selected,
        onSelect,
    }));
    return actor;
}

function statusOnlyFooter(text) {
    const actor = box('claudex-footer', Clutter.Orientation.HORIZONTAL, {
        name: 'refinement-footer',
        x_expand: true,
    });
    actor.add_child(label(text, 'claudex-updated', {x_expand: true}));
    return actor;
}

function refinementProviderHeader({id, title, iconPath, tokens}) {
    const actor = box('claudex-provider-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    actor.add_child(providerIcon({
        path: iconPath,
        accessibleName: `${title} mark`,
        tokens,
    }));
    actor.add_child(label(title, 'claudex-provider-name', {x_expand: true}));
    actor.set_name(`refinement-provider-${id}`);
    return actor;
}

function refinementMetric({usage, variant, showTimePace, tokens}) {
    const actor = column('claudex-metric', {x_expand: true});
    const top = box('claudex-metric-top', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    top.add_child(label(usage.window, 'claudex-window', {x_expand: true}));
    top.add_child(label(`${usage.percent}%`, 'claudex-percent'));
    actor.add_child(top);
    if (variant === 'c' && showTimePace) {
        const pace = box('claudex-metric-top', Clutter.Orientation.HORIZONTAL, {
            x_expand: true,
        });
        pace.add_child(new St.Widget({x_expand: true}));
        pace.add_child(label(`Pace ${usage.pacePercent}%`, 'claudex-updated'));
        actor.add_child(pace);
    }
    const progress = ProgressBar({
        metric: {
            ...metricModel(usage),
            accessibleName: `${usage.percent}% of ${usage.window} used` +
                (showTimePace ? `; Time pace ${usage.pacePercent}% used` : ''),
        },
        tokens,
    });
    if (showTimePace) {
        const markerWidth = 2;
        progress.add_child(new St.Widget({
            name: `pace-${usage.id}`,
            style: `background-color: ${tokens.color.foregroundPrimary};`,
            width: markerWidth,
            height: tokens.size.progressHeight,
            x: Math.max(0, Math.min(tokens.size.progressWidth - markerWidth,
                progressWidth(usage.pacePercent, tokens.size.progressWidth) -
                    markerWidth / 2)),
            y: 0,
        }));
    }
    actor.add_child(progress);
    if (variant === 'b' && showTimePace) {
        const meta = box('claudex-metric-top', Clutter.Orientation.HORIZONTAL, {
            x_expand: true,
        });
        meta.add_child(label(usage.reset, 'claudex-reset', {x_expand: true}));
        meta.add_child(label(`Time pace ${usage.pacePercent}%`, 'claudex-reset'));
        actor.add_child(meta);
    } else {
        actor.add_child(label(usage.reset, 'claudex-reset'));
    }
    return actor;
}

function refinementProviderCard({id, title, metrics, variant, showTimePace,
    extensionPath, tokens}) {
    const actor = column('selected-provider-card', {name: `refinement-card-${id}`});
    actor.add_child(refinementProviderHeader({
        id,
        title,
        iconPath: `${extensionPath}/icons/${id}.svg`,
        tokens,
    }));
    for (const usage of metrics) {
        actor.add_child(refinementMetric({
            usage,
            variant,
            showTimePace,
            tokens,
        }));
    }
    return actor;
}

function statusRefreshButton({onActivate, tokens}) {
    const row = box('selected-choice-row', Clutter.Orientation.HORIZONTAL);
    row.add_child(new St.Icon({
        icon_name: 'view-refresh-symbolic',
        icon_size: tokens.size.settingsIcon,
    }));
    row.add_child(label('Updated 3 min', 'selected-choice-value'));
    const actor = new St.Button({
        name: 'refinement-status-refresh',
        style_class: 'selected-choice-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: row,
    });
    actor.set_accessible_name('Refresh usage, updated 3 minutes ago');
    actor.connect('clicked', onActivate);
    return actor;
}

function buildRefinementUsagePopover({state, extensionPath, tokens, actions,
    showPreviewControls}) {
    const variant = state.refinementVariant;
    const header = box('selected-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const copy = column('selected-title-copy', {x_expand: true});
    copy.add_child(label('USAGE', 'selected-kicker'));
    copy.add_child(label('Claude + Codex', 'selected-title'));
    header.add_child(copy);
    if (variant === 'b')
        header.add_child(label('Refreshing…', 'claudex-updated'));
    if (variant === 'c') {
        header.add_child(statusRefreshButton({
            onActivate: actions.refresh,
            tokens,
        }));
    } else {
        header.add_child(IconButton({
            id: 'refinement-refresh-button',
            iconName: variant === 'b'
                ? 'process-working-symbolic'
                : 'view-refresh-symbolic',
            accessibleName: variant === 'b' ? 'Refreshing usage' : 'Refresh usage',
            onActivate: actions.refresh,
            tokens,
            busy: variant === 'b',
        }));
    }
    header.add_child(IconButton({
        id: 'settings-button',
        iconName: 'preferences-system-symbolic',
        accessibleName: 'Open settings',
        onActivate: actions.openSettings,
        tokens,
    }));

    const history = column('selected-history');
    const historyHeader = box('selected-history-header',
        Clutter.Orientation.HORIZONTAL, {x_expand: true});
    historyHeader.add_child(label('Usage history', 'selected-section-title', {
        x_expand: true,
    }));
    historyHeader.add_child(rangeSelectPreview({
        range: state.activeRange,
        variant,
        onActivate: actions.cycleRange,
        tokens,
    }));
    history.add_child(historyHeader);
    history.add_child(HistoryChart({
        id: 'refinement-history-chart',
        accessibleName: `Usage history for ${state.activeRange}, ` +
            'from zero to one hundred percent',
        axisLabels: ['100%', '75%', '50%', '25%', '0%'],
        series: [
            {
                id: 'claudeShort',
                values: HISTORY.claudeShort,
                dataRole: USAGE.claudeShort.dataRole,
                strokeWidth: tokens.stroke.claudeShort,
            },
            {
                id: 'claudeWeekly',
                values: HISTORY.claudeWeekly,
                dataRole: USAGE.claudeWeekly.dataRole,
                strokeWidth: tokens.stroke.weekly,
            },
            {
                id: 'codexWeekly',
                values: HISTORY.codexWeekly,
                dataRole: USAGE.codexWeekly.dataRole,
                strokeWidth: tokens.stroke.weekly,
            },
        ],
        tokens,
    }));
    history.add_child(Legend({
        entries: [
            {id: 'claudeShort', label: 'Claude 5-hour',
                dataRole: USAGE.claudeShort.dataRole},
            {id: 'claudeWeekly', label: 'Claude weekly',
                dataRole: USAGE.claudeWeekly.dataRole},
            {id: 'codexWeekly', label: 'Codex weekly',
                dataRole: USAGE.codexWeekly.dataRole},
        ],
        tokens,
    }));

    const children = [header];
    if (showPreviewControls) {
        children.push(refinementVariantSelector({
            selected: variant,
            onSelect: actions.selectRefinementVariant,
        }));
    }
    children.push(
        refinementProviderCard({
            id: 'claude',
            title: 'Claude',
            metrics: [USAGE.claudeShort, USAGE.claudeWeekly],
            variant,
            showTimePace: state.timePace,
            extensionPath,
            tokens,
        }),
        refinementProviderCard({
            id: 'codex',
            title: 'Codex',
            metrics: [USAGE.codexWeekly],
            variant,
            showTimePace: state.timePace,
            extensionPath,
            tokens,
        }),
        history,
    );
    if (variant !== 'c')
        children.push(statusOnlyFooter('Updated 3 min ago'));
    return PopoverScaffold({
        id: `usage-refinement-${variant}`,
        view: 'usage',
        children,
    });
}

function buildRefinementSettingsPopover({state, tokens, actions,
    showPreviewControls}) {
    const header = box('selected-settings-header',
        Clutter.Orientation.HORIZONTAL, {x_expand: true});
    const back = new St.Button({
        name: 'back-button',
        style_class: 'selected-back-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: label('← Usage', 'claudex-button-label'),
    });
    back.set_accessible_name('Back to usage');
    back.connect('clicked', actions.openUsage);
    header.add_child(back);
    header.add_child(label('Settings', 'selected-settings-title', {x_expand: true}));

    const panelSection = column('selected-settings-section');
    panelSection.add_child(label('PANEL', 'selected-settings-kicker'));
    for (const [id, title] of [
        ['showClaudeShort', 'Claude 5-hour'],
        ['showClaudeWeekly', 'Claude weekly'],
        ['showCodexWeekly', 'Codex weekly'],
    ]) {
        panelSection.add_child(SettingsRow({
            id,
            title,
            description: 'Show this limit in the top panel',
            accessibleName: title,
            active: state[id],
            onToggle: actions.toggle,
            tokens,
        }));
    }
    panelSection.add_child(ChoiceRow({
        id: 'usage-display-choice',
        title: 'Usage display',
        value: 'Used  ›',
        accessibleName: 'Usage display, Used',
        onActivate: () => {},
    }));

    const displaySection = column('selected-settings-section');
    displaySection.add_child(label('DISPLAY', 'selected-settings-kicker'));
    displaySection.add_child(SettingsRow({
        id: 'timePace',
        title: 'Time pace markers',
        description: 'Compare usage with elapsed window time',
        accessibleName: 'Time pace markers',
        active: state.timePace,
        onToggle: actions.toggle,
        tokens,
    }));
    displaySection.add_child(ChoiceRow({
        id: 'weekly-pace-choice',
        title: 'Weekly pace',
        value: `${state.weeklyPace}  ›`,
        accessibleName: `Weekly pace, ${state.weeklyPace}`,
        onActivate: actions.cycleWeeklyPace,
    }));

    const historySection = column('selected-settings-section');
    historySection.add_child(label('HISTORY', 'selected-settings-kicker'));
    historySection.add_child(SettingsRow({
        id: 'localHistory',
        title: 'Local usage history',
        description: 'Record and chart usage on this machine',
        accessibleName: 'Local usage history',
        active: state.localHistory,
        onToggle: actions.toggle,
        tokens,
    }));

    const updatesSection = column('selected-settings-section');
    updatesSection.add_child(label('UPDATES', 'selected-settings-kicker'));
    updatesSection.add_child(ChoiceRow({
        id: 'refresh-interval-choice',
        title: 'Refresh while visible',
        value: `${state.refreshInterval}  ›`,
        accessibleName: `Refresh while visible, ${state.refreshInterval}`,
        onActivate: actions.cycleRefreshInterval,
    }));

    const children = [header];
    if (showPreviewControls) {
        children.push(refinementVariantSelector({
            selected: state.refinementVariant,
            onSelect: actions.selectRefinementVariant,
        }));
    }
    children.push(panelSection, displaySection, historySection, updatesSection);

    return PopoverScaffold({
        id: 'usage-refinement-settings',
        view: 'settings',
        children,
    });
}

function buildPanel({state, extensionPath, tokens, lightPanel}) {
    const iconPath = provider =>
        `${extensionPath}/icons/${provider}${lightPanel ? '-light' : ''}.svg`;
    const groups = [
        {
            id: 'claude',
            iconPath: iconPath('claude'),
            accessibleName: 'Claude',
            values: [
                state.showClaudeShort && {
                    id: 'claudeShort',
                    percent: USAGE.claudeShort.percent,
                },
                state.showClaudeWeekly && {
                    id: 'claudeWeekly',
                    percent: USAGE.claudeWeekly.percent,
                },
            ].filter(Boolean),
        },
        {
            id: 'codex',
            iconPath: iconPath('codex'),
            accessibleName: 'Codex',
            values: state.showCodexWeekly
                ? [{
                    id: 'codexWeekly',
                    percent: USAGE.codexWeekly.percent,
                }]
                : [],
        },
    ];
    return PanelIndicator({
        id: 'claudex-panel-indicator',
        groups,
        emptyGroups: groups.map(group => ({
            ...group,
            accessibleName: `${group.accessibleName} hidden`,
        })),
        tokens,
    });
}

function buildUsagePopover({state, extensionPath, tokens, actions}) {
    const header = box('selected-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const copy = column('selected-title-copy', {x_expand: true});
    copy.add_child(label('USAGE', 'selected-kicker'));
    copy.add_child(label('Claude + Codex', 'selected-title'));
    header.add_child(copy);
    header.add_child(IconButton({
        id: 'settings-button',
        iconName: 'preferences-system-symbolic',
        accessibleName: 'Open settings',
        onActivate: actions.openSettings,
        tokens,
    }));

    const history = column('selected-history');
    const historyHeader = box('selected-history-header',
        Clutter.Orientation.HORIZONTAL, {x_expand: true});
    historyHeader.add_child(label('Usage history', 'selected-section-title', {
        x_expand: true,
    }));
    historyHeader.add_child(RangeSelector({
        choices: RANGES.map(id => ({
            id,
            label: id,
            accessibleName: `${id} history range`,
        })),
        selected: state.activeRange,
        onSelect: actions.selectRange,
    }));
    history.add_child(historyHeader);
    history.add_child(HistoryChart({
        id: 'history-chart',
        accessibleName: `Usage history for ${state.activeRange}, ` +
            'from zero to one hundred percent',
        axisLabels: ['100%', '75%', '50%', '25%', '0%'],
        series: [
            {
                id: 'claudeShort',
                values: HISTORY.claudeShort,
                dataRole: USAGE.claudeShort.dataRole,
                strokeWidth: tokens.stroke.claudeShort,
            },
            {
                id: 'claudeWeekly',
                values: HISTORY.claudeWeekly,
                dataRole: USAGE.claudeWeekly.dataRole,
                strokeWidth: tokens.stroke.weekly,
            },
            {
                id: 'codexWeekly',
                values: HISTORY.codexWeekly,
                dataRole: USAGE.codexWeekly.dataRole,
                strokeWidth: tokens.stroke.weekly,
            },
        ],
        tokens,
    }));
    history.add_child(Legend({
        entries: [
            {id: 'claudeShort', label: 'Claude 5-hour',
                dataRole: USAGE.claudeShort.dataRole},
            {id: 'claudeWeekly', label: 'Claude weekly',
                dataRole: USAGE.claudeWeekly.dataRole},
            {id: 'codexWeekly', label: 'Codex weekly',
                dataRole: USAGE.codexWeekly.dataRole},
        ],
        tokens,
    }));

    return PopoverScaffold({
        id: 'claudex-usage-popover',
        view: 'usage',
        children: [
            header,
            ProviderCard({
                id: 'provider-claude',
                provider: providerModel('claude', 'Claude', 'Two usage windows',
                    `${extensionPath}/icons/claude.svg`),
                metrics: [
                    metricModel(USAGE.claudeShort),
                    metricModel(USAGE.claudeWeekly),
                ],
                tokens,
            }),
            ProviderCard({
                id: 'provider-codex',
                provider: providerModel('codex', 'Codex', 'Weekly usage window',
                    `${extensionPath}/icons/codex.svg`),
                metrics: [metricModel(USAGE.codexWeekly)],
                tokens,
            }),
            history,
            FooterStatus({
                status: 'Updated just now',
                action: {
                    id: 'refresh-button',
                    label: 'Refresh',
                    accessibleName: 'Refresh static usage sample',
                    onActivate: actions.refresh,
                },
            }),
        ],
    });
}

function buildSettingsPopover({state, tokens, actions}) {
    const header = box('selected-settings-header',
        Clutter.Orientation.HORIZONTAL, {x_expand: true});
    const back = new St.Button({
        name: 'back-button',
        style_class: 'selected-back-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: label('← Usage', 'claudex-button-label'),
    });
    back.set_accessible_name('Back to usage');
    back.connect('clicked', actions.openUsage);
    header.add_child(back);
    header.add_child(label('Settings', 'selected-settings-title', {x_expand: true}));

    const panelSection = column('selected-settings-section');
    panelSection.add_child(label('PANEL', 'selected-settings-kicker'));
    for (const [id, title, description] of [
        ['showClaudeShort', 'Claude 5-hour', 'Show this limit in the top panel'],
        ['showClaudeWeekly', 'Claude weekly', 'Show this limit in the top panel'],
        ['showCodexWeekly', 'Codex weekly', 'Show this limit in the top panel'],
        ['presentOnly', 'Only while providers are present',
            'Hide each provider when its application is not running'],
    ]) {
        panelSection.add_child(SettingsRow({
            id,
            title,
            description,
            accessibleName: title,
            active: state[id],
            onToggle: actions.toggle,
            tokens,
        }));
    }

    const updatesSection = column('selected-settings-section');
    updatesSection.add_child(label('UPDATES & HISTORY', 'selected-settings-kicker'));
    updatesSection.add_child(ChoiceRow({
        id: 'refresh-interval-choice',
        title: 'Refresh while visible',
        value: `${state.refreshInterval}  ›`,
        accessibleName: `Refresh while visible, ${state.refreshInterval}`,
        onActivate: actions.cycleRefreshInterval,
    }));
    updatesSection.add_child(SettingsRow({
        id: 'localHistory',
        title: 'Keep local usage history',
        description: 'Store derived percentages for the merged chart',
        accessibleName: 'Keep local usage history',
        active: state.localHistory,
        onToggle: actions.toggle,
        tokens,
    }));
    return PopoverScaffold({
        id: 'claudex-settings-popover',
        view: 'settings',
        children: [header, panelSection, updatesSection],
    });
}

function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/tokens.json`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded)
        throw new Error('Unable to load packaged design tokens');

    let tokens;
    try {
        tokens = JSON.parse(new TextDecoder().decode(contents));
    } catch (error) {
        throw new Error(`Unable to parse packaged design tokens: ${error.message}`);
    }
    return validateTokens(tokens);
}

export default class ClaudexUsageCatalogExtension extends Extension {
    enable() {
        this._tokens = loadTokens(this.path);
        this._state = new CatalogState();
        this._panelSignature = null;
        this._showRefinementControls = false;
        this._colorSchemeChangedId = St.Settings.get().connect(
            'notify::color-scheme', () => this._render());

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._indicator.add_style_class_name('claudex-indicator');
        this._indicator.set_accessible_name('Claudex Usage');

        this._panelHost = new St.Bin({name: 'claudex-panel-host'});
        this._indicator.add_child(this._panelHost);

        this._menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'claudex-menu-item',
        });
        this._popoverHost = new St.Bin({name: 'claudex-popover-host'});
        this._menuItem.add_child(this._popoverHost);
        this._indicator.menu.addMenuItem(this._menuItem);
        this._menuKeyPressId = this._indicator.menu.actor.connect(
            'key-press-event', (_actor, event) => {
                if (!this._showRefinementControls)
                    return Clutter.EVENT_PROPAGATE;
                const variant = new Map([
                    [Clutter.KEY_1, 'a'],
                    [Clutter.KEY_KP_1, 'a'],
                    [Clutter.KEY_2, 'b'],
                    [Clutter.KEY_KP_2, 'b'],
                    [Clutter.KEY_3, 'c'],
                    [Clutter.KEY_KP_3, 'c'],
                ]).get(event.get_key_symbol());
                if (!variant)
                    return Clutter.EVENT_PROPAGATE;
                this.showRefinementVariant(variant);
                return Clutter.EVENT_STOP;
            });

        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._render();
    }

    disable() {
        if (this._colorSchemeChangedId) {
            St.Settings.get().disconnect(this._colorSchemeChangedId);
            this._colorSchemeChangedId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._panelHost = null;
        this._popoverHost = null;
        this._menuItem = null;
        this._panelSignature = null;
        this._menuKeyPressId = null;
        this._showRefinementControls = false;
        this._state = null;
        this._tokens = null;
    }

    getCatalogSnapshot() {
        return this._state?.snapshot() ?? null;
    }

    getCatalogActors() {
        return {
            indicator: this._indicator,
            panel: this._panelHost?.get_child() ?? null,
            popover: this._popoverHost?.get_child() ?? null,
        };
    }

    showRefinementVariant(variant) {
        this._state.setRefinementVariant(variant);
        this._render();
    }

    showRefinementControls() {
        this._showRefinementControls = true;
        if (!this._state.snapshot().refinementVariant)
            this._state.setRefinementVariant('a');
        this._render();
    }

    _replaceChild(host, child) {
        host.get_child()?.destroy();
        host.set_child(child);
    }

    _render() {
        const snapshot = this._state.snapshot();
        const lightPanel = Main.sessionMode.colorScheme === 'prefer-light';
        const panelSignature = snapshot.refinementVariant
            ? 'refinement'
            : [
                'baseline',
                snapshot.showClaudeShort,
                snapshot.showClaudeWeekly,
                snapshot.showCodexWeekly,
            ].join(':');
        if (panelSignature !== this._panelSignature) {
            const panel = snapshot.refinementVariant
                ? buildRefinementPanel({
                    variant: snapshot.refinementVariant,
                    extensionPath: this.path,
                    tokens: this._tokens,
                    lightPanel,
                })
                : buildPanel({
                    state: snapshot,
                    extensionPath: this.path,
                    tokens: this._tokens,
                    lightPanel,
            });
            this._replaceChild(this._panelHost, panel);
            panel.show();
            this._panelHost.queue_relayout();
            this._indicator.queue_relayout();
            Main.panel.queue_relayout();
            this._panelSignature = panelSignature;
        }
        updatePanelThemeIcons(this._panelHost.get_child(), this.path, lightPanel);
        if (snapshot.refinementVariant) {
            updateRefinementPanel(
                this._panelHost.get_child(), snapshot.refinementVariant);
            this._indicator.queue_relayout();
            Main.panel.queue_relayout();
        }

        const actions = {
            openSettings: () => {
                this._state.setView('settings');
                this._render();
            },
            openUsage: () => {
                this._state.setView('usage');
                this._render();
            },
            selectRange: range => {
                this._state.selectRange(range);
                this._render();
            },
            cycleRange: () => {
                this._state.cycleRange();
                this._render();
            },
            selectRefinementVariant: variant => {
                this._state.setRefinementVariant(variant);
                this._render();
            },
            toggle: key => {
                this._state.toggle(key);
                this._render();
            },
            cycleRefreshInterval: () => {
                this._state.cycleRefreshInterval();
                this._render();
            },
            cycleWeeklyPace: () => {
                this._state.cycleWeeklyPace();
                this._render();
            },
            refresh: () => this._render(),
        };

        let popover;
        if (snapshot.refinementVariant) {
            popover = snapshot.view === 'settings'
                ? buildRefinementSettingsPopover({
                    state: snapshot,
                    tokens: this._tokens,
                    actions,
                    showPreviewControls: this._showRefinementControls,
                })
                : buildRefinementUsagePopover({
                    state: snapshot,
                    extensionPath: this.path,
                    tokens: this._tokens,
                    actions,
                    showPreviewControls: this._showRefinementControls,
                });
        } else {
            popover = snapshot.view === 'settings'
                ? buildSettingsPopover({state: snapshot, tokens: this._tokens, actions})
                : buildUsagePopover({
                    state: snapshot,
                    extensionPath: this.path,
                    tokens: this._tokens,
                    actions,
                });
        }
        this._replaceChild(this._popoverHost, popover);
    }
}
