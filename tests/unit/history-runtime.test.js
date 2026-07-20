import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {HistoryRuntime} from '../../extension/history-runtime.js';

function assert(value, message) {
    if (!value) throw new Error(message);
}
function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function throws(callback) {
    try { callback(); } catch { return; }
    throw new Error('expected rejection');
}
function removeTree(path) {
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        return;
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) ===
        Gio.FileType.DIRECTORY) {
        const entries = file.enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info;
        while ((info = entries.next_file(null)))
            removeTree(GLib.build_filenamev([path, info.get_name()]));
        entries.close(null);
    }
    file.delete(null);
}
function readText(path) {
    const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
    return new TextDecoder('utf-8').decode(bytes);
}
function ids(series) {
    return series.map(item => `${item.providerId}:${item.windowId}`);
}
function storedRows(name, key = 'claude:short') {
    const path = GLib.build_filenamev([root, name, 'history.json']);
    return JSON.parse(readText(path)).windows[key] ?? [];
}

const root = GLib.dir_make_tmp('claudex-history-runtime-XXXXXX');
let clock = 0;
function runtime(name, extra = {}) {
    return new HistoryRuntime({
        dir: GLib.build_filenamev([root, name]),
        now: () => clock,
        ...extra,
    });
}
let passed = 0;
function test(name, callback) {
    callback(); print(`ok ${++passed} - ${name}`);
}
try {
    test('records samples, persists them, and reloads across instances', () => {
        clock = 0;
        const instance = runtime('persist');
        instance.record([
            {providerId: 'claude', windowId: 'short', percent: 5},
            {providerId: 'codex', windowId: 'weekly', percent: 20},
        ]);
        clock = 3_600_000;
        instance.record([{providerId: 'claude', windowId: 'short', percent: 50}]);

        const series = instance.series('1h');
        const short = series.find(item => item.windowId === 'short');
        assert(short && short.values.length === 30, 'series length');
        assert(short.values[0] === 5 && short.values.at(-1) === 50, 'carry-forward');

        assert(instance.hasSamples(), 'hasSamples true after recording');
        const reloaded = runtime('persist');
        assert(reloaded.hasSamples(), 'hasSamples true after reload');
        equal(ids(reloaded.series('1h')), ids(series), 'reloaded ids');
        equal(reloaded.series('1h'), series, 'reloaded series');

        const disk = JSON.parse(readText(GLib.build_filenamev([root, 'persist', 'history.json'])));
        assert(disk.version === 1 && disk.windows['claude:short'].length === 2, 'durable file');
    });

    test('ignores malformed and empty record batches', () => {
        clock = 10_000_000;
        const instance = runtime('malformed');
        instance.record([]);
        instance.record(null);
        instance.record([{providerId: 'claude', windowId: 'short', percent: NaN},
            {providerId: '', windowId: 'short', percent: 5}, 42, null]);
        equal(instance.series('1h'), [], 'nothing recorded');
        assert(!instance.hasSamples(), 'hasSamples false when nothing recorded');
        assert(!Gio.File.new_for_path(GLib.build_filenamev([root, 'malformed', 'history.json']))
            .query_exists(null), 'no file written for empty batches');
    });

    test('orders distinct refreshes that complete in the same millisecond', () => {
        clock = 1000;
        const instance = runtime('same-ms');
        instance.record([{providerId: 'claude', windowId: 'short', percent: 10}]);
        instance.record([{providerId: 'claude', windowId: 'short', percent: NaN}]);
        instance.record([{providerId: 'claude', windowId: 'short', percent: 20}]);
        equal(storedRows('same-ms'), [[1000, 10], [1001, 20]],
            'only a successful batch advances the process-local timestamp');
    });

    test('fails closed when an equal timestamp cannot be incremented safely', () => {
        clock = Number.MAX_SAFE_INTEGER;
        const instance = runtime('max-time');
        instance.record([{providerId: 'claude', windowId: 'short', percent: 10}]);
        instance.record([{providerId: 'claude', windowId: 'short', percent: 20}]);
        equal(storedRows('max-time'), [[Number.MAX_SAFE_INTEGER, 10]],
            'the colliding batch is dropped at the safe-integer boundary');
    });

    test('does not synthesize backward, invalid, or unsafe clocks', () => {
        clock = 2000;
        const backward = runtime('backward-time');
        backward.record([{providerId: 'claude', windowId: 'short', percent: 10}]);
        clock = 1999;
        backward.record([{providerId: 'claude', windowId: 'short', percent: 20}]);
        equal(storedRows('backward-time'), [[2000, 10]],
            'backward time remains subject to strict per-window ordering');

        for (const [name, value] of [
            ['negative-time', -1],
            ['fractional-time', 1.5],
            ['infinite-time', Infinity],
            ['unsafe-time', Number.MAX_SAFE_INTEGER + 1],
        ]) {
            clock = value;
            const invalid = runtime(name);
            invalid.record([{providerId: 'claude', windowId: 'short', percent: 10}]);
            assert(!Gio.File.new_for_path(GLib.build_filenamev([root, name, 'history.json']))
                .query_exists(null), `${name} does not persist`);
        }
    });

    test('validates constructor options', () => {
        throws(() => new HistoryRuntime({unknown: true}));
        throws(() => new HistoryRuntime({dir: 'relative'}));
        throws(() => new HistoryRuntime({now: 5}));
        throws(() => new HistoryRuntime(null));
    });

    test('fails closed on a corrupt store file and recovers on the next record', () => {
        const dir = GLib.build_filenamev([root, 'corrupt']);
        GLib.mkdir_with_parents(dir, 0o700);
        GLib.file_set_contents(GLib.build_filenamev([dir, 'history.json']), '{ not json');
        clock = 0;
        const instance = new HistoryRuntime({dir, now: () => clock});
        equal(instance.series('1h'), [], 'corrupt load is empty');
        instance.record([{providerId: 'codex', windowId: 'weekly', percent: 9}]);
        clock = 3_600_000;
        instance.record([{providerId: 'codex', windowId: 'weekly', percent: 12}]);
        assert(instance.series('1h').length === 1, 'recovers after corrupt load');
    });
} finally {
    removeTree(root);
}
print(`History runtime unit suite: ${passed} passed`);
