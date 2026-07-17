import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatFreshness,
    formatReset,
    SurfaceController,
} from '../../extension/surface-controller.js';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
}

function harness() {
    let now = 1_000_000;
    let nextTimerId = 0;
    const timers = new Map();
    const snapshots = [];
    const controller = new SurfaceController({
        now: () => now,
        schedule: (callback, delay) => {
            const id = ++nextTimerId;
            timers.set(id, {callback, delay});
            return id;
        },
        cancel: id => timers.delete(id),
        onChange: snapshot => snapshots.push(snapshot),
    });
    return {
        controller,
        timers,
        snapshots,
        advance(milliseconds) {
            now += milliseconds;
        },
        runTimer() {
            assert.equal(timers.size, 1, 'exactly one timer is scheduled');
            const [id, timer] = timers.entries().next().value;
            timers.delete(id);
            timer.callback();
            return timer.delay;
        },
    };
}

function provider(overrides = {}) {
    let listener;
    let eligible = true;
    let unsubscribeCount = 0;
    return {
        id: 'claude',
        order: 0,
        label: 'Claude',
        detail: 'Two usage windows',
        marks: {
            darkPanel: 'icons/claude.svg',
            lightPanel: 'icons/claude-light.svg',
            popup: 'icons/claude.svg',
            accessibleName: 'Claude mark',
        },
        windows: [{id: 'short', label: '5-hour window', dataRole: 'dataClaudeShort'}],
        isEligible: () => eligible,
        subscribeEligibility: callback => {
            listener = callback;
            return () => unsubscribeCount += 1;
        },
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'short', percent: 25, resetAtMs: 1_120_000}],
        }),
        setEligible(value) {
            eligible = value;
            listener(value);
        },
        emit(value) {
            listener(value);
        },
        get unsubscribeCount() {
            return unsubscribeCount;
        },
        ...overrides,
    };
}

test('provider registration validates immutable presentation metadata and paths', () => {
    const invalid = [
        provider({id: 'unsafe id'}),
        provider({order: -1}),
        provider({label: ''}),
        provider({marks: {...provider().marks, popup: '../icon.svg'}}),
        provider({windows: []}),
        provider({windows: [{id: 'short', label: 'Short', dataRole: 'not-a-role'}]}),
        provider({isEligible: () => 1}),
        provider({subscribeEligibility: () => null}),
    ];
    for (const item of invalid) {
        const {controller} = harness();
        assert.throws(() => controller.registerProvider(item));
    }

    const {controller} = harness();
    const item = provider();
    const unregister = controller.registerProvider(item);
    item.label = 'Mutated';
    item.marks.popup = 'icons/other.svg';
    item.windows[0].label = 'Mutated window';
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.providers[0].label, 'Claude');
    assert.equal(snapshot.providers[0].marks.popup, 'icons/claude.svg');
    assert.equal(snapshot.providers[0].windows[0].label, '5-hour window');
    assert.throws(() => controller.registerProvider(provider()), /already registered/);
    unregister();
});

test('strict eligibility, ordering, and observer teardown fail closed', async () => {
    const {controller, timers} = harness();
    const zulu = provider({id: 'zulu', order: 1});
    const alpha = provider({id: 'alpha', order: 1});
    const removeZulu = controller.registerProvider(zulu);
    const removeAlpha = controller.registerProvider(alpha);
    assert.deepEqual(controller.getSnapshot().providers.map(item => item.id),
        ['alpha', 'zulu']);
    zulu.emit('yes');
    assert.deepEqual(controller.getSnapshot().providers.map(item => item.id), ['alpha']);
    removeZulu();
    removeZulu();
    assert.equal(zulu.unsubscribeCount, 1);
    removeAlpha();
    await settle();
    assert.equal(timers.size, 0);
});

test('first eligible provider refreshes immediately and one timer follows completion', async () => {
    const state = harness();
    let calls = 0;
    const item = provider({refresh: async () => {
        calls += 1;
        return {status: 'available', readings: [
            {id: 'short', percent: 25, resetAtMs: 1_120_000},
        ]};
    }});
    state.controller.registerProvider(item);
    assert.equal(calls, 0, 'refresh starts asynchronously');
    await settle();
    assert.equal(calls, 1);
    assert.equal(state.timers.size, 1);
    assert.equal(state.runTimer(), 300000);
    await settle();
    assert.equal(calls, 2);
    assert.equal(state.timers.size, 1);
});

