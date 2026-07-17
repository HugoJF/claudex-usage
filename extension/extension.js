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
    PanelIndicator,
    PopoverScaffold,
    ProviderCard,
    ProviderGroup,
} from './shared/primitives.js';
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

export default class ClaudexUsageExtension extends Extension {
    enable() {
        this._tokens = loadTokens(this.path);
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
        });
        this._render();
    }

    registerProvider(provider) {
        return this._controller.registerProvider(provider);
    }

    refresh() {
        this._controller.refresh();
    }

    getSurfaceSnapshot() {
        return this._controller.getSnapshot();
    }

    disable() {
        if (this._colorSchemeChangedId) {
            St.Settings.get().disconnect(this._colorSchemeChangedId);
            this._colorSchemeChangedId = null;
        }
        this._controller?.dispose();
        this._controller = null;
        this._destroyIndicator();
        this._tokens = null;
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
        const groups = snapshot.providers
            .filter(provider => provider.metrics.length > 0)
            .map(provider => ({
                id: provider.id,
                accessibleName: provider.marks.accessibleName,
                iconPath: `${this.path}/${lightPanel
                    ? provider.marks.lightPanel : provider.marks.darkPanel}`,
                values: provider.metrics.map(metric => ({
                    id: metric.id,
                    percent: metric.percent,
                })),
            }));
        const emptyGroups = snapshot.providers
            .filter(provider => provider.metrics.length === 0)
            .map(provider => ({
                id: provider.id,
                accessibleName: provider.marks.accessibleName,
                iconPath: `${this.path}/${lightPanel
                    ? provider.marks.lightPanel : provider.marks.darkPanel}`,
            }));
        this._replaceChild(this._panelHost, PanelIndicator({
            id: 'claudex-live-panel',
            groups,
            emptyGroups,
            tokens: this._tokens,
        }));
        const children = snapshot.providers.map(provider =>
            this._providerCard(provider));
        children.push(FooterStatus({
            status: snapshot.footer,
            action: {
                id: 'refresh-button',
                label: 'Refresh',
                accessibleName: 'Refresh usage',
                onActivate: () => this._controller.refresh(),
            },
        }));
        this._replaceChild(this._popoverHost, PopoverScaffold({
            id: 'claudex-live-popover',
            view: 'usage',
            children,
        }));
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
