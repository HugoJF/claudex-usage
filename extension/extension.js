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
    IconButton,
    PanelIndicator,
    PopoverScaffold,
    ProviderCard,
    ProviderGroup,
    ChoiceRow,
    SettingsRow,
} from './shared/primitives.js';
import {
    nextRefreshInterval,
    PANEL_LIMITS,
    readPanelPreferences,
} from './panel-preferences.js';
import {createCodexProvider, CodexRuntime} from './codex-runtime.js';
import {validateTokens} from './shared/token-geometry.js';
import {SurfaceController} from './surface-controller.js';

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

export default class ClaudexUsageExtension extends Extension {
    enable() {
        this._tokens = loadTokens(this.path);
        this._settings = this.getSettings();
        this._preferences = readPanelPreferences(this._settings);
        this._view = 'usage';
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (!PANEL_LIMITS.some(limit => limit.key === key) && key !== 'refresh-interval')
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
            now: () => Date.now(),
            schedule: (callback, delay) => GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                delay, () => {
                    callback();
                    return GLib.SOURCE_REMOVE;
                }),
            cancel: sourceId => GLib.Source.remove(sourceId),
            onChange: () => this._render(),
            refreshIntervalMs: this._preferences.refreshInterval.ms,
        });
        let runtime = null;
        try {
            runtime = new CodexRuntime();
            this._codexRuntime = runtime;
            this._unregisterCodex = this.registerProvider(
                createCodexProvider(runtime));
        } catch {
            runtime?.dispose();
            this._codexRuntime = null;
            this._unregisterCodex = null;
        }
        this._render();
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
        this._controller?.dispose();
        this._controller = null;
        this._destroyIndicator();
        this._tokens = null;
        this._settings = null;
        this._preferences = null;
        this._view = null;
    }

    _render() {
        if (!this._controller || !this._tokens)
            return;
        const snapshot = this._controller.getSnapshot();
        if (!snapshot.visible) {
            this._destroyIndicator();
            return;
        }
        this._ensureIndicator();
        const lightPanel = Main.sessionMode.colorScheme === 'prefer-light';
        const groups = snapshot.providers.map(provider => ({
                id: provider.id,
                accessibleName: provider.marks.accessibleName,
                iconPath: `${this.path}/${lightPanel
                    ? provider.marks.lightPanel : provider.marks.darkPanel}`,
                values: provider.metrics
                    .filter(metric => this._preferences.visibility[metric.dataRole])
                    .map(metric => ({
                    id: metric.id,
                    percent: metric.percent,
                })),
            }));
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
        children.push(FooterStatus({
            status: snapshot.footer,
            action: {
                id: 'refresh-button',
                label: 'Refresh',
                accessibleName: 'Refresh usage',
                onActivate: () => this._controller.refresh(),
            },
        }));
        return children;
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
        return [header, panel, updates];
    }

    _providerCard(provider) {
        const presentation = {
            id: `provider-${provider.id}`,
            label: provider.label,
            detail: provider.detail,
            iconPath: `${this.path}/${provider.marks.popup}`,
            iconAccessibleName: provider.marks.accessibleName,
        };
        if (provider.availability === 'available') {
            return ProviderCard({
                id: `provider-card-${provider.id}`,
                provider: presentation,
                metrics: provider.metrics,
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
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    _destroyIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
        this._panelHost = null;
        this._popoverHost = null;
        this._menuItem = null;
    }

    _replaceChild(host, actor) {
        host.get_child()?.destroy();
        host.set_child(actor);
    }
}
