import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {
    extractCodexAccessToken,
    mapCodexUsage,
} from './codex-contract.js';
Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish');
const ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage';
const OPTION_KEYS = new Set([
    'procRoot', 'codexHome', 'currentUser', 'endpoint',
    'presenceIntervalMs', 'authMaxBytes', 'responseMaxBytes',
    'schedule', 'cancel', 'session',
]);
const UNAVAILABLE = Object.freeze({status: 'unavailable'});
export function createCodexProvider(runtime) {
    for (const name of ['isPresent', 'subscribePresence', 'refreshUsage',
        'cancelRefresh']) {
        if (typeof runtime?.[name] !== 'function')
            throw new Error(`Codex runtime ${name} must be a function`);
    }
    return Object.freeze({
        id: 'codex', order: 1,
        label: 'Codex', detail: 'Weekly usage window',
        marks: Object.freeze({
            darkPanel: 'icons/codex.svg', popup: 'icons/codex.svg',
            lightPanel: 'icons/codex-light.svg',
            accessibleName: 'Codex mark',
        }),
        windows: Object.freeze([Object.freeze({
            id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly',
        })]),
        isEligible() {
            try { return runtime.isPresent() === true; } catch {
                return false;
            }
        },
        subscribeEligibility(callback) {
            try {
                const unsubscribe = runtime.subscribePresence(value => {
                    const eligible = value === true;
                    if (!eligible) runtime.cancelRefresh();
                    callback(eligible);
                });
                return () => {
                    runtime.cancelRefresh(); unsubscribe();
                };
            } catch {
                callback(false); return () => runtime.cancelRefresh();
            }
        },
        async refresh() {
            try { return await runtime.refreshUsage(); } catch {
                return UNAVAILABLE;
            }
        },
    });
}
function requireRecord(value) {
    if (value === undefined)
        return {};
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Codex runtime options must be an object');
    if (Object.keys(value).some(key => !OPTION_KEYS.has(key)))
        throw new Error('Unknown Codex runtime option');
    return value;
}
function absolutePath(value, name) {
    if (typeof value !== 'string' || !GLib.path_is_absolute(value))
        throw new Error(`${name} must be an absolute path`);
    return value;
}
function nonempty(value, name) {
    if (typeof value !== 'string' || !value) throw new Error(`${name} must be nonempty text`);
    return value;
}
function positiveInteger(value, fallback, name) {
    const candidate = value ?? fallback;
    if (!Number.isSafeInteger(candidate) || candidate <= 0)
        throw new Error(`${name} must be a positive safe integer`);
    return candidate;
}
function absoluteHttpUri(value) {
    try {
        const uri = GLib.Uri.parse(value, GLib.UriFlags.NONE);
        if (!['http', 'https'].includes(uri.get_scheme()) || !uri.get_host())
            throw new Error();
        return value;
    } catch { throw new Error('Codex endpoint must be an absolute HTTP(S) URI'); }
}
function decode(bytes) {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
function close(stream) { try { stream?.close(null); } catch {} }
async function readBounded(stream, limit, cancellable) {
    const chunks = [];
    let total = 0;
    while (true) {
        const bytes = await stream.read_bytes_async(
            Math.min(8192, limit - total + 1),
            GLib.PRIORITY_DEFAULT, cancellable);
        const size = bytes.get_size();
        if (!size) break;
        total += size;
        if (total > limit) throw new Error('Input exceeds its byte limit');
        chunks.push(bytes.get_data());
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset); offset += chunk.length;
    }
    return joined;
}
class SoupTransport {
    constructor() { this._session = new Soup.Session({timeout: 15}); }
    async send(message, cancellable) {
        const stream = await this._session.send_async(
            message, GLib.PRIORITY_DEFAULT, cancellable);
        return {statusCode: message.status_code, stream};
    }
    abort() { this._session.abort(); }
}
export class CodexRuntime {
    constructor(options) {
        options = requireRecord(options);
        this._procRoot = absolutePath(options.procRoot ?? '/proc', 'procRoot');
        this._currentUser = nonempty(options.currentUser ?? GLib.get_user_name(),
            'currentUser');
        const inheritedHome = GLib.getenv('CODEX_HOME');
        if (options.codexHome !== undefined)
            this._codexHome = absolutePath(options.codexHome, 'codexHome');
        else if (inheritedHome === null)
            this._codexHome = GLib.build_filenamev([GLib.get_home_dir(), '.codex']);
        else
            this._codexHome = GLib.path_is_absolute(inheritedHome) ? inheritedHome : null;
        this._endpoint = absoluteHttpUri(options.endpoint ?? ENDPOINT);
        this._presenceIntervalMs = positiveInteger(
            options.presenceIntervalMs, 2000, 'presenceIntervalMs');
        this._authMaxBytes = positiveInteger(options.authMaxBytes, 65536, 'authMaxBytes');
        this._responseMaxBytes = positiveInteger(
            options.responseMaxBytes, 262144, 'responseMaxBytes');
        if ((options.schedule === undefined) !== (options.cancel === undefined) ||
            options.schedule !== undefined && (typeof options.schedule !== 'function' ||
            typeof options.cancel !== 'function'))
            throw new Error('schedule and cancel must be supplied together');
        this._schedule = options.schedule ?? ((callback, delay) =>
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                callback();
                return GLib.SOURCE_CONTINUE;
            }));
        this._cancel = options.cancel ?? (sourceId => GLib.Source.remove(sourceId));
        this._session = options.session ?? new SoupTransport();
        if (typeof this._session.send !== 'function' ||
            typeof this._session.abort !== 'function')
            throw new Error('session must expose send and abort functions');
        this._listener = null; this._presenceTimer = null;
        this._attempt = null; this._disposed = false;
        this._present = this._scanPresence();
    }
    isPresent() { return this._present; }
    subscribePresence(callback) {
        if (typeof callback !== 'function')
            throw new Error('Presence subscriber must be a function');
        if (this._listener)
            throw new Error('Codex runtime supports one presence subscriber');
        if (this._disposed)
            return () => {};
        this._listener = callback;
        this._pollPresence();
        this._presenceTimer = this._schedule(() => this._pollPresence(),
            this._presenceIntervalMs);
        let subscribed = true;
        return () => {
            if (!subscribed)
                return;
            subscribed = false;
            if (this._presenceTimer !== null)
                this._cancel(this._presenceTimer);
            this._presenceTimer = null; this._listener = null;
        };
    }
    async refreshUsage() {
        if (this._disposed || !this._present) return UNAVAILABLE;
        this.cancelRefresh();
        const attempt = {
            cancellable: new Gio.Cancellable(), message: null, stream: null,
        };
        this._attempt = attempt;
        try {
            const token = await this._readToken(attempt.cancellable);
            if (!token || this._attempt !== attempt)
                return UNAVAILABLE;
            const message = Soup.Message.new('GET', this._endpoint);
            if (!message)
                return UNAVAILABLE;
            attempt.message = message;
            message.set_flags(message.get_flags() | Soup.MessageFlags.NO_REDIRECT);
            message.request_headers.append('Authorization', `Bearer ${token}`);
            message.request_headers.append('Accept', 'application/json');
            const response = await this._session.send(message, attempt.cancellable);
            attempt.stream = response?.stream ?? null;
            if (this._attempt !== attempt || response?.statusCode !== 200 ||
                !attempt.stream)
                return UNAVAILABLE;
            const bytes = await readBounded(attempt.stream,
                this._responseMaxBytes, attempt.cancellable);
            return mapCodexUsage(JSON.parse(decode(bytes)));
        } catch {
            return UNAVAILABLE;
        } finally {
            attempt.message?.request_headers.remove('Authorization');
            close(attempt.stream);
            attempt.message = null; attempt.stream = null;
            if (this._attempt === attempt)
                this._attempt = null;
        }
    }
    cancelRefresh() {
        const attempt = this._attempt;
        this._attempt = null; attempt?.cancellable.cancel();
    }
    dispose() {
        if (this._disposed)
            return;
        this._disposed = true;
        if (this._presenceTimer !== null)
            this._cancel(this._presenceTimer);
        this._presenceTimer = null; this._listener = null;
        this.cancelRefresh();
        this._session.abort();
    }
    _pollPresence() {
        if (this._disposed) return;
        const present = this._scanPresence();
        if (present === this._present)
            return;
        this._present = present;
        if (!present) this.cancelRefresh();
        this._listener?.(present);
    }
    _scanPresence() {
        let enumerator = null;
        try {
            enumerator = Gio.File.new_for_path(this._procRoot).enumerate_children(
                'standard::name,owner::user', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                if (!/^[0-9]+$/.test(name) ||
                    info.get_attribute_string('owner::user') !== this._currentUser)
                    continue;
                const comm = Gio.File.new_for_path(GLib.build_filenamev(
                    [this._procRoot, name, 'comm']));
                try {
                    const [loaded, bytes] = comm.load_contents(null);
                    if (loaded && bytes.length <= 64 && decode(bytes).trim() === 'codex')
                        return true;
                } catch {}
            }
        } catch { return false; } finally {
            try { enumerator?.close(null); } catch {}
        }
        return false;
    }
    async _readToken(cancellable) {
        if (this._codexHome === null) return null;
        const file = Gio.File.new_for_path(GLib.build_filenamev(
            [this._codexHome, 'auth.json']));
        const info = file.query_info('standard::type',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, cancellable);
        if (info.get_file_type() !== Gio.FileType.REGULAR) return null;
        const stream = await file.read_async(GLib.PRIORITY_DEFAULT, cancellable);
        try {
            const bytes = await readBounded(stream, this._authMaxBytes, cancellable);
            return extractCodexAccessToken(JSON.parse(decode(bytes)));
        } finally {
            close(stream);
        }
    }
}
