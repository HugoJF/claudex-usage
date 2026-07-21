import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {HistoryRangeStepper} from './shared/history-range-stepper.js';
import {HISTORY_RANGES} from './shared/history-ranges.js';
import {PanelIndicator, PopoverScaffold} from './shared/primitives.js';
import {validateTokens} from './shared/token-geometry.js';

function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/tokens.json`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded) {
        throw new Error('Proof tokens did not load');
    }
    return validateTokens(JSON.parse(new TextDecoder().decode(contents)));
}

export default class SharedProofExtension extends Extension {
    enable() {
        const tokens = loadTokens(this.path);
        this.events = [];
        this.panel = PanelIndicator({
            id: 'proof-panel',
            groups: [{
                id: 'aurora',
                iconPath: '/tmp/noncanonical-aurora.svg',
                accessibleName: 'Aurora',
                values: [{id: 'burst', percent: 37.5}],
            }],
            tokens,
        });
        this.range = HistoryRangeStepper({
            choices: HISTORY_RANGES,
            selected: HISTORY_RANGES[1],
            onSelect: (range, controlId) => this.events.push([range.id, controlId]),
        });
        this.root = PopoverScaffold({
            id: 'proof-popover',
            view: 'proof',
            children: [this.panel, this.range],
        });
    }

    getProof() {
        return {root: this.root, panel: this.panel, range: this.range,
            events: this.events};
    }

    disable() {
        this.root?.destroy();
        this.root = null;
        this.panel = null;
        this.range = null;
        this.events = null;
    }
}
