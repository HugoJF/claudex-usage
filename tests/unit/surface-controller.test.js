import assert from 'node:assert/strict';
import test from 'node:test';

import {
    elapsedWindowPercent,
    formatFreshness,
    formatReset,
    nextMinuteDelay,
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

function harness(initialNow = 1_000_000) {
    let now = initialNow;
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
        setNow(value) {
            now = value;
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
            listener?.(value);
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
        ...[null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(durationMs =>
            provider({windows: [{
                id: 'short',
                label: 'Short',
                dataRole: 'dataClaudeShort',
                durationMs,
            }]})),
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

test('optional duration snapshots immutably and derives elapsed window time', async () => {
    const state = harness();
    const paced = provider({
        windows: [{
            id: 'short',
            label: '4-minute window',
            dataRole: 'dataClaudeShort',
            durationMs: 240_000,
        }],
    });
    state.controller.registerProvider(paced);
    paced.windows[0].durationMs = 1;
    await settle();
    const snapshot = state.controller.getSnapshot();
    assert.equal(snapshot.providers[0].windows[0].durationMs, 240_000);
    assert.equal(snapshot.providers[0].metrics[0].elapsedPercent, 50);
    assert(Object.isFrozen(snapshot.providers[0].windows[0]));

    const unpacedState = harness();
    unpacedState.controller.registerProvider(provider());
    await settle();
    const unpaced = unpacedState.controller.getSnapshot().providers[0];
    assert(!Object.hasOwn(unpaced.windows[0], 'durationMs'));
    assert(!Object.hasOwn(unpaced.metrics[0], 'elapsedPercent'));
    assert(!Object.hasOwn(unpaced.metrics[0], 'weekdayElapsedPercent'));
});

test('weekly pace compresses the provider window onto local weekdays', async () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const fridayAtTwenty = new Date(2026, 6, 17, 20).getTime();
    const mondayAtFour = new Date(2026, 6, 20, 4).getTime();
    const state = harness(fridayAtTwenty);
    state.controller.registerProvider(provider({
        windows: [{
            id: 'weekly',
            label: 'Weekly window',
            dataRole: 'dataClaudeWeekly',
            durationMs: week,
        }],
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'weekly', percent: 25, resetAtMs: mondayAtFour}],
        }),
    }));
    await settle();

    let metric = state.controller.getSnapshot().providers[0].metrics[0];
    assert(Math.abs(metric.elapsedPercent - 2 / 3 * 100) < 1e-10);
    assert(Math.abs(metric.weekdayElapsedPercent - 112 / 120 * 100) < 1e-10,
        'Friday 20:00 leaves eight weekday pacing hours before Monday 04:00');

    state.advance(16 * 60 * 60 * 1000);
    metric = state.controller.getSnapshot().providers[0].metrics[0];
    const saturdayPace = metric.weekdayElapsedPercent;
    assert(Math.abs(saturdayPace - 116 / 120 * 100) < 1e-10,
        'Saturday starts with four weekday pacing hours remaining');
    state.advance(24 * 60 * 60 * 1000);
    metric = state.controller.getSnapshot().providers[0].metrics[0];
    assert.equal(metric.weekdayElapsedPercent, saturdayPace,
        'weekend clock time contributes no pacing time');
    state.advance(16 * 60 * 60 * 1000);
    assert.equal(state.controller.getSnapshot().providers[0].metrics[0]
        .weekdayElapsedPercent, 100);
});

test('unrepresentable weekly calendars remain distinct from non-weekly windows',
    async () => {
        const week = 7 * 24 * 60 * 60 * 1000;
        const state = harness();
        state.controller.registerProvider(provider({
            windows: [{
                id: 'weekly',
                label: 'Weekly window',
                dataRole: 'dataClaudeWeekly',
                durationMs: week,
            }],
            refresh: async () => ({
                status: 'available',
                readings: [{
                    id: 'weekly',
                    percent: 25,
                    resetAtMs: Number.MAX_SAFE_INTEGER,
                }],
            }),
        }));
        await settle();
        const metric = state.controller.getSnapshot().providers[0].metrics[0];
        assert.equal(metric.elapsedPercent, 0);
        assert(Object.hasOwn(metric, 'weekdayElapsedPercent'));
        assert.equal(metric.weekdayElapsedPercent, null);
    });

