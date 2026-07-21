import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    FooterStatus,
    HistoryChart,
    IconButton,
    Legend,
    PanelIndicator,
    PopoverScaffold,
    ProviderCard,
    ProviderGroup,
    ChoiceRow,
    setProgressBarPace,
    SettingsRow,
} from './shared/primitives.js';
import {HistoryRangeStepper} from './shared/history-range-stepper.js';
import {HISTORY_RANGES} from './shared/history-ranges.js';
import {
    displayPercent,
    isPreferenceKey,
    nextRefreshInterval,
    nextUsageDisplay,
    nextWeeklyPace,
    PANEL_LIMITS,
    readPanelPreferences,
    TIME_PACE_KEY,
    USAGE_DISPLAY_KEY,
    WEEKLY_PACE_KEY,
} from './panel-preferences.js';
import {createCodexProvider, CodexRuntime} from './codex-runtime.js';
import {createClaudeProvider, ClaudeRuntime} from './claude-runtime.js';
import {HistoryRuntime} from './history-runtime.js';

const HISTORY_SERIES_META = Object.freeze({
    'claude:short': {dataRole: 'dataClaudeShort', stroke: 'claudeShort', label: 'Claude 5-hour'},
    'claude:weekly': {dataRole: 'dataClaudeWeekly', stroke: 'weekly', label: 'Claude weekly'},
    'codex:weekly': {dataRole: 'dataCodexWeekly', stroke: 'weekly', label: 'Codex weekly'},
});
import {validateTokens} from './shared/token-geometry.js';
import {nextMinuteDelay, SurfaceController} from './surface-controller.js';

