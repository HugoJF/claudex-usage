const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9_./-]*$/;
const DEFAULT_DATA_ROLES = Object.freeze([
    'dataClaudeShort',
    'dataClaudeWeekly',
    'dataCodexWeekly',
]);

function requireId(value, name) {
    if (typeof value !== 'string' || !SAFE_ID.test(value))
        throw new Error(`${name} must be a safe ID`);
    return value;
}

function requireText(value, name) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`${name} must be nonempty text`);
    return value;
}

function requireCallback(value, name) {
    if (typeof value !== 'function')
        throw new Error(`${name} must be a callback`);
    return value;
}

function requirePath(value, name) {
    if (typeof value !== 'string' || !SAFE_PATH.test(value))
        throw new Error(`${name} must be a safe package-relative path`);
    return value;
}

function frozen(value) {
    return Object.freeze(value);
}

function snapshotPresentation(provider, dataRoles) {
    if (!provider || typeof provider !== 'object')
        throw new Error('Provider must be an object');
    const id = requireId(provider.id, 'Provider ID');
    if (!Number.isInteger(provider.order) || provider.order < 0)
        throw new Error('Provider order must be a non-negative integer');
    const marks = provider.marks;
    if (!marks || typeof marks !== 'object')
        throw new Error('Provider marks are required');
    const windows = provider.windows;
    if (!Array.isArray(windows) || windows.length === 0)
        throw new Error('Provider windows must be nonempty');
    const ids = new Set();
    const windowSnapshots = windows.map(window => {
        if (!window || typeof window !== 'object')
            throw new Error('Provider window must be an object');
        const windowId = requireId(window.id, 'Provider window ID');
        if (ids.has(windowId))
            throw new Error('Provider window IDs must be unique');
        ids.add(windowId);
        if (!dataRoles.includes(window.dataRole))
            throw new Error('Provider window dataRole must be token-backed');
        return frozen({
            id: windowId,
            label: requireText(window.label, 'Provider window label'),
            dataRole: window.dataRole,
        });
    });
    return frozen({
        id,
        order: provider.order,
        label: requireText(provider.label, 'Provider label'),
        detail: requireText(provider.detail, 'Provider detail'),
        marks: frozen({
            darkPanel: requirePath(marks.darkPanel, 'Dark panel mark'),
            lightPanel: requirePath(marks.lightPanel, 'Light panel mark'),
            popup: requirePath(marks.popup, 'Popup mark'),
            accessibleName: requireText(marks.accessibleName, 'Provider mark accessible name'),
        }),
        windows: frozen(windowSnapshots),
    });
}

function validateResult(result, windows) {
    if (!result || typeof result !== 'object')
        return null;
    if (result.status === 'unavailable')
        return Object.keys(result).length === 1 ? frozen({status: 'unavailable'}) : null;
    if (result.status !== 'available' || !Array.isArray(result.readings))
        return null;
    if (result.readings.length !== windows.length)
        return null;
    const byId = new Map();
    for (const reading of result.readings) {
        if (!reading || typeof reading !== 'object' || typeof reading.id !== 'string' ||
            byId.has(reading.id) || !Number.isFinite(reading.percent) ||
            reading.percent < 0 || reading.percent > 100 ||
            !Number.isSafeInteger(reading.resetAtMs) || reading.resetAtMs < 0) {
            return null;
        }
        byId.set(reading.id, frozen({
            id: reading.id,
            percent: reading.percent,
            resetAtMs: reading.resetAtMs,
        }));
    }
    const readings = [];
    for (const window of windows) {
        const reading = byId.get(window.id);
        if (!reading)
            return null;
        readings.push(reading);
    }
    return frozen({status: 'available', readings: frozen(readings)});
}

