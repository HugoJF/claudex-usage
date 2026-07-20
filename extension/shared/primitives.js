import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {colorToRgba, progressWidth} from './token-geometry.js';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function requireId(id, context) {
    if (typeof id !== 'string' || !SAFE_ID.test(id))
        throw new Error(`${context} id must be safe`);
    return id;
}

function requireText(value, context) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`${context} must be nonempty text`);
    return value;
}

function requireCallback(value, context) {
    if (typeof value !== 'function')
        throw new Error(`${context} must be a callback`);
    return value;
}

function requirePercent(value, context) {
    if (!Number.isFinite(value) || value < 0 || value > 100)
        throw new Error(`${context} must be a finite percentage from 0 to 100`);
    return value;
}

function requirePositiveInteger(value, context) {
    if (!Number.isInteger(value) || value <= 0)
        throw new Error(`${context} must be a positive integer`);
    return value;
}

function requireUniqueIds(items, context) {
    const ids = new Set();
    for (const item of items) {
        requireId(item.id, context);
        if (ids.has(item.id))
            throw new Error(`${context} ids must be unique`);
        ids.add(item.id);
    }
}

function requireDataRole(dataRole, tokens) {
    requireId(dataRole, 'Data role');
    const color = tokens?.color?.[dataRole];
    if (typeof color !== 'string')
        throw new Error(`Unknown data role: ${dataRole}`);
    colorToRgba(color);
    return color;
}

function dataStyle(dataRole, tokens) {
    const color = requireDataRole(dataRole, tokens);
    return `background-color: ${color}; color: ${color};`;
}

export function validatePresentationModels({
    ids = [],
    percentages = [],
    historySeries = null,
    rangeChoices = null,
    selectedRange = null,
    callbacks = [],
    accessibleNames = [],
    dataRoles = [],
    tokens = null,
}) {
    requireUniqueIds(ids.map(id => ({id})), 'Presentation');
    percentages.forEach((value, index) => requirePercent(value,
        `Presentation percentage ${index}`));
    callbacks.forEach((value, index) => requireCallback(value,
        `Presentation callback ${index}`));
    accessibleNames.forEach((value, index) => requireText(value,
        `Accessible name ${index}`));
    dataRoles.forEach(role => requireDataRole(role, tokens));

    if (historySeries !== null) {
        if (!Array.isArray(historySeries) || historySeries.length === 0)
            throw new Error('History series must be nonempty');
        requireUniqueIds(historySeries, 'History series');
        const pointCount = historySeries[0].values?.length;
        if (!Number.isInteger(pointCount) || pointCount < 2)
            throw new Error('History series require at least two points');
        for (const series of historySeries) {
            if (!Array.isArray(series.values) || series.values.length !== pointCount)
                throw new Error('History series must have equal lengths');
            series.values.forEach(value => requirePercent(value, 'History sample'));
            requireDataRole(series.dataRole, tokens);
            if (!Number.isFinite(series.strokeWidth) || series.strokeWidth <= 0)
                throw new Error('History stroke width must be positive and finite');
        }
    }

    if (rangeChoices !== null || selectedRange !== null) {
        if (!Array.isArray(rangeChoices) || rangeChoices.length === 0)
            throw new Error('Range choices must be nonempty');
        requireUniqueIds(rangeChoices, 'Range choice');
        if (!rangeChoices.some(choice => choice.id === selectedRange))
            throw new Error('Selected range must name an available choice');
    }
    return true;
}

function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL, properties = {}) {
    return new St.BoxLayout({style_class: styleClass, orientation, ...properties});
}

function column(styleClass, properties = {}) {
    return box(styleClass, Clutter.Orientation.VERTICAL, properties);
}

function label(text, styleClass, properties = {}) {
    return new St.Label({
        text: requireText(text, 'Label'),
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...properties,
    });
}

function button({id, text, styleClass, accessibleName, onActivate,
    toggleMode = false, checked = false}) {
    requireId(id, 'Button');
    requireCallback(onActivate, 'Button activation');
    const actor = new St.Button({
        name: id,
        style_class: styleClass,
        can_focus: true,
        reactive: true,
        track_hover: true,
        toggle_mode: toggleMode,
        checked,
        child: label(text, 'claudex-button-label'),
    });
    actor.set_accessible_name(requireText(accessibleName, 'Button accessible name'));
    actor.connect('clicked', onActivate);
    return actor;
}