test('manual refresh coalesces, resets scheduling, and independent failures clear stale readings', async () => {
    const state = harness();
    const first = deferred();
    const second = deferred();
    let calls = 0;
    const claude = provider({refresh: () => {
        calls += 1;
        if (calls === 1)
            return first.promise;
        if (calls === 2)
            return second.promise;
        return Promise.resolve({status: 'available', readings: [
            {id: 'short', percent: 30, resetAtMs: 1_120_000},
        ]});
    }});
    const codex = provider({
        id: 'codex',
        order: 1,
        windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
        refresh: async () => ({status: 'available', readings: [
            {id: 'weekly', percent: 50, resetAtMs: 1_180_000},
        ]}),
    });
    state.controller.registerProvider(claude);
    state.controller.registerProvider(codex);
    await settle();
    assert.equal(calls, 1);
    state.controller.refresh();
    state.controller.refresh();
    assert.equal(calls, 1, 'manual refresh does not overlap a pending cycle');
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 25, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(calls, 2);
    assert.equal(state.timers.size, 0, 'newly eligible provider joins a follow-up cycle');
    second.reject(new Error('adapter detail must not escape'));
    await settle();
    const snapshot = state.controller.getSnapshot();
    const claudeModel = snapshot.providers.find(item => item.id === 'claude');
    const codexModel = snapshot.providers.find(item => item.id === 'codex');
    assert.equal(claudeModel.availability, 'unavailable');
    assert.equal(claudeModel.metrics.length, 0);
    assert.equal(codexModel.availability, 'available');
    assert.equal(codexModel.metrics[0].percent, 50);
    assert.equal(state.timers.size, 1);
    state.controller.refresh();
    await settle();
    assert.equal(calls, 3, 'manual refresh cancels the pending timer and starts one cycle');
    assert.equal(state.timers.size, 1, 'manual completion schedules one replacement timer');
});

test('result validation requires exact readings and rejects unavailable readings', async () => {
    const invalidResults = [
        {status: 'available', readings: []},
        {status: 'available', readings: [{id: 'other', percent: 1, resetAtMs: 1}]},
        {status: 'available', readings: [{id: 'short', percent: 101, resetAtMs: 1}]},
        {status: 'available', readings: [{id: 'short', percent: 1, resetAtMs: -1}]},
        {status: 'unavailable', readings: []},
    ];
    for (const result of invalidResults) {
        const state = harness();
        state.controller.registerProvider(provider({refresh: async () => result}));
        await settle();
        const model = state.controller.getSnapshot().providers[0];
        assert.equal(model.availability, 'unavailable');
        assert.equal(model.metrics.length, 0);
    }
});

test('ineligibility, unregister, and disposal cancel timers and ignore late values', async () => {
    const state = harness();
    const pending = deferred();
    const item = provider({refresh: () => pending.promise});
    const unregister = state.controller.registerProvider(item);
    await settle();
    item.setEligible(false);
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);
    pending.resolve({status: 'available', readings: [
        {id: 'short', percent: 99, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(state.controller.getSnapshot().visible, false);
    unregister();
    state.controller.dispose();
    assert.equal(item.unsubscribeCount, 1);
});

test('reset and freshness display round at the intended minute boundaries', () => {
    assert.equal(formatReset(1_000, 1_000), 'Resets now');
    assert.equal(formatReset(1_001, 1_000), 'Resets in 1 min');
    assert.equal(formatReset(61_000, 1_000), 'Resets in 1 min');
    assert.equal(formatReset(3_601_000, 1_000), 'Resets in 1 hr');
    assert.equal(formatReset(90_001_000, 1_000), 'Resets in 1 day, 1 hr');
    assert.equal(formatFreshness(1_000, 1_000), 'Updated just now');
    assert.equal(formatFreshness(1_000, 61_000), 'Updated 1 min ago');
});