function plural(value, unit) {
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function formatReset(resetAtMs, nowMs) {
    const minutes = Math.max(0, Math.ceil((resetAtMs - nowMs) / 60000));
    if (minutes === 0)
        return 'Resets now';
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const remainingMinutes = minutes % 60;
    const parts = [];
    if (days > 0)
        parts.push(plural(days, 'day'));
    if (hours > 0)
        parts.push(plural(hours, 'hr'));
    if (remainingMinutes > 0 && days === 0)
        parts.push(plural(remainingMinutes, 'min'));
    return `Resets in ${parts.join(', ')}`;
}

export function formatFreshness(completedAtMs, nowMs) {
    const minutes = Math.max(0, Math.floor((nowMs - completedAtMs) / 60000));
    return minutes === 0 ? 'Updated just now' : `Updated ${plural(minutes, 'min')} ago`;
}

export class SurfaceController {
    constructor({now = () => Date.now(), schedule, cancel, onChange = () => {},
        refreshIntervalMs = 5 * 60 * 1000, dataRoles = DEFAULT_DATA_ROLES} = {}) {
        this._now = requireCallback(now, 'Clock');
        this._schedule = requireCallback(schedule, 'Scheduler');
        this._cancel = requireCallback(cancel, 'Scheduler cancel');
        this._onChange = requireCallback(onChange, 'Change callback');
        if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0)
            throw new Error('Refresh interval must be a positive safe integer');
        this._refreshIntervalMs = refreshIntervalMs;
        this._dataRoles = [...dataRoles];
        this._providers = new Map();
        this._timer = null;
        this._refreshing = false;
        this._refreshRequested = false;
        this._disposed = false;
        this._lastCompletedAtMs = null;
    }

    registerProvider(provider) {
        if (this._disposed)
            throw new Error('Surface controller is disposed');
        const presentation = snapshotPresentation(provider, this._dataRoles);
        if (this._providers.has(presentation.id))
            throw new Error(`Provider ID is already registered: ${presentation.id}`);
        const isEligible = requireCallback(provider.isEligible, 'Provider isEligible');
        const subscribeEligibility = requireCallback(provider.subscribeEligibility,
            'Provider subscribeEligibility');
        const refresh = requireCallback(provider.refresh, 'Provider refresh');
        const initial = isEligible();
        if (typeof initial !== 'boolean')
            throw new Error('Provider isEligible must return a strict boolean');
        const state = {
            presentation,
            refresh,
            eligible: initial,
            result: null,
            generation: 0,
            unsubscribe: null,
            removed: false,
        };
        const receiveEligibility = eligible => {
            if (state.removed)
                return;
            if (typeof eligible !== 'boolean') {
                state.eligible = false;
                state.result = null;
                state.generation += 1;
            } else if (state.eligible !== eligible) {
                state.eligible = eligible;
                state.result = null;
                state.generation += 1;
                if (eligible && this._refreshing)
                    this._refreshRequested = true;
            } else {
                return;
            }
            this._changed();
            this._syncLifecycle();
        };
        const unsubscribe = subscribeEligibility(receiveEligibility);
        if (typeof unsubscribe !== 'function')
            throw new Error('Provider subscribeEligibility must return an unsubscribe callback');
        state.unsubscribe = unsubscribe;
        this._providers.set(presentation.id, state);
        if (state.eligible && this._refreshing)
            this._refreshRequested = true;
        this._changed();
        this._syncLifecycle();
        let unregistered = false;
        return () => {
            if (unregistered)
                return;
            unregistered = true;
            this._removeProvider(presentation.id, state);
        };
    }

    refresh() {
        if (this._disposed || !this._hasEligible())
            return;
        this._clearTimer();
        if (this._refreshing)
            return;
        this._startRefresh();
    }

    setRefreshIntervalMs(refreshIntervalMs) {
        if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0)
            throw new Error('Refresh interval must be a positive safe integer');
        if (this._refreshIntervalMs === refreshIntervalMs)
            return;
        this._refreshIntervalMs = refreshIntervalMs;
        if (this._disposed || !this._hasEligible() || this._refreshing)
            return;
        this._clearTimer();
        this._scheduleNext();
    }

    getSnapshot() {
        const now = this._now();
        const providers = this._orderedEligible().map(state => {
            const {presentation, result} = state;
            const metrics = result?.status === 'available'
                ? presentation.windows.map(window => {
                    const reading = result.readings.find(item => item.id === window.id);
                    return frozen({
                        id: `${presentation.id}--${window.id}`,
                        windowId: window.id,
                        label: window.label,
                        percent: reading.percent,
                        resetAtMs: reading.resetAtMs,
                        resetLabel: formatReset(reading.resetAtMs, now),
                        dataRole: window.dataRole,
                        accessibleName: `${presentation.label} ${window.label} at ${reading.percent} percent`,
                    });
                })
                : frozen([]);
            return frozen({
                ...presentation,
                availability: result?.status ?? 'pending',
                metrics: frozen(metrics),
            });
        });
        const anyAvailable = providers.some(provider => provider.availability === 'available');
        const hasResults = providers.some(provider => provider.availability !== 'pending');
        const footer = this._refreshing
            ? 'Refreshing…'
            : !hasResults
                ? 'Not checked yet'
                : anyAvailable
                    ? formatFreshness(this._lastCompletedAtMs, now)
                    : `Checked ${this._lastCompletedAtMs === null
                        ? 'just now' : formatFreshness(this._lastCompletedAtMs, now).replace(/^Updated /, '')}`;
        return frozen({
            providers: frozen(providers),
            refreshing: this._refreshing,
            footer,
            visible: providers.length > 0,
        });
    }

    dispose() {
        if (this._disposed)
            return;
        this._disposed = true;
        this._clearTimer();
        for (const [id, state] of [...this._providers])
            this._removeProvider(id, state, false);
        this._providers.clear();
        this._changed();
    }

    _removeProvider(id, state, notify = true) {
        if (state.removed)
            return;
        state.removed = true;
        state.generation += 1;
        this._providers.delete(id);
        state.unsubscribe?.();
        state.unsubscribe = null;
        if (notify)
            this._changed();
        this._syncLifecycle();
    }

    _orderedEligible() {
        return [...this._providers.values()]
            .filter(state => state.eligible && !state.removed)
            .sort((left, right) => left.presentation.order - right.presentation.order ||
                left.presentation.id.localeCompare(right.presentation.id));
    }

    _hasEligible() {
        return this._orderedEligible().length > 0;
    }

    _syncLifecycle() {
        if (this._disposed || !this._hasEligible()) {
            this._clearTimer();
            this._lastCompletedAtMs = null;
            return;
        }
        if (!this._refreshing && this._timer === null &&
            this._lastCompletedAtMs === null)
            this._startRefresh();
    }

    _startRefresh() {
        if (this._refreshing || this._disposed || !this._hasEligible())
            return;
        this._refreshing = true;
        this._changed();
        const attempts = this._orderedEligible().map(state => {
            const generation = state.generation;
            return Promise.resolve()
                .then(() => state.refresh())
                .then(result => ({state, generation,
                    result: validateResult(result, state.presentation.windows)}))
                .catch(() => ({state, generation, result: null}));
        });
        Promise.all(attempts).then(results => {
            if (this._disposed)
                return;
            for (const {state, generation, result} of results) {
                if (!state.removed && state.eligible && state.generation === generation)
                    state.result = result ?? frozen({status: 'unavailable'});
            }
            this._refreshing = false;
            this._lastCompletedAtMs = this._hasEligible() ? this._now() : null;
            this._changed();
            if (this._hasEligible() && this._refreshRequested) {
                this._refreshRequested = false;
                this._startRefresh();
            } else if (this._hasEligible()) {
                this._scheduleNext();
            }
        });
    }

    _scheduleNext() {
        this._clearTimer();
        this._timer = this._schedule(() => {
            this._timer = null;
            this.refresh();
        }, this._refreshIntervalMs);
    }

    _clearTimer() {
        if (this._timer === null)
            return;
        this._cancel(this._timer);
        this._timer = null;
    }

    _changed() {
        this._onChange(this.getSnapshot());
    }
}