function providerIcon({path, size, styleClass, accessibleName}) {
    const actor = new St.Icon({
        style_class: styleClass,
        gicon: new Gio.FileIcon({
            file: Gio.File.new_for_path(requireText(path, 'Icon path')),
        }),
        icon_size: size,
        y_align: Clutter.ActorAlign.CENTER,
    });
    actor.set_accessible_name(requireText(accessibleName, 'Icon accessible name'));
    return actor;
}

export function PopoverScaffold({id, view, children}) {
    requireId(id, 'Popover');
    requireId(view, 'Popover view');
    const actor = column(`claudex-popover direction-selected selected-${view}`, {
        name: id,
    });
    for (const child of children)
        actor.add_child(child);
    return actor;
}

export function PanelIndicator({id, groups, emptyGroups = [], tokens}) {
    requireId(id, 'Panel indicator');
    requireUniqueIds(groups, 'Panel group');
    requireUniqueIds(emptyGroups, 'Empty panel group');
    for (const group of emptyGroups) {
        requireText(group.accessibleName, 'Empty panel group accessible name');
        requireText(group.iconPath, 'Empty panel group icon path');
    }
    for (const group of groups) {
        requireUniqueIds(group.values, 'Panel value');
        requireText(group.accessibleName, 'Panel group accessible name');
        requireText(group.iconPath, 'Panel group icon path');
        group.values.forEach(value => {
            requirePercent(value.percent, `Panel value ${value.id}`);
        });
    }
    const actor = box('claudex-panel claudex-panel-selected',
        Clutter.Orientation.HORIZONTAL, {name: id});
    const rendered = groups.length > 0 ? groups : emptyGroups;
    rendered.forEach((group, index) => {
        if (index > 0) {
            actor.add_child(new St.Widget({
                style_class: 'claudex-panel-provider-divider',
                width: 1,
                height: 12,
            }));
        }
        const item = box('claudex-panel-provider');
        const values = group.values ?? [];
        const empty = values.length === 0;
        item.add_child(providerIcon({
            path: group.iconPath,
            size: tokens.size.panelProviderIcon,
            styleClass: `claudex-panel-provider-icon${empty ? ' muted' : ''}`,
            accessibleName: group.accessibleName,
        }));
        if (!empty) {
            item.add_child(label(values.map(value => `${value.percent}%`).join(' · '),
                'claudex-panel-selected-value'));
        }
        actor.add_child(item);
    });
    return actor;
}

export function ProviderGroup({model, tokens}) {
    requireId(model.id, 'Provider group');
    const actor = box('claudex-provider-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    actor.add_child(providerIcon({
        path: model.iconPath,
        size: tokens.size.providerIcon,
        styleClass: 'claudex-provider-icon',
        accessibleName: model.iconAccessibleName,
    }));
    const copy = column('claudex-provider-copy', {x_expand: true});
    copy.add_child(label(model.label, 'claudex-provider-name'));
    copy.add_child(label(model.detail, 'claudex-provider-detail'));
    actor.add_child(copy);
    return actor;
}

export function ProgressBar({metric, tokens}) {
    requireId(metric.id, 'Progress');
    requirePercent(metric.percent, 'Progress percentage');
    const roleStyle = dataStyle(metric.dataRole, tokens);
    const width = tokens.size.progressWidth;
    const height = tokens.size.progressHeight;
    const actor = new St.Widget({
        name: `progress-${metric.id}`,
        style_class: 'claudex-progress-track',
        layout_manager: new Clutter.FixedLayout(),
        width,
        height,
        accessible_role: Atk.Role.PROGRESS_BAR,
    });
    actor.set_accessible_name(requireText(metric.accessibleName,
        'Progress accessible name'));

    const fillWidth = progressWidth(metric.percent, width);
    if (fillWidth > 0) {
        actor.add_child(new St.Widget({
            name: `progress-fill-${metric.id}`,
            style_class: 'claudex-progress-fill',
            style: roleStyle,
            width: fillWidth,
            height,
            x: 0,
            y: 0,
        }));
    }
    return actor;
}