test('failed provisional registration is inert and releases its provider ID', async () => {
    const state = harness();
    let escaped = null;
    let calls = 0;
    const invalid = provider({
        id: 'rollback',
        isEligible: () => false,
        subscribeEligibility: callback => {
            escaped = callback;
            callback(true);
            return null;
        },
        refresh: async () => {
            calls += 1;
            return {status: 'unavailable'};
        },
    });
    assert.throws(() => state.controller.registerProvider(invalid),
        /unsubscribe callback/);
    escaped(true);
    await settle();
    assert.equal(calls, 0);
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);

    const replacement = provider({id: 'rollback'});
    state.controller.registerProvider(replacement);
    await settle();
    assert.equal(state.controller.getSnapshot().providers[0].id, 'rollback',
        'a failed transaction releases the provider ID');

    const thrownState = harness();
    let thrownEscaped = null;
    const thrown = provider({
        id: 'thrown',
        isEligible: () => false,
        subscribeEligibility: callback => {
            thrownEscaped = callback;
            callback(true);
            throw new Error('subscription detail');
        },
    });
    assert.throws(() => thrownState.controller.registerProvider(thrown),
        /subscription detail/);
    thrownEscaped(true);
    await settle();
    assert.equal(thrownState.controller.getSnapshot().visible, false);
    assert.equal(thrownState.timers.size, 0);
    thrownState.controller.registerProvider(provider({id: 'thrown'}));
    await settle();
    assert.equal(thrownState.controller.getSnapshot().providers[0].id, 'thrown');
});

test('registration survives caught reentrancy and rolls back uncaught reentrancy', async () => {
    const caught = harness();
    let nestedError = null;
    const caughtOuter = provider({
        id: 'reserved',
        isEligible: () => {
            try {
                caught.controller.registerProvider(provider({id: 'reserved'}));
            } catch (error) {
                nestedError = error;
            }
            return true;
        },
    });
    caught.controller.registerProvider(caughtOuter);
    await settle();
    assert.match(nestedError.message, /already registered/);
    assert.deepEqual(caught.controller.getSnapshot().providers.map(item => item.id),
        ['reserved']);

    const uncaught = harness();
    const uncaughtOuter = provider({
        id: 'reserved',
        isEligible: () => uncaught.controller.registerProvider(
            provider({id: 'reserved'})),
    });
    assert.throws(() => uncaught.controller.registerProvider(uncaughtOuter),
        /already registered/);
    uncaught.controller.registerProvider(provider({id: 'reserved'}));
    await settle();
    assert.deepEqual(uncaught.controller.getSnapshot().providers.map(item => item.id),
        ['reserved'], 'an uncaught recursive registration leaves no ghost state');
});

test('an ID getter cannot overwrite a provider committed reentrantly', async () => {
    const state = harness();
    let nestedCalls = 0;
    let outerSubscriptions = 0;
    const nested = provider({
        id: 'getter-id',
        refresh: async () => {
            nestedCalls += 1;
            return {status: 'available', readings: [
                {id: 'short', percent: 25, resetAtMs: 1_120_000},
            ]};
        },
    });
    const outer = provider({
        subscribeEligibility: () => {
            outerSubscriptions += 1;
            return () => {};
        },
    });
    let firstRead = true;
    Object.defineProperty(outer, 'id', {
        get() {
            if (firstRead) {
                firstRead = false;
                state.controller.registerProvider(nested);
            }
            return 'getter-id';
        },
    });
    assert.throws(() => state.controller.registerProvider(outer), /already registered/);
    await settle();
    assert.equal(nestedCalls, 1);
    assert.equal(outerSubscriptions, 0);
    assert.deepEqual(state.controller.getSnapshot().providers.map(item => item.id),
        ['getter-id']);
});

