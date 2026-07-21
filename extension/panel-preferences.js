import {HISTORY_RANGES} from './shared/history-ranges.js';

export const PANEL_LIMITS = Object.freeze([
    Object.freeze({
        id: 'showClaudeShort',
        key: 'show-claude-short',
        dataRole: 'dataClaudeShort',
        title: 'Claude 5-hour',
        description: 'Show this limit in the top panel',
    }),
    Object.freeze({
        id: 'showClaudeWeekly',
        key: 'show-claude-weekly',
        dataRole: 'dataClaudeWeekly',
        title: 'Claude weekly',
        description: 'Show this limit in the top panel',
    }),
    Object.freeze({
        id: 'showCodexWeekly',
        key: 'show-codex-weekly',
        dataRole: 'dataCodexWeekly',
        title: 'Codex weekly',
        description: 'Show this limit in the top panel',
    }),
]);

export const REFRESH_INTERVALS = Object.freeze([
    Object.freeze({index: 0, nick: 'five-minutes', label: '5 min', ms: 5 * 60 * 1000}),
    Object.freeze({index: 1, nick: 'ten-minutes', label: '10 min', ms: 10 * 60 * 1000}),
    Object.freeze({index: 2, nick: 'fifteen-minutes', label: '15 min', ms: 15 * 60 * 1000}),
]);

export const REFRESH_INTERVAL_KEY = 'refresh-interval';
export const LOCAL_HISTORY_KEY = 'show-usage-history';
export const HISTORY_RANGE_KEY = 'history-range';
export const USAGE_DISPLAY_KEY = 'usage-display';
export const TIME_PACE_KEY = 'show-time-pace';
export const WEEKLY_PACE_KEY = 'weekly-pace';

const USAGE_DISPLAYS = Object.freeze([
    Object.freeze({index: 0, id: 'used', label: 'Used'}),
    Object.freeze({index: 1, id: 'left', label: 'Left'}),
]);

const WEEKLY_PACES = Object.freeze([
    Object.freeze({index: 0, id: 'every-day', label: 'Every day'}),
    Object.freeze({index: 1, id: 'weekdays', label: 'Weekdays'}),
]);

const LIMIT_BY_KEY = new Map(PANEL_LIMITS.map(limit => [limit.key, limit]));
const HISTORY_RANGE_BY_ID = new Map(HISTORY_RANGES.map(range => [range.id, range]));
const USAGE_DISPLAY_BY_ID = new Map(USAGE_DISPLAYS.map(display =>
    [display.id, display]));

function frozen(value) {
    return Object.freeze(value);
}

export function isPreferenceKey(key) {
    return LIMIT_BY_KEY.has(key) || key === REFRESH_INTERVAL_KEY ||
        key === LOCAL_HISTORY_KEY || key === HISTORY_RANGE_KEY ||
        key === USAGE_DISPLAY_KEY || key === TIME_PACE_KEY ||
        key === WEEKLY_PACE_KEY;
}

export function refreshInterval(index) {
    if (!Number.isInteger(index) || !REFRESH_INTERVALS[index])
        throw new Error('Refresh interval enum must be a known integer');
    return REFRESH_INTERVALS[index];
}

export function nextRefreshInterval(index) {
    return REFRESH_INTERVALS[(refreshInterval(index).index + 1) % REFRESH_INTERVALS.length];
}

export function historyRange(index) {
    if (!Number.isInteger(index) || !HISTORY_RANGES[index])
        throw new Error('History range enum must be a known integer');
    return HISTORY_RANGES[index];
}

export function historyRangeIndex(id) {
    const range = HISTORY_RANGE_BY_ID.get(id);
    if (!range)
        throw new Error(`Unknown history range: ${id}`);
    return range.index;
}

export function usageDisplay(index) {
    if (!Number.isInteger(index) || !USAGE_DISPLAYS[index])
        throw new Error('Usage display enum must be a known integer');
    return USAGE_DISPLAYS[index];
}

export function nextUsageDisplay(index) {
    return USAGE_DISPLAYS[(usageDisplay(index).index + 1) % USAGE_DISPLAYS.length];
}

export function weeklyPace(index) {
    if (!Number.isInteger(index) || !WEEKLY_PACES[index]) {
        throw new Error('Weekly pace enum must be a known integer');
    }
    return WEEKLY_PACES[index];
}

export function nextWeeklyPace(index) {
    return WEEKLY_PACES[(weeklyPace(index).index + 1) % WEEKLY_PACES.length];
}

export function displayPercent(usedPercent, displayId) {
    if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100)
        throw new Error('Usage percentage must be finite from 0 to 100');
    if (!USAGE_DISPLAY_BY_ID.has(displayId))
        throw new Error(`Unknown usage display: ${displayId}`);
    const normalized = Object.is(usedPercent, -0) ? 0 : usedPercent;
    return displayId === 'left' ? 100 - normalized : normalized;
}

export function readPanelPreferences(settings) {
    if (!settings || typeof settings.get_boolean !== 'function' ||
        typeof settings.get_enum !== 'function')
        throw new Error('Panel preferences require GSettings accessors');
    const visibility = {};
    for (const limit of PANEL_LIMITS) {
        const value = settings.get_boolean(limit.key);
        if (typeof value !== 'boolean')
            throw new Error(`Panel preference ${limit.key} must be boolean`);
        visibility[limit.dataRole] = value;
    }
    const interval = refreshInterval(settings.get_enum(REFRESH_INTERVAL_KEY));
    const localHistory = settings.get_boolean(LOCAL_HISTORY_KEY);
    if (typeof localHistory !== 'boolean')
        throw new Error(`Panel preference ${LOCAL_HISTORY_KEY} must be boolean`);
    const timePace = settings.get_boolean(TIME_PACE_KEY);
    if (typeof timePace !== 'boolean')
        throw new Error(`Panel preference ${TIME_PACE_KEY} must be boolean`);
    return frozen({
        visibility: frozen(visibility),
        refreshInterval: interval,
        localHistory,
        historyRange: historyRange(settings.get_enum(HISTORY_RANGE_KEY)),
        usageDisplay: usageDisplay(settings.get_enum(USAGE_DISPLAY_KEY)),
        timePace,
        weeklyPace: weeklyPace(settings.get_enum(WEEKLY_PACE_KEY)),
    });
}
