import assert from 'node:assert/strict';
import test from 'node:test';

import {
    deserializeStore,
    emptyStore,
    hasSamples,
    HISTORY_RANGES,
    recordSample,
    RETENTION_MS,
    SERIES_POINTS,
    serializeStore,
    seriesForRange,
} from '../../extension/history-store.js';

function build(samples) {
    return samples.reduce((store, sample) => recordSample(store, sample), emptyStore());
}
function sample(overrides = {}) {
    return {providerId: 'claude', windowId: 'short', percent: 10, atMs: 1000, ...overrides};
}
function assertDeepFrozen(value) {
    if (value === null || typeof value !== 'object') {
        return;
    }
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) {
        assertDeepFrozen(child);
    }
}

test('recordSample rejects malformed samples and keeps timestamps strictly increasing', () => {
    const malformed = [
        null, undefined, {}, sample({providerId: ''}), sample({windowId: 42}),
        sample({percent: -1}), sample({percent: 100.5}), sample({percent: '10'}),
        sample({percent: NaN}), sample({atMs: -1}), sample({atMs: 1.5}),
        sample({atMs: '1000'}),
    ];
    for (const value of malformed) {
        assert.deepEqual(recordSample(emptyStore(), value), {windows: {}}, `${JSON.stringify(value)}`);
    }
    const store = build([sample({atMs: 1000}), sample({atMs: 1000, percent: 90}),
        sample({atMs: 500, percent: 90})]);
    assert.deepEqual(store.windows['claude:short'], [{atMs: 1000, percent: 10}]);
});

test('recordSample bounds by retention and total sample count, immutably', () => {
    const retained = build([
        sample({atMs: 100, percent: 5}),
        sample({atMs: RETENTION_MS + 101, percent: 9}),
    ]);
    assert.deepEqual(retained.windows['claude:short'], [
        {atMs: RETENTION_MS + 101, percent: 9},
    ]);

    const many = [];
    for (let i = 1; i <= 5002; i++) {
        many.push(sample({atMs: i, percent: i % 101}));
    }
    const capped = build(many);
    assert.equal(capped.windows['claude:short'].length, 5000);
    assert.equal(capped.windows['claude:short'].at(-1).atMs, 5002);

    const base = emptyStore();
    const next = recordSample(base, sample());
    assert.deepEqual(base, {windows: {}});
    assertDeepFrozen(next);
});

test('seriesForRange carries the last sample forward across an aligned grid', () => {
    const now = 100_000_000;
    const start = now - 60 * 60 * 1000;
    const store = build([
        sample({atMs: start, percent: 10}),
        sample({atMs: now, percent: 50}),
    ]);
    const series = seriesForRange(store, '1h', now);
    assert.equal(series.length, 1);
    const [claude] = series;
    assert.deepEqual([claude.providerId, claude.windowId], ['claude', 'short']);
    assert.equal(claude.values.length, SERIES_POINTS);
    assert.equal(claude.values[0], 10);
    assert.equal(claude.values.at(-2), 10);
    assert.equal(claude.values.at(-1), 50);
    assertDeepFrozen(series);
});

test('seriesForRange omits windows without coverage at the range start', () => {
    const now = 100_000_000;
    const covered = build([
        sample({providerId: 'codex', windowId: 'weekly', atMs: now - 7 * 3600_000, percent: 20}),
        sample({providerId: 'codex', windowId: 'weekly', atMs: now, percent: 25}),
        sample({providerId: 'claude', windowId: 'short', atMs: now - 100, percent: 80}),
    ]);
    const series = seriesForRange(covered, '6h', now);
    assert.equal(series.length, 1);
    assert.deepEqual([series[0].providerId, series[0].windowId], ['codex', 'weekly']);
});

test('hasSamples reports whether any window holds a sample', () => {
    assert.equal(hasSamples(emptyStore()), false);
    assert.equal(hasSamples(null), false);
    assert.equal(hasSamples({windows: {'claude:short': []}}), false);
    assert.equal(hasSamples(build([sample()])), true);
});

test('seriesForRange fails closed for unknown ranges, bad now, and empty stores', () => {
    const now = 100_000_000;
    const store = build([sample({atMs: now - 3600_000, percent: 3}), sample({atMs: now, percent: 4})]);
    for (const range of ['2h', '', null, undefined]) {
        assert.deepEqual(seriesForRange(store, range, now), []);
    }
    for (const badNow of [-1, 1.5, NaN, '100']) {
        assert.deepEqual(seriesForRange(store, '1h', badNow), []);
    }
    assert.deepEqual(seriesForRange(emptyStore(), '1h', now), []);
    assert(HISTORY_RANGES.every(range => Number.isSafeInteger(range.spanMs)));
});

test('serialize and deserialize round-trip and fail closed on malformed data', () => {
    const now = 100_000_000;
    const store = build([
        sample({atMs: now - 3600_000, percent: 12}),
        sample({atMs: now, percent: 44}),
        sample({providerId: 'codex', windowId: 'weekly', atMs: now - 3600_000, percent: 5}),
    ]);
    const restored = deserializeStore(JSON.parse(JSON.stringify(serializeStore(store))));
    assert.deepEqual(restored, store);
    assert.deepEqual(seriesForRange(restored, '1h', now), seriesForRange(store, '1h', now));
    assertDeepFrozen(restored);

    assert.deepEqual(deserializeStore(null), {windows: {}});
    assert.deepEqual(deserializeStore({version: 2, windows: {}}), {windows: {}});
    assert.deepEqual(deserializeStore({version: 1, windows: []}), {windows: {}});

    const partial = deserializeStore({version: 1, windows: {
        'claude:short': [[1000, 10], [2000, 20]],
        'codex:weekly': [[3000, 30], [2000, 40]],
        'claude:weekly': [[1000, 150]],
        'bad:row': [[1000]],
    }});
    assert.deepEqual(Object.keys(partial.windows), ['claude:short']);
});