test('reentrant disposal stops provisional registration at the current external access', () => {
    const metadata = harness();
    const metadataProvider = provider();
    let detailReads = 0;
    let subscriptionReads = 0;
    Object.defineProperty(metadataProvider, 'label', {
        get() {
            metadata.controller.dispose();
            return 'Claude';
        },
    });
    Object.defineProperty(metadataProvider, 'detail', {
        get() {
            detailReads += 1;
            return 'Must not be read';
        },
    });
    Object.defineProperty(metadataProvider, 'subscribeEligibility', {
        get() {
            subscriptionReads += 1;
            return () => () => {};
        },
    });
    assert.throws(() => metadata.controller.registerProvider(metadataProvider),
        /disposed/);
    assert.equal(detailReads, 0);
    assert.equal(subscriptionReads, 0);

    const duration = harness();
    const durationProvider = provider();
    let eligibilityReads = 0;
    Object.defineProperty(durationProvider.windows[0], 'durationMs', {
        get() {
            duration.controller.dispose();
            return 18_000_000;
        },
    });
    Object.defineProperty(durationProvider, 'isEligible', {
        get() {
            eligibilityReads += 1;
            return () => true;
        },
    });
    assert.throws(() => duration.controller.registerProvider(durationProvider),
        /disposed/);
    assert.equal(eligibilityReads, 0,
        'duration getter disposal stops before lifecycle callback reads');

    const eligibility = harness();
    const eligibilityProvider = provider();
    let subscribeReads = 0;
    eligibilityProvider.isEligible = () => {
        eligibility.controller.dispose();
        return true;
    };
    Object.defineProperty(eligibilityProvider, 'subscribeEligibility', {
        get() {
            subscribeReads += 1;
            return () => () => {};
        },
    });
    assert.throws(() => eligibility.controller.registerProvider(eligibilityProvider),
        /disposed/);
    assert.equal(subscribeReads, 0);
});

test('failed subscription cleanup runs once without replacing the primary error', async () => {
    const state = harness();
    let cleanupCalls = 0;
    let escaped = null;
    const item = provider({
        subscribeEligibility: callback => {
            escaped = callback;
            callback(true);
            state.controller.dispose();
            return () => {
                cleanupCalls += 1;
                throw new Error('cleanup detail');
            };
        },
    });
    assert.throws(() => state.controller.registerProvider(item), /disposed/);
    escaped(true);
    await settle();
    assert.equal(cleanupCalls, 1);
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);
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

test('a provider becoming eligible replaces the cadence timer with one shared refresh', async () => {
    const state = harness();
    let claudeCalls = 0;
    let codexCalls = 0;
    const claude = provider({refresh: async () => ({
        status: 'available',
        readings: [{id: 'short', percent: ++claudeCalls, resetAtMs: 1_120_000}],
    })});
    const codex = provider({
        id: 'codex',
        order: 1,
        windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'weekly', percent: ++codexCalls, resetAtMs: 1_180_000}],
        }),
    });
    codex.setEligible(false);
    state.controller.registerProvider(claude);
    state.controller.registerProvider(codex);
    await settle();
    assert.equal(claudeCalls, 1);
    assert.equal(codexCalls, 0);
    assert.equal(state.timers.size, 1);

    codex.setEligible(true);
    assert.equal(state.timers.size, 0, 'eligibility cancels the cadence timer');
    await settle();
    assert.equal(claudeCalls, 2, 'the existing provider joins the shared cycle');
    assert.equal(codexCalls, 1, 'the newly eligible provider refreshes immediately');
    assert.equal(state.timers.size, 1);

    codex.emit(true);
    await settle();
    assert.deepEqual([claudeCalls, codexCalls], [2, 1],
        'a repeated eligibility value is a no-op');
    assert.equal(state.timers.size, 1);
});

