const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const HOUR_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const DAY_MS = HOURS_PER_DAY * HOUR_MS;

export const HISTORY_RANGES = Object.freeze([
    Object.freeze({index: 0, id: '1h', label: '1h', spanMs: HOUR_MS}),
    Object.freeze({index: 1, id: '6h', label: '6h', spanMs: 6 * HOUR_MS}),
    Object.freeze({index: 2, id: '1d', label: '1d', spanMs: DAY_MS}),
    Object.freeze({index: 3, id: '7d', label: '7d', spanMs: 7 * DAY_MS}),
    Object.freeze({index: 4, id: '30d', label: '30d', spanMs: 30 * DAY_MS}),
]);

export const DEFAULT_HISTORY_RANGE = HISTORY_RANGES[1];
