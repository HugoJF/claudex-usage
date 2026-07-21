import {HISTORY_RANGES} from './shared/history-ranges.js';
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SERIES_POINTS = 30;
const MAX_SAMPLES = 5000;
const RANGE_BY_ID = new Map(HISTORY_RANGES.map(range => [range.id, range]));

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function frozenStore(windows) {
    return Object.freeze({windows: Object.freeze(windows)});
}

export function emptyStore() {
    return frozenStore({});
}

export function hasSamples(store) {
    for (const samples of Object.values(windowsOf(store))) {
        if (Array.isArray(samples) && samples.length > 0)
            return true;
    }
    return false;
}

function windowsOf(store) {
    return isRecord(store) && isRecord(store.windows) ? store.windows : {};
}

function isValidSample(sample) {
    return isRecord(sample) &&
        typeof sample.providerId === 'string' && sample.providerId.length > 0 &&
        typeof sample.windowId === 'string' && sample.windowId.length > 0 &&
        typeof sample.percent === 'number' && Number.isFinite(sample.percent) &&
        sample.percent >= 0 && sample.percent <= 100 &&
        Number.isSafeInteger(sample.atMs) && sample.atMs >= 0;
}

function splitKey(key) {
    const separator = key.indexOf(':');
    return [key.slice(0, separator), key.slice(separator + 1)];
}

export function recordSample(store, sample) {
    try {
        const windows = windowsOf(store);
        const unchanged = isRecord(store) && isRecord(store.windows)
            ? store : emptyStore();
        if (!isValidSample(sample)) {
            return unchanged;
        }
        const key = `${sample.providerId}:${sample.windowId}`;
        const existing = Array.isArray(windows[key]) ? windows[key] : [];
        const last = existing[existing.length - 1];
        if (last && sample.atMs <= last.atMs) {
            return unchanged;
        }
        let next = existing.concat(
            Object.freeze({atMs: sample.atMs, percent: sample.percent}));
        const cutoff = sample.atMs - RETENTION_MS;
        next = next.filter(point => point.atMs >= cutoff);
        if (next.length > MAX_SAMPLES) {
            next = next.slice(next.length - MAX_SAMPLES);
        }
        return frozenStore({...windows, [key]: Object.freeze(next)});
    } catch {
        return emptyStore();
    }
}

export function seriesForRange(store, rangeId, nowMs) {
    try {
        const range = RANGE_BY_ID.get(rangeId);
        if (!range || !Number.isSafeInteger(nowMs) || nowMs < 0) {
            return Object.freeze([]);
        }
        const start = nowMs - range.spanMs;
        const step = range.spanMs / (SERIES_POINTS - 1);
        const gridTimes = Array.from({length: SERIES_POINTS},
            (_unused, index) => start + Math.round(index * step));
        const series = [];
        for (const [key, samples] of Object.entries(windowsOf(store))) {
            if (!Array.isArray(samples) || samples.length === 0 ||
                samples[0].atMs > start) {
                continue;
            }
            const values = [];
            let index = 0;
            for (const time of gridTimes) {
                while (index + 1 < samples.length && samples[index + 1].atMs <= time) {
                    index++;
                }
                values.push(samples[index].percent);
            }
            const [providerId, windowId] = splitKey(key);
            series.push(Object.freeze({
                providerId, windowId, values: Object.freeze(values),
            }));
        }
        return Object.freeze(series);
    } catch {
        return Object.freeze([]);
    }
}

export function serializeStore(store) {
    const serialized = {};
    for (const [key, samples] of Object.entries(windowsOf(store))) {
        if (Array.isArray(samples) && samples.length > 0) {
            serialized[key] = samples.map(point => [point.atMs, point.percent]);
        }
    }
    return {version: 1, windows: serialized};
}

export function deserializeStore(data) {
    try {
        if (!isRecord(data) || data.version !== 1 || !isRecord(data.windows)) {
            return emptyStore();
        }
        const windows = {};
        for (const [key, rows] of Object.entries(data.windows)) {
            if (typeof key !== 'string' || !key.includes(':') || !Array.isArray(rows)) {
                continue;
            }
            const samples = [];
            let previousAtMs = -1;
            let valid = true;
            for (const row of rows) {
                if (!Array.isArray(row) || row.length !== 2) {
                    valid = false;
                    break;
                }
                const [atMs, percent] = row;
                if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs <= previousAtMs ||
                    typeof percent !== 'number' || !Number.isFinite(percent) ||
                    percent < 0 || percent > 100) {
                    valid = false;
                    break;
                }
                previousAtMs = atMs;
                samples.push(Object.freeze({atMs, percent}));
            }
            if (valid && samples.length > 0) {
                windows[key] = Object.freeze(samples);
            }
        }
        return frozenStore(windows);
    } catch {
        return emptyStore();
    }
}