test('eligibility during an in-flight cycle queues one non-overlapping follow-up', async () => {
    const state = harness();
    const first = deferred();
    let claudeCalls = 0;
    let codexCalls = 0;
    const claude = provider({refresh: () => {
        claudeCalls += 1;
        return claudeCalls === 1 ? first.promise : Promise.resolve({
            status: 'available',
            readings: [{id: 'short', percent: 31, resetAtMs: 1_120_000}],
        });
    }});
    const codex = provider({
        id: 'codex',
        order: 1,
        windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
        refresh: async () => {
            codexCalls += 1;
            return {status: 'available', readings: [
                {id: 'weekly', percent: 41, resetAtMs: 1_180_000},
            ]};
        },
    });
    codex.setEligible(false);
    state.controller.registerProvider(claude);
    state.controller.registerProvider(codex);
    await settle();
    assert.equal(claudeCalls, 1);

    codex.setEligible(true);
    codex.emit(true);
    await settle();
    assert.deepEqual([claudeCalls, codexCalls], [1, 0],
        'the in-flight cycle is not overlapped');
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 21, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.deepEqual([claudeCalls, codexCalls], [2, 1],
        'all eligibility demand coalesces into one follow-up');
    const refreshingEdges = state.snapshots.map(snapshot => snapshot.refreshing)
        .filter((value, index, values) => index === 0 || value !== values[index - 1]);
    assert(refreshingEdges.some((value, index) => value === true &&
        refreshingEdges[index + 1] === false && refreshingEdges[index + 2] === true),
    'completion is observable before the queued follow-up starts');
    assert.equal(state.timers.size, 1);
});

test('queued demand clears across a zero-provider gap', async () => {
    const state = harness();
    const first = deferred();
    let calls = 0;
    const item = provider({refresh: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve({
            status: 'available',
            readings: [{id: 'short', percent: 25, resetAtMs: 1_120_000}],
        });
    }});
    const companion = provider({id: 'companion', order: 1});
    companion.setEligible(false);
    state.controller.registerProvider(item);
    state.controller.registerProvider(companion);
    await settle();
    companion.setEligible(true);
    item.setEligible(false);
    companion.setEligible(false);
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 20, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);

    item.setEligible(true);
    await settle();
    await settle();
    assert.equal(calls, 2, 'reeligibility starts exactly one new cycle');
    assert.equal(state.timers.size, 1);
});

test('eligibility churn and teardown before the adapter microtask prevent access', async () => {
    for (const transition of ['false', 'invalid', 'unregister', 'dispose']) {
        const state = harness();
        let calls = 0;
        const item = provider({refresh: async () => {
            calls += 1;
            return {status: 'available', readings: [
                {id: 'short', percent: 25, resetAtMs: 1_120_000},
            ]};
        }});
        const unregister = state.controller.registerProvider(item);
        if (transition === 'false')
            item.setEligible(false);
        else if (transition === 'invalid')
            item.emit('invalid');
        else if (transition === 'unregister')
            unregister();
        else
            state.controller.dispose();
        await settle();
        assert.equal(calls, 0, `${transition} blocks deferred provider access`);
        assert.equal(state.timers.size, 0);
    }
});