export function UsageMetric({metric, tokens}) {
    const actor = column('claudex-metric', {x_expand: true});
    const top = box('claudex-metric-top', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    top.add_child(label(metric.label, 'claudex-window', {x_expand: true}));
    top.add_child(label(`${metric.percent}%`, 'claudex-percent'));
    actor.add_child(top);
    actor.add_child(ProgressBar({metric, tokens}));
    actor.add_child(label(metric.resetLabel, 'claudex-reset'));
    return actor;
}

export function ProviderCard({id, provider, metrics, tokens}) {
    requireId(id, 'Provider card');
    requireUniqueIds(metrics, 'Usage metric');
    const actor = column('selected-provider-card', {name: id});
    actor.add_child(ProviderGroup({model: provider, tokens}));
    for (const metric of metrics)
        actor.add_child(UsageMetric({metric, tokens}));
    return actor;
}

export function HistoryChart({id, series, accessibleName, axisLabels, tokens}) {
    requireId(id, 'History chart');
    validatePresentationModels({
        historySeries: series,
        accessibleNames: [accessibleName],
        tokens,
    });
    const drawingSeries = series.map(item => ({
        ...item,
        values: [...item.values],
    }));
    const frame = box('claudex-chart-frame', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const chart = new St.DrawingArea({
        name: id,
        style_class: 'claudex-chart',
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        height: tokens.size.chartHeight,
        accessible_role: Atk.Role.CHART,
    });
    chart.set_accessible_name(accessibleName);
    chart.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        const top = 5;
        const bottom = height - 5;
        cr.setLineWidth(tokens.stroke.grid);
        cr.setSourceRGBA(...colorToRgba(tokens.color.grid));
        for (const value of [0, 25, 50, 75, 100]) {
            const y = bottom - value / 100 * (bottom - top);
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }
        cr.stroke();

        for (const item of drawingSeries) {
            cr.setSourceRGBA(...colorToRgba(tokens.color[item.dataRole]));
            cr.setLineWidth(item.strokeWidth);
            item.values.forEach((value, index) => {
                const x = index * (width - 2) / (item.values.length - 1) + 1;
                const y = bottom - value / 100 * (bottom - top);
                if (index === 0)
                    cr.moveTo(x, y);
                else
                    cr.lineTo(x, y);
            });
            cr.stroke();
        }
        cr.$dispose();
    });
    frame.add_child(chart);

    const axis = column('claudex-chart-axis');
    axisLabels.forEach(value => axis.add_child(label(value,
        'claudex-chart-axis-label', {y_expand: true})));
    frame.add_child(axis);
    return frame;
}

export function Legend({entries, tokens}) {
    requireUniqueIds(entries, 'Legend entry');
    const actor = box('claudex-legend');
    for (const entry of entries) {
        const item = box('claudex-legend-item');
        item.add_child(new St.Widget({
            style_class: 'claudex-legend-dot',
            style: dataStyle(entry.dataRole, tokens),
            width: 8,
            height: 8,
        }));
        item.add_child(label(entry.label, 'claudex-legend-label'));
        actor.add_child(item);
    }
    return actor;
}

export function RangeSelector({choices, selected, onSelect}) {
    validatePresentationModels({
        rangeChoices: choices,
        selectedRange: selected,
        callbacks: [onSelect],
    });
    const actor = box('claudex-range-selector');
    for (const choice of choices) {
        const active = choice.id === selected;
        const rangeButton = button({
            id: `range-${choice.id}`,
            text: choice.label,
            styleClass: `claudex-range-button${active ? ' active' : ''}`,
            accessibleName: choice.accessibleName,
            toggleMode: true,
            checked: active,
            onActivate: () => onSelect(choice.id),
        });
        rangeButton.accessible_role = Atk.Role.RADIO_BUTTON;
        actor.add_child(rangeButton);
    }
    return actor;
}

