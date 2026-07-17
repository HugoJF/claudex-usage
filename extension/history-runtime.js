import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    deserializeStore,
    emptyStore,
    hasSamples,
    recordSample,
    seriesForRange,
    serializeStore,
} from './history-store.js';

const OPTION_KEYS = new Set(['dir', 'now']);
const FILE_NAME = 'history.json';

function decode(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}

function requireRecord(value) {
    if (value === undefined)
        return {};
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('History runtime options must be an object');
    if (Object.keys(value).some(key => !OPTION_KEYS.has(key)))
        throw new Error('Unknown History runtime option');
    return value;
}

export class HistoryRuntime {
    constructor(options) {
        options = requireRecord(options);
        const inheritedDir = GLib.getenv('CLAUDEX_HISTORY_DIR');
        if (options.dir !== undefined) {
            if (typeof options.dir !== 'string' || !GLib.path_is_absolute(options.dir))
                throw new Error('History runtime dir must be an absolute path');
            this._dir = options.dir;
        } else if (inheritedDir !== null && GLib.path_is_absolute(inheritedDir)) {
            this._dir = inheritedDir;
        } else {
            this._dir = GLib.build_filenamev([GLib.get_user_data_dir(), 'claudex-usage']);
        }
        if (options.now !== undefined && typeof options.now !== 'function')
            throw new Error('History runtime now must be a function');
        this._now = options.now ?? (() => Date.now());
        this._path = GLib.build_filenamev([this._dir, FILE_NAME]);
        this._store = this._load();
    }

    record(samples) {
        if (!Array.isArray(samples) || samples.length === 0)
            return;
        const atMs = this._now();
        let changed = false;
        for (const sample of samples) {
            if (!sample || typeof sample !== 'object')
                continue;
            const next = recordSample(this._store, {
                providerId: sample.providerId,
                windowId: sample.windowId,
                percent: sample.percent,
                atMs,
            });
            if (next !== this._store) {
                this._store = next;
                changed = true;
            }
        }
        if (changed)
            this._persist();
    }

    series(rangeId) {
        return seriesForRange(this._store, rangeId, this._now());
    }

    hasSamples() {
        return hasSamples(this._store);
    }

    _load() {
        try {
            const [loaded, bytes] = Gio.File.new_for_path(this._path)
                .load_contents(null);
            if (!loaded)
                return emptyStore();
            return deserializeStore(JSON.parse(decode(bytes)));
        } catch {
            return emptyStore();
        }
    }

    _persist() {
        try {
            GLib.mkdir_with_parents(this._dir, 0o700);
            GLib.file_set_contents(this._path,
                JSON.stringify(serializeStore(this._store)));
        } catch {}
    }
}