test('cadence changes replace one pending timer without forcing an overlapping refresh', async () => {
    const state = harness();
    const first = deferred();
    let calls = 0;
    state.controller.registerProvider(provider({refresh: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve({status: 'available', readings: [
            {id: 'short', percent: 25, resetAtMs: 1_120_000},
        ]});
    }}));
    await settle();
    state.controller.setRefreshIntervalMs(600000);
    assert.equal(state.timers.size, 0, 'pending first cycle owns no timer');
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 25, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(state.runTimer(), 600000);
    await settle();
    state.controller.setRefreshIntervalMs(900000);
    assert.equal(state.runTimer(), 900000);
    await settle();
    assert.equal(calls, 3, 'rescheduling does not trigger a duplicate cycle');
    assert.throws(() => state.controller.setRefreshIntervalMs(0));
    assert.throws(() => state.controller.setRefreshIntervalMs(Number.MAX_SAFE_INTEGER + 1));
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

test('refreshing keeps the last completion freshness while initial work stays unchecked',
    async () => {
        const state = harness();
        const first = deferred();
        const second = deferred();
        let calls = 0;
        state.controller.registerProvider(provider({refresh: () => {
            calls += 1;
            return calls === 1 ? first.promise : second.promise;
        }}));
        await settle();
        let snapshot = state.controller.getSnapshot();
        assert.equal(snapshot.refreshing, true);
        assert.equal(snapshot.footer, 'Not checked yet');

        first.resolve({status: 'available', readings: [
            {id: 'short', percent: 25, resetAtMs: 1_120_000},
        ]});
        await settle();
        assert.equal(state.controller.getSnapshot().footer, 'Updated just now');

        state.advance(61_000);
        state.controller.refresh();
        await settle();
        snapshot = state.controller.getSnapshot();
        assert.equal(snapshot.refreshing, true);
        assert.equal(snapshot.footer, 'Updated 1 min ago');

        second.resolve({status: 'unavailable'});
        await settle();
        snapshot = state.controller.getSnapshot();
        assert.equal(snapshot.refreshing, false);
        assert.equal(snapshot.footer, 'Checked just now');
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

test('minute alignment stays bounded and rejects clocks outside its integer domain', () => {
    assert.equal(nextMinuteDelay(0), 60_000);
    assert.equal(nextMinuteDelay(1), 59_999);
    assert.equal(nextMinuteDelay(59_999), 1);
    assert.equal(nextMinuteDelay(60_000), 60_000);
    assert.equal(nextMinuteDelay(65_000), 55_000);
    const extreme = nextMinuteDelay(Number.MAX_SAFE_INTEGER);
    assert(Number.isSafeInteger(extreme) && extreme >= 1 && extreme <= 60_000);
    for (const invalid of [-1, 1.5, NaN, Infinity,
        Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => nextMinuteDelay(invalid));
    }
});

test('invalid clocks preserve readings while omitting temporal derivations', async () => {
    const state = harness();
    state.controller.registerProvider(provider({
        windows: [{
            id: 'short',
            label: '4-minute window',
            dataRole: 'dataClaudeShort',
            durationMs: 240_000,
        }],
    }));
    await settle();
    assert.equal(state.timers.size, 1, 'refresh cadence remains scheduled');

    for (const invalid of [NaN, Infinity, -1, 1.5,
        Number.MAX_SAFE_INTEGER + 1]) {
        state.setNow(invalid);
        const snapshot = state.controller.getSnapshot();
        const metric = snapshot.providers[0].metrics[0];
        assert.equal(snapshot.clockValid, false);
        assert.equal(metric.percent, 25);
        assert.equal(metric.resetLabel, 'Reset time unavailable');
        assert(!Object.hasOwn(metric, 'elapsedPercent'));
        assert(!Object.hasOwn(metric, 'weekdayElapsedPercent'));
        assert.equal(snapshot.footer, 'Update time unavailable');
        assert.equal(state.timers.size, 1, 'invalid presentation time keeps cadence');
    }
});

test('elapsed window percentage clamps safely and stays monotonic', () => {
    const fiveHours = 18_000_000;
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, 0), 0);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, 9_000_000), 50);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, fiveHours), 100);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, fiveHours + 1), 100);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours * 2, 0), 0);

    const week = 604_800_000;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const fractional = elapsedWindowPercent(week, week, threeDays);
    assert(Math.abs(fractional - 3 / 7 * 100) < Number.EPSILON * 100);
    const samples = [0, 1, threeDays, week - 1, week]
        .map(now => elapsedWindowPercent(week, week, now));
    assert(samples.every((value, index) => index === 0 ||
        value >= samples[index - 1]));
    assert(samples.every(value => Number.isFinite(value) &&
        value >= 0 && value <= 100));

    const maximum = Number.MAX_SAFE_INTEGER;
    assert.equal(elapsedWindowPercent(maximum, maximum, 0), 0);
    const middle = elapsedWindowPercent(maximum, maximum,
        Math.floor(maximum / 2));
    assert(Number.isFinite(middle) && middle > 49 && middle < 51);
    assert.equal(elapsedWindowPercent(maximum, maximum, maximum), 100);

    for (const [durationMs, resetAtMs, nowMs] of [
        [undefined, 1, 1], [null, 1, 1], [0, 1, 1], [-1, 1, 1],
        [1.5, 1, 1], [Number.MAX_SAFE_INTEGER + 1, 1, 1],
        [1, -1, 1], [1, 1.5, 1], [1, Infinity, 1],
        [1, 1, -1], [1, 1, NaN], [1, 1, Number.MAX_SAFE_INTEGER + 1],
    ]) {
        assert.throws(() => elapsedWindowPercent(durationMs, resetAtMs, nowMs));
    }
});