export function CompactSelect({id, choices, selected, accessibleName, onSelect,
    tokens}) {
    requireId(id, 'Compact select');
    requireText(accessibleName, 'Compact select accessible name');
    requireCallback(onSelect, 'Compact select selection');
    const iconSize = requirePositiveInteger(tokens?.size?.settingsIcon,
        'Compact select icon size');
    if (!Array.isArray(choices) || choices.length === 0)
        throw new Error('Compact select choices must be nonempty');
    const models = choices.map(choice => Object.freeze({
        id: requireId(choice?.id, 'Compact select choice'),
        label: requireText(choice?.label, 'Compact select choice label'),
        accessibleName: requireText(choice?.accessibleName,
            'Compact select choice accessible name'),
    }));
    requireUniqueIds(models, 'Compact select choice');
    const selectedIndex = models.findIndex(choice => choice.id === selected);
    if (selectedIndex < 0)
        throw new Error('Compact select selection must name an available choice');

    const actor = column('claudex-compact-select', {
        name: `compact-select-${id}`,
        x_align: Clutter.ActorAlign.END,
    });
    const triggerRow = box('selected-choice-row',
        Clutter.Orientation.HORIZONTAL);
    triggerRow.add_child(label(models[selectedIndex].label,
        'selected-choice-value'));
    triggerRow.add_child(new St.Icon({
        icon_name: 'pan-down-symbolic',
        icon_size: Math.max(1, Math.floor(iconSize / 2)),
    }));
    const trigger = new St.Button({
        name: `select-${id}`,
        style_class: 'selected-choice-button claudex-select-trigger',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: triggerRow,
        accessible_role: Atk.Role.COMBO_BOX,
    });
    trigger.set_accessible_name(accessibleName);
    trigger.add_accessible_state(Atk.StateType.EXPANDABLE);
    actor.add_child(trigger);

    const optionList = column('claudex-select-options', {
        name: `select-${id}-options`,
        x_align: Clutter.ActorAlign.END,
        accessible_role: Atk.Role.LIST_BOX,
    });
    optionList.set_accessible_name(`${accessibleName} options`);
    const optionActors = models.map((choice, index) => {
        const active = index === selectedIndex;
        const row = box('selected-choice-row', Clutter.Orientation.HORIZONTAL, {
            x_expand: true,
        });
        row.add_child(label(choice.label, 'selected-choice-value', {
            x_expand: true,
        }));
        if (active) {
            row.add_child(new St.Icon({
                icon_name: 'object-select-symbolic',
                icon_size: Math.max(1, Math.floor(iconSize / 2)),
            }));
        }
        const option = new St.Button({
            name: `select-${id}-option-${choice.id}`,
            style_class: `claudex-select-option${active ? ' active' : ''}`,
            can_focus: false,
            reactive: true,
            track_hover: true,
            toggle_mode: true,
            checked: active,
            child: row,
            accessible_role: Atk.Role.RADIO_BUTTON,
        });
        option.set_accessible_name(choice.accessibleName);
        optionList.add_child(option);
        return option;
    });
    actor.add_child(optionList);
    optionList.hide();

    trigger.get_accessible().add_relationship(
        Atk.RelationType.CONTROLLER_FOR, optionList.get_accessible());
    optionList.get_accessible().add_relationship(
        Atk.RelationType.CONTROLLED_BY, trigger.get_accessible());

    let open = false;
    const focusOption = index => optionActors[index].grab_key_focus();
    const closeOptions = (focusTrigger = true) => {
        if (!open)
            return;
        open = false;
        optionList.hide();
        for (const option of optionActors)
            option.can_focus = false;
        trigger.remove_accessible_state(Atk.StateType.EXPANDED);
        if (focusTrigger)
            trigger.grab_key_focus();
    };
    const openOptions = (focusIndex = selectedIndex) => {
        if (!open) {
            open = true;
            for (const option of optionActors)
                option.can_focus = true;
            optionList.show();
            trigger.add_accessible_state(Atk.StateType.EXPANDED);
        }
        focusOption(focusIndex);
    };
    const choose = index => {
        closeOptions(true);
        onSelect(models[index].id);
    };

    trigger.connect('clicked', () => {
        if (open)
            closeOptions(true);
        else
            openOptions();
    });
    trigger.connect('key-press-event', (_actor, event) => {
        switch (event.get_key_symbol()) {
        case Clutter.KEY_Down:
        case Clutter.KEY_Up:
            openOptions();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Escape:
            if (!open)
                return Clutter.EVENT_PROPAGATE;
            closeOptions(true);
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    });
    optionActors.forEach((option, index) => {
        option.connect('clicked', () => choose(index));
        option.connect('key-press-event', (_actor, event) => {
            switch (event.get_key_symbol()) {
            case Clutter.KEY_Down:
                focusOption((index + 1) % optionActors.length);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Up:
                focusOption((index - 1 + optionActors.length) %
                    optionActors.length);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Home:
                focusOption(0);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_End:
                focusOption(optionActors.length - 1);
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Escape:
                closeOptions(true);
                return Clutter.EVENT_STOP;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
        });
    });

    actor.connect('notify::mapped', () => {
        if (!actor.mapped)
            closeOptions(false);
    });
    actor.focusTrigger = () => trigger.grab_key_focus();
    return actor;
}

export function IconButton({id, iconName, accessibleName, onActivate, tokens}) {
    requireId(id, 'Icon button');
    requireCallback(onActivate, 'Icon button activation');
    const actor = new St.Button({
        name: id,
        style_class: 'selected-settings-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        child: new St.Icon({
            icon_name: requireText(iconName, 'Symbolic icon'),
            icon_size: tokens.size.settingsIcon,
        }),
    });
    actor.set_accessible_name(requireText(accessibleName,
        'Icon button accessible name'));
    actor.connect('clicked', onActivate);
    return actor;
}

