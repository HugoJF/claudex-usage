import assert from 'node:assert/strict';
import test from 'node:test';

import {
    displayPercent,
    historyRange,
    historyRangeIndex,
    isPreferenceKey,
    nextRefreshInterval,
    nextUsageDisplay,
    PANEL_LIMITS,
    readPanelPreferences,
    REFRESH_INTERVALS,
    refreshInterval,
    TIME_PACE_KEY,
    usageDisplay,
    WEEKLY_PACE_KEY,
    weeklyPace,
    nextWeeklyPace,
} from '../../extension/panel-preferences.js';
import {DEFAULT_HISTORY_RANGE, HISTORY_RANGES} from '../../extension/shared/history-ranges.js';

function settings({booleans = {}, interval = 0, range = 0, display = 0,
    pace = 0} = {}) {
    return {
        get_boolean: key => Object.hasOwn(booleans, key) ? booleans[key] : true,
        get_enum: key => {
            if (key === 'history-range')
                return range;
            if (key === 'usage-display')
                return display;
            if (key === WEEKLY_PACE_KEY)
                return pace;
            assert.equal(key, 'refresh-interval');
            return interval;
        },
    };
}

test('panel preferences map each semantic role to its durable boolean', () => {
    const snapshot = readPanelPreferences(settings({booleans: {
        'show-claude-short': false,
        'show-claude-weekly': true,
        'show-codex-weekly': false,
    }, interval: 1}));
    assert.deepEqual(snapshot.visibility, {
        dataClaudeShort: false,
        dataClaudeWeekly: true,
        dataCodexWeekly: false,
    });
    assert.equal(snapshot.refreshInterval.label, '10 min');
    assert.equal(snapshot.refreshInterval.ms, 600000);
    assert.equal(snapshot.timePace, true);
    assert.deepEqual(snapshot.weeklyPace,
        {index: 0, id: 'every-day', label: 'Every day'});
    assert.deepEqual(snapshot.usageDisplay, {index: 0, id: 'used', label: 'Used'});
    assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.visibility));
    assert.deepEqual(PANEL_LIMITS.map(limit => limit.key), [
        'show-claude-short', 'show-claude-weekly', 'show-codex-weekly',
    ]);
});

test('history preferences expose the local-history flag and selected range', () => {
    const snapshot = readPanelPreferences(settings({
        booleans: {'show-usage-history': false}, range: 3,
    }));
    assert.equal(snapshot.localHistory, false);
    assert.equal(snapshot.historyRange, HISTORY_RANGES[3]);
    assert.equal(historyRange(1), DEFAULT_HISTORY_RANGE);
    assert.deepEqual(HISTORY_RANGES.map(range => [range.index, range.id, range.label,
        range.spanMs]), [
        [0, '1h', '1h', 3_600_000],
        [1, '6h', '6h', 21_600_000],
        [2, '1d', '1d', 86_400_000],
        [3, '7d', '7d', 604_800_000],
        [4, '30d', '30d', 2_592_000_000],
    ]);
    assert(Object.isFrozen(HISTORY_RANGES) && HISTORY_RANGES.every(Object.isFrozen));
    assert.equal(historyRange(0).id, '1h');
    assert.equal(historyRangeIndex('30d'), 4);
    assert.throws(() => historyRange(5));
    assert.throws(() => historyRangeIndex('2h'));
    assert(isPreferenceKey('show-usage-history') && isPreferenceKey('history-range'));
});

test('Time pace is a strict persisted boolean preference', () => {
    const disabled = readPanelPreferences(settings({
        booleans: {[TIME_PACE_KEY]: false},
    }));
    assert.equal(disabled.timePace, false);
    assert(isPreferenceKey(TIME_PACE_KEY));
    for (const value of ['true', 1, null, undefined]) {
        const booleans = {};
        Object.defineProperty(booleans, TIME_PACE_KEY, {
            value,
            enumerable: true,
        });
        assert.throws(() => readPanelPreferences(settings({booleans})));
    }
});

test('weekly pace is strict, frozen, cyclic, and included in preference reads', () => {
    const snapshot = readPanelPreferences(settings({pace: 1}));
    assert.deepEqual(snapshot.weeklyPace,
        {index: 1, id: 'weekdays', label: 'Weekdays'});
    assert(Object.isFrozen(snapshot.weeklyPace));
    assert.equal(weeklyPace(0).id, 'every-day');
    assert.equal(nextWeeklyPace(0).id, 'weekdays');
    assert.equal(nextWeeklyPace(1).id, 'every-day');
    assert(isPreferenceKey(WEEKLY_PACE_KEY));
    assert(!isPreferenceKey('weeklyPace'));
    for (const value of [-1, 2, 0.5, '0']) {
        assert.throws(() => weeklyPace(value));
    }
    assert.throws(() => readPanelPreferences(settings({pace: 2})));
});

test('usage display is strict, frozen, cyclic, and included in preference reads', () => {
    const snapshot = readPanelPreferences(settings({display: 1}));
    assert.deepEqual(snapshot.usageDisplay, {index: 1, id: 'left', label: 'Left'});
    assert(Object.isFrozen(snapshot.usageDisplay));
    assert.equal(usageDisplay(0).id, 'used');
    assert.equal(nextUsageDisplay(0).id, 'left');
    assert.equal(nextUsageDisplay(1).id, 'used');
    assert(isPreferenceKey('usage-display'));
    for (const value of [-1, 2, 0.5, '0'])
        assert.throws(() => usageDisplay(value));
    assert.throws(() => readPanelPreferences(settings({display: 2})));
});

test('display percentages preserve Used and complement Left within numeric limits', () => {
    for (const value of [0, 37.5, 100, Number.MIN_VALUE, Number.EPSILON])
        assert.equal(displayPercent(value, 'used'), value);
    assert.deepEqual([0, 37.5, 100].map(value => displayPercent(value, 'left')),
        [100, 62.5, 0]);
    assert.equal(displayPercent(Number.MIN_VALUE, 'left'), 100);
    assert.equal(displayPercent(Number.EPSILON, 'left'), 100);
    assert(!Object.is(displayPercent(-0, 'used'), -0));
    assert.equal(displayPercent(-0, 'left'), 100);
    for (const value of [0, 12.25, 37.5, 50, 87.75, 100]) {
        const displayed = displayPercent(value, 'left');
        assert(displayed >= 0 && displayed <= 100);
        assert.equal(displayPercent(displayed, 'left'), value);
    }
    for (const value of [-1, 101, NaN, Infinity, -Infinity])
        assert.throws(() => displayPercent(value, 'used'));
    for (const display of ['', 'remaining', null, 0])
        assert.throws(() => displayPercent(50, display));
});

test('refresh intervals cycle, reject unknown enums, and expose only known keys', () => {
    assert.deepEqual(REFRESH_INTERVALS.map(interval => interval.ms),
        [300000, 600000, 900000]);
    assert.equal(nextRefreshInterval(0).index, 1);
    assert.equal(nextRefreshInterval(1).index, 2);
    assert.equal(nextRefreshInterval(2).index, 0);
    assert.throws(() => refreshInterval(-1));
    assert.throws(() => refreshInterval(3));
    assert.throws(() => readPanelPreferences(settings({interval: 4})));
    assert(isPreferenceKey('show-claude-short'));
    assert(isPreferenceKey('refresh-interval'));
    assert(!isPreferenceKey('local-history'));
});
