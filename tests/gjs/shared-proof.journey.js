import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'claudex-shared-proof@hugo.local';
export const METRICS = {};
export function init() {}

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Shared proof failed: ${message}`);
    }
}

function findActor(root, name) {
    if (root?.get_name?.() === name) {
        return root;
    }
    for (const child of root?.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

export async function run() {
    await Scripting.sleep(180);
    const extension = Main.extensionManager.lookup(UUID)?.stateObj;
    assert(extension, 'committed second consumer loaded');
    const proof = extension.getProof();
    assert(proof.panel.get_name() === 'proof-panel', 'panel factory is reusable');
    const previous = findActor(proof.range, 'history-range-previous');
    const next = findActor(proof.range, 'history-range-next');
    assert(previous?.get_accessible_name() === 'Previous history range' &&
        next?.get_accessible_name() === 'Next history range',
    'stepper exposes stable accessible controls');
    next.emit('clicked', 1);
    previous.emit('clicked', 1);
    assert(JSON.stringify(proof.events) === JSON.stringify([
        ['1d', 'history-range-next'],
        ['1h', 'history-range-previous'],
    ]), 'stepper wraps and reports stable IDs without catalog state');
}