export function Switch({active, tokens}) {
    if (typeof active !== 'boolean')
        throw new Error('Switch active state must be boolean');
    const actor = new St.Widget({
        style_class: `selected-switch${active ? ' active' : ''}`,
        layout_manager: new Clutter.FixedLayout(),
        width: tokens.size.switchTrackWidth,
        height: tokens.size.switchTrackHeight,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        reactive: false,
    });
    actor.add_child(new St.Widget({
        style_class: 'selected-switch-knob',
        width: tokens.size.switchThumb,
        height: tokens.size.switchThumb,
        x: active
            ? tokens.size.switchTrackWidth - tokens.size.switchThumb -
                tokens.size.switchInset
            : tokens.size.switchInset,
        y: tokens.size.switchInset,
        reactive: false,
    }));
    return actor;
}

export function SettingsRow({id, title, description, accessibleName, active,
    onToggle, tokens}) {
    requireId(id, 'Settings row');
    requireCallback(onToggle, 'Settings row activation');
    const row = box('selected-setting-row', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const copy = column('selected-setting-copy', {x_expand: true});
    copy.add_child(label(title, 'selected-setting-title'));
    copy.add_child(label(description, 'selected-setting-description'));
    row.add_child(copy);
    row.add_child(Switch({active, tokens}));

    const actor = new St.Button({
        name: `toggle-${id}`,
        style_class: 'selected-setting-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        toggle_mode: true,
        checked: active,
        child: row,
        accessible_role: Atk.Role.SWITCH,
    });
    actor.set_accessible_name(requireText(accessibleName,
        'Settings row accessible name'));
    actor.connect('clicked', () => onToggle(id));
    return actor;
}

export function ChoiceRow({id, title, value, accessibleName, onActivate}) {
    requireId(id, 'Choice row');
    requireCallback(onActivate, 'Choice row activation');
    const row = box('selected-choice-row', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    row.add_child(label(title, 'selected-setting-title', {x_expand: true}));
    row.add_child(label(value, 'selected-choice-value'));
    const actor = new St.Button({
        name: id,
        style_class: 'selected-choice-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: row,
    });
    actor.set_accessible_name(requireText(accessibleName,
        'Choice row accessible name'));
    actor.connect('clicked', onActivate);
    return actor;
}

export function FooterStatus({status, action}) {
    const actor = box('claudex-footer', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    actor.add_child(label(status, 'claudex-updated', {x_expand: true}));
    actor.add_child(button({
        id: action.id,
        text: action.label,
        styleClass: 'claudex-text-button',
        accessibleName: action.accessibleName,
        onActivate: action.onActivate,
    }));
    return actor;
}
