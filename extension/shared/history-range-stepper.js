import Clutter from 'gi://Clutter';
import St from 'gi://St';

const PREVIOUS_ID = 'history-range-previous';
const VALUE_ID = 'history-range-value';
const NEXT_ID = 'history-range-next';

/** @typedef {{index: number, id: string, label: string}} HistoryRangeChoice */
/** @typedef {{choices: readonly HistoryRangeChoice[], selected: HistoryRangeChoice, onSelect: function}} HistoryRangeStepperProps */

function requireProps({choices, selected, onSelect}) {
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new Error('History range choices must be nonempty');
    }
    if (!selected || choices[selected.index] !== selected) {
        throw new Error('Selected history range must belong to choices');
    }
    if (typeof onSelect !== 'function') {
        throw new Error('History range selection must be a callback');
    }
}

function stepButton({id, text, accessibleName, onActivate}) {
    const actor = new St.Button({
        name: id, label: text, style_class: 'claudex-history-range-step',
        can_focus: true, reactive: true, track_hover: true,
    });
    actor.set_accessible_name(accessibleName);
    actor.connect('clicked', onActivate);
    return actor;
}

/** @param {HistoryRangeStepperProps} props */
export function HistoryRangeStepper({choices, selected, onSelect}) {
    requireProps({choices, selected, onSelect});
    const actor = new St.BoxLayout({
        name: 'history-range-stepper',
        style_class: 'claudex-history-range-stepper',
        orientation: Clutter.Orientation.HORIZONTAL,
        x_align: Clutter.ActorAlign.END,
    });
    const choose = (offset, controlId) => {
        const index = (selected.index + offset + choices.length) % choices.length;
        onSelect(choices[index], controlId);
    };
    actor.add_child(stepButton({id: PREVIOUS_ID, text: '<',
        accessibleName: 'Previous history range',
        onActivate: () => choose(-1, PREVIOUS_ID)}));
    actor.add_child(new St.Label({name: VALUE_ID, text: selected.label,
        style_class: 'selected-choice-value', y_align: Clutter.ActorAlign.CENTER}));
    actor.add_child(stepButton({id: NEXT_ID, text: '>',
        accessibleName: 'Next history range',
        onActivate: () => choose(1, NEXT_ID)}));
    return actor;
}