function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/tokens.json`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded)
        throw new Error('Unable to load packaged design tokens');
    return validateTokens(JSON.parse(new TextDecoder().decode(contents)));
}

function column(styleClass, name = null) {
    return new St.BoxLayout({
        name,
        style_class: styleClass,
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
}

function label(text, styleClass, properties = {}) {
    return new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...properties,
    });
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

export default class ClaudexUsageExtension extends Extension {
    enable() {
        this._tokens = loadTokens(this.path);
        this._settings = this.getSettings();
        this._preferences = readPanelPreferences(this._settings);
        this._now = () => Date.now();
        this._presentationSourceId = null;
        this._menuOpenChangedId = null;
        this._view = 'usage';
        this._wasRefreshing = false;
        this._historyRangeFocusId = null;
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (!isPreferenceKey(key))
                return;
            const previous = this._preferences.refreshInterval.ms;
            this._preferences = readPanelPreferences(this._settings);
            if (previous !== this._preferences.refreshInterval.ms)
                this._controller?.setRefreshIntervalMs(this._preferences.refreshInterval.ms);
            this._render();
        });
        this._colorSchemeChangedId = St.Settings.get().connect(
            'notify::color-scheme', () => this._render());
        this._controller = new SurfaceController({
            now: () => this._now(),
            schedule: (callback, delay) => GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                delay, () => {
                    callback();
                    return GLib.SOURCE_REMOVE;
                }),
            cancel: sourceId => GLib.Source.remove(sourceId),
            onChange: () => this._render(),
            refreshIntervalMs: this._preferences.refreshInterval.ms,
        });
        const codex = this._startProvider(() => new CodexRuntime(), createCodexProvider);
        this._codexRuntime = codex.runtime;
        this._unregisterCodex = codex.unregister;
        const claude = this._startProvider(() => new ClaudeRuntime(),
            createClaudeProvider);
        this._claudeRuntime = claude.runtime;
        this._unregisterClaude = claude.unregister;
        try {
            this._history = new HistoryRuntime();
        } catch {
            this._history = null;
        }
        this._render();
    }

    _startProvider(create, wrap) {
        let runtime = null;
        try {
            runtime = create();
            const unregister = this.registerProvider(wrap(runtime));
            return {runtime, unregister};
        } catch {
            runtime?.dispose();
            return {runtime: null, unregister: null};
        }
    }

    registerProvider(provider) {
        return this._controller.registerProvider(provider);
    }

    refresh() {
        this._controller.refresh();
    }

    getSurfaceSnapshot() {
        return {
            ...this._controller.getSnapshot(),
            view: this._view,
            preferences: this._preferences,
        };
    }

    disable() {
        if (this._colorSchemeChangedId) {
            St.Settings.get().disconnect(this._colorSchemeChangedId);
            this._colorSchemeChangedId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._unregisterCodex?.();
        this._unregisterCodex = null;
        this._codexRuntime?.dispose();
        this._codexRuntime = null;
        this._unregisterClaude?.();
        this._unregisterClaude = null;
        this._claudeRuntime?.dispose();
        this._claudeRuntime = null;
        this._history = null;
        this._controller?.dispose();
        this._controller = null;
        this._destroyIndicator();
        this._tokens = null;
        this._settings = null;
        this._preferences = null;
        this._view = null;
        this._now = null;
        this._historyRangeFocusId = null;
    }

    _recordHistory(snapshot) {
        const justCompleted = this._wasRefreshing && !snapshot.refreshing;
        this._wasRefreshing = snapshot.refreshing;
        if (!justCompleted || !this._preferences.localHistory || !this._history)
            return;
        const samples = [];
        for (const provider of snapshot.providers) {
            if (provider.availability !== 'available')
                continue;
            for (const metric of provider.metrics)
                samples.push({providerId: provider.id, windowId: metric.windowId,
                    percent: metric.percent});
        }
        this._history.record(samples);
    }

    _render() {
        if (!this._controller || !this._tokens)
            return;
        const snapshot = this._controller.getSnapshot();
        this._recordHistory(snapshot);
        if (!snapshot.visible) {
            this._destroyIndicator();
            return;
        }
        this._ensureIndicator();
        const lightPanel = Main.sessionMode.colorScheme === 'prefer-light';
        const groups = snapshot.providers.map(provider => {
            const values = provider.metrics
                .filter(metric => this._preferences.visibility[metric.dataRole])
                .map(metric => {
                    const percent = this._displayPercent(metric.percent);
                    return {
                        id: metric.windowId,
                        percent,
                        accessibleName: `${metric.label}, ${percent} percent ` +
                            this._preferences.usageDisplay.id,
                        tone: metric.dataRole === 'dataClaudeShort'
                            ? 'muted'
                            : 'normal',
                    };
                });
            const valueDescription = values.length === 0
                ? 'no panel percentages'
                : values.map(value => `${value.percent} percent ` +
                    this._preferences.usageDisplay.id).join(', ');
            return {
                id: provider.id,
                accessibleName: `${provider.marks.accessibleName}, ${valueDescription}`,
                iconPath: `${this.path}/${lightPanel
                    ? provider.marks.lightPanel : provider.marks.darkPanel}`,
                values,
            };
        });
        this._replaceChild(this._panelHost, PanelIndicator({
            id: 'claudex-live-panel',
            groups,
            tokens: this._tokens,
        }));
        const children = this._view === 'settings'
            ? this._settingsPopover()
            : this._usagePopover(snapshot);
        this._replaceChild(this._popoverHost, PopoverScaffold({
            id: 'claudex-live-popover',
            view: this._view,
            children,
        }));
        if (this._historyRangeFocusId) {
            findActor(this._popoverHost, this._historyRangeFocusId)?.grab_key_focus();
            this._historyRangeFocusId = null;
        }
        this._syncPresentationTimer();
    }

    _usagePopover(snapshot) {
        const header = new St.BoxLayout({
            style_class: 'selected-header',
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
        });
        const copy = column('selected-title-copy');
        copy.x_expand = true;
        copy.add_child(label('USAGE', 'selected-kicker'));
        copy.add_child(label('Claude + Codex', 'selected-title'));
        header.add_child(copy);
        header.add_child(IconButton({
            id: 'refresh-button',
            iconName: snapshot.refreshing
                ? 'process-working-symbolic'
                : 'view-refresh-symbolic',
            accessibleName: snapshot.refreshing ? 'Refreshing usage' : 'Refresh usage',
            onActivate: () => this._controller.refresh(),
            tokens: this._tokens,
            busy: snapshot.refreshing,
        }));
        header.add_child(IconButton({
            id: 'settings-button',
            iconName: 'preferences-system-symbolic',
            accessibleName: 'Open settings',
            onActivate: () => {
                this._view = 'settings';
                this._render();
            },
            tokens: this._tokens,
        }));
        const children = [header, ...snapshot.providers.map(provider =>
            this._providerCard(provider))];
        const history = this._historySection();
        if (history)
            children.push(history);
        children.push(FooterStatus({
            status: snapshot.footer,
        }));
        return children;
    }

    _historySection() {
        if (!this._preferences.localHistory || !this._history ||
            !this._history.hasSamples())
            return null;
        const range = this._preferences.historyRange;
        const series = this._history.series(range.id).filter(item =>
            HISTORY_SERIES_META[`${item.providerId}:${item.windowId}`]);
        const displayedSeries = series.map(item => ({
            ...item,
            values: item.values.map(value => this._displayPercent(value)),
        }));
        const key = item => `${item.providerId}:${item.windowId}`;
        const section = column('selected-history', 'history-section');
        const head = new St.BoxLayout({
            style_class: 'selected-history-header',
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
        });
        head.add_child(label('Usage history', 'selected-section-title', {x_expand: true}));
        head.add_child(HistoryRangeStepper({
            choices: HISTORY_RANGES,
            selected: range,
            onSelect: (next, controlId) => {
                this._historyRangeFocusId = controlId;
                this._settings.set_enum('history-range', next.index);
            },
        }));
        section.add_child(head);
        if (series.length === 0) {
            section.add_child(new St.Label({
                name: 'history-empty',
                text: `Not enough history for the ${range.label} range yet`,
                style_class: 'claudex-provider-detail',
            }));
            return section;
        }
        section.add_child(HistoryChart({
            id: 'history-chart',
            accessibleName: `Usage history for ${range.label}, percentage ` +
                `${this._preferences.usageDisplay.id}, ` +
                'from zero to one hundred percent',
            axisLabels: ['100%', '75%', '50%', '25%', '0%'],
            series: displayedSeries.map(item => ({
                id: `${item.providerId}-${item.windowId}`,
                values: item.values,
                dataRole: HISTORY_SERIES_META[key(item)].dataRole,
                strokeWidth: this._tokens.stroke[HISTORY_SERIES_META[key(item)].stroke],
            })),
            tokens: this._tokens,
        }));
        section.add_child(Legend({
            entries: displayedSeries.map(item => ({
                id: `${item.providerId}-${item.windowId}`,
                label: HISTORY_SERIES_META[key(item)].label,
                dataRole: HISTORY_SERIES_META[key(item)].dataRole,
            })),
            tokens: this._tokens,
        }));
        return section;
    }

    _settingsPopover() {
        const header = new St.BoxLayout({
            style_class: 'selected-settings-header',
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
        });
        const back = new St.Button({
            name: 'back-button',
            style_class: 'selected-back-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: label('← Usage', 'claudex-button-label'),
        });
        back.set_accessible_name('Back to usage');
        back.connect('clicked', () => {
            this._view = 'usage';
            this._render();
        });
        header.add_child(back);
        header.add_child(label('Settings', 'selected-settings-title', {x_expand: true}));

        const panel = column('selected-settings-section');
        panel.add_child(label('PANEL', 'selected-settings-kicker'));
        for (const limit of PANEL_LIMITS) {
            panel.add_child(SettingsRow({
                ...limit,
                accessibleName: limit.title,
                active: this._preferences.visibility[limit.dataRole],
                onToggle: () => this._settings.set_boolean(limit.key,
                    !this._preferences.visibility[limit.dataRole]),
                tokens: this._tokens,
            }));
        }
        const display = this._preferences.usageDisplay;
        panel.add_child(ChoiceRow({
            id: 'usage-display-choice',
            title: 'Usage display',
            value: `${display.label}  ›`,
            accessibleName: `Usage display, ${display.label}`,
            onActivate: () => this._settings.set_enum(USAGE_DISPLAY_KEY,
                nextUsageDisplay(display.index).index),
        }));
        const displaySettings = column('selected-settings-section');
        displaySettings.add_child(label('DISPLAY', 'selected-settings-kicker'));
        displaySettings.add_child(SettingsRow({
            id: 'showTimePace',
            title: 'Time pace markers',
            description: 'Compare usage with elapsed window time',
            accessibleName: 'Time pace markers',
            active: this._preferences.timePace,
            onToggle: () => this._settings.set_boolean(TIME_PACE_KEY,
                !this._preferences.timePace),
            tokens: this._tokens,
        }));
        const weeklyPace = this._preferences.weeklyPace;
        displaySettings.add_child(ChoiceRow({
            id: 'weekly-pace-choice',
            title: 'Weekly pace',
            value: `${weeklyPace.label}  ›`,
            accessibleName: `Weekly pace, ${weeklyPace.label}`,
            onActivate: () => this._settings.set_enum(WEEKLY_PACE_KEY,
                nextWeeklyPace(weeklyPace.index).index),
        }));
        const history = column('selected-settings-section');
        history.add_child(label('HISTORY', 'selected-settings-kicker'));
        history.add_child(SettingsRow({
            id: 'showUsageHistory',
            title: 'Local usage history',
            description: 'Record and chart usage on this machine',
            accessibleName: 'Local usage history',
            active: this._preferences.localHistory,
            onToggle: () => this._settings.set_boolean('show-usage-history',
                !this._preferences.localHistory),
            tokens: this._tokens,
        }));
        const updates = column('selected-settings-section');
        updates.add_child(label('UPDATES', 'selected-settings-kicker'));
        const interval = this._preferences.refreshInterval;
        updates.add_child(ChoiceRow({
            id: 'refresh-interval-choice',
            title: 'Refresh while visible',
            value: `${interval.label}  ›`,
            accessibleName: `Refresh while visible, ${interval.label}`,
            onActivate: () => this._settings.set_enum('refresh-interval',
                nextRefreshInterval(interval.index).index),
        }));
        return [header, panel, displaySettings, history, updates];
    }

    _displayPercent(percent) {
        return displayPercent(percent, this._preferences.usageDisplay.id);
    }

    _displayMetric(provider, metric) {
        const percent = this._displayPercent(metric.percent);
        let elapsedPercent = metric.elapsedPercent;
        if (this._preferences.weeklyPace.id === 'weekdays' &&
            Object.hasOwn(metric, 'weekdayElapsedPercent')) {
            elapsedPercent = metric.weekdayElapsedPercent ?? undefined;
        }
        const pacePercent = this._preferences.timePace &&
            elapsedPercent !== undefined
            ? this._displayPercent(elapsedPercent)
            : undefined;
        const paceAccessible = pacePercent === undefined
            ? ''
            : `; Time pace ${Math.round(pacePercent)} percent ` +
                this._preferences.usageDisplay.id;
        return {
            ...metric,
            percent,
            ...(pacePercent === undefined ? {} : {pacePercent}),
            accessibleName: `${provider.label} ${metric.label} at ${percent} percent ` +
                this._preferences.usageDisplay.id + paceAccessible,
        };
    }

    _providerCard(provider) {
        const presentation = {
            id: `provider-${provider.id}`,
            label: provider.label,
            iconPath: `${this.path}/${provider.marks.popup}`,
            iconAccessibleName: provider.marks.accessibleName,
        };
        if (provider.availability === 'available') {
            return ProviderCard({
                id: `provider-card-${provider.id}`,
                provider: presentation,
                metrics: provider.metrics.map(metric =>
                    this._displayMetric(provider, metric)),
                tokens: this._tokens,
            });
        }
        const card = column('selected-provider-card', `provider-card-${provider.id}`);
        card.add_child(ProviderGroup({model: presentation, tokens: this._tokens}));
        card.add_child(new St.Label({
            name: `unavailable-${provider.id}`,
            text: 'Usage unavailable',
            style_class: 'claudex-provider-detail',
        }));
        return card;
    }

    _ensureIndicator() {
        if (this._indicator)
            return;
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
        this._menuOpenChangedId = this._indicator.menu.connect(
            'open-state-changed', (_menu, open) => {
                if (!this._controller)
                    return;
                if (open && this._view === 'usage')
                    this._updateTemporalPresentation(this._controller.getSnapshot());
                this._syncPresentationTimer();
            });
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    _destroyIndicator() {
        this._clearPresentationTimer();
        if (this._indicator && this._menuOpenChangedId) {
            this._indicator.menu.disconnect(this._menuOpenChangedId);
            this._menuOpenChangedId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._panelHost = null;
        this._popoverHost = null;
        this._menuItem = null;
    }

    _usagePopupVisible() {
        return this._view === 'usage' && this._indicator?.menu.isOpen === true;
    }

    _syncPresentationTimer() {
        if (!this._usagePopupVisible()) {
            this._clearPresentationTimer();
            return;
        }
        if (this._presentationSourceId !== null)
            return;
        this._presentationSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            nextMinuteDelay(this._now()),
            () => this._runPresentationTick());
    }

    _runPresentationTick() {
        this._presentationSourceId = null;
        if (!this._controller || !this._usagePopupVisible())
            return GLib.SOURCE_REMOVE;
        this._updateTemporalPresentation(this._controller.getSnapshot());
        this._syncPresentationTimer();
        return GLib.SOURCE_REMOVE;
    }

    _updateTemporalPresentation(snapshot) {
        const root = this._popoverHost?.get_child();
        if (!root)
            return;
        const footer = findActor(root, 'footer-status');
        if (footer)
            footer.text = snapshot.footer;
        for (const provider of snapshot.providers) {
            for (const metric of provider.metrics) {
                const reset = findActor(root, `reset-label-${metric.id}`);
                if (reset)
                    reset.text = metric.resetLabel;
                const presentation = this._displayMetric(provider, metric);
                const progress = findActor(root, `progress-${metric.id}`);
                if (progress && presentation.pacePercent !== undefined) {
                    setProgressBarPace(progress, presentation.pacePercent);
                    progress.set_accessible_name(presentation.accessibleName);
                }
            }
        }
    }

    _clearPresentationTimer() {
        if (this._presentationSourceId === null)
            return;
        GLib.Source.remove(this._presentationSourceId);
        this._presentationSourceId = null;
    }

    _replaceChild(host, actor) {
        host.get_child()?.destroy();
        host.set_child(actor);
    }
}
