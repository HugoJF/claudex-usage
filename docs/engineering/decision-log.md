# Decision Log

Append-only record of dated, non-obvious engineering decisions.

## 2026-07-16 — Share one token authority across Shell CSS and GJS

The primitive catalog packages `design/system/tokens.json` for runtime drawing and
geometry, and generates its Shell stylesheet from the same manifest. A pure
validation module is shared by the renderer, unit tests, and extension startup so a
missing or malformed role fails closed instead of silently falling back to a second
value source.

GNOME Shell CSS cannot provide the GJS drawing code with a portable shared custom-
property mechanism. Generation keeps the approved literals reviewable while the
gate prevents the template, output, and runtime values from diverging.

## 2026-07-17 — Start the production shell at a fixed five-minute cadence

`claudex-usage@hugo.local` is the SURF-002 production UUID. While any registered
provider is eligible, its surface refreshes immediately and then schedules one shared
cycle five minutes after the prior cycle completes. A fixed default keeps this shell
provider-neutral and avoids persistence until SURF-003 introduces the accepted
user-facing cadence choice.

## 2026-07-17 — Persist three panel limits and a bounded cadence choice

`org.gnome.shell.extensions.claudex-usage` stores only the Claude 5-hour, Claude
weekly, and Codex weekly panel-visibility booleans plus the refresh choice. The
accepted cadence set is five, ten, or fifteen minutes, defaulting to five. A change
replaces the pending shared timer from the selection time; it does not trigger an
extra provider refresh.

## 2026-07-17 — Freeze the Codex CLI auth and account-weekly usage boundary

Local evidence found the existing CLI credential at `tokens.access_token`. A live
authenticated request to the accepted internal `/backend-api/wham/usage` endpoint
returned HTTP 200 with the account `rate_limit.primary_window` lasting `604800`
seconds, an integer `used_percent` within 0–100, Unix-second `reset_at`, and no
secondary window. The response also carried a conflicting model-specific weekly
bucket under `additional_rate_limits`.

The adapter boundary therefore reads only the nested access token and only the two
account-level window slots. It accepts exactly one seven-day candidate, treats
`reset_at` as authoritative, rejects unsafe seconds-to-milliseconds conversion, and
fails closed on every ambiguity or malformed required value. Model limits, account
identity, plan, credits, promotions, allowance flags, limit-state flags, and
`reset_after_seconds` are deliberately discarded because the product exposes one
account-weekly Codex reading and makes no downstream decision from those fields.

`/backend-api/wham/usage` is undocumented and may change. The owner accepts that
compatibility risk as the sole internal Codex endpoint exception; exact-duration and
shape checks surface drift as unavailable rather than guessing. Credential expiry
remains a later authentication failure: the boundary neither decodes JWT claims nor
refreshes or initiates login.

## 2026-07-17 — Gate Codex usage on an exact local process

The production adapter treats an exact current-user `/proc/*/comm` value of `codex`
as eligibility and rescans every two seconds because `/proc` does not provide usable
create/delete monitor events. It does not read command lines or count processes.

Every eligible refresh rereads file-backed `auth.json`, then performs one cancellable
request with a 15-second session timeout, redirects disabled, and an exact HTTP 200
requirement. Auth and response streams have incremental 64 KiB and 256 KiB ceilings
and fatal UTF-8 decoding. Per-request identity prevents stale cleanup from touching a
new attempt; the surface also preserves a cleared lifecycle timestamp when a request
finishes after eligibility disappeared. Keyring-only credentials and relative
inherited `CODEX_HOME` values fail closed rather than adding another secret source.

## 2026-07-17 — Freeze the Claude OAuth credential and account short/weekly boundary

Local evidence found the existing Claude Code OAuth credential at
`claudeAiOauth.accessToken` in `~/.claude/.credentials.json` (honoring
`CLAUDE_CONFIG_DIR`), stored beside unrelated `mcpOAuth.*` tokens. A live authenticated
`GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer` and
`anthropic-beta: oauth-2025-04-20` returned HTTP 200 carrying `five_hour` and
`seven_day` objects, each with a float `utilization` (0–100) and an ISO-8601 `resets_at`.
The same response carried a conflicting model-scoped weekly limit
(`limits[].kind = weekly_scoped`, e.g. a Fable weekly cap at a different percentage),
dollar and `spend` fields, an `extra_usage` block, and null promotional buckets.

The adapter boundary therefore reads only the nested `claudeAiOauth.accessToken` and
only the `five_hour` and `seven_day` account windows, mapping them in order to one
`short` and one `weekly` reading. `resets_at` is treated as authoritative and parsed by
a strict, calendar-checked ISO-8601 grammar (accepting `Z` or a `±HH:MM` offset) reduced
to safe epoch milliseconds; ambiguity or any malformed required value fails closed, and
both windows must be valid or the whole result is unavailable. The model-scoped weekly,
`limits` array, dollar, `spend`, `extra_usage`, and promotional fields are deliberately
discarded because the product exposes one account short and one account weekly Claude
reading and makes no downstream decision from those fields.

`/api/oauth/usage` is undocumented and may change. The owner accepts that compatibility
risk as the sole Claude endpoint exception; strict grammar and range checks surface
drift as unavailable rather than guessing. Credential expiry remains a later
authentication failure surfaced as unavailable: the boundary neither decodes JWT claims
nor refreshes or initiates login. Presence detection — an exact current-user `claude`
process, mirroring Codex — is evidenced but deferred to CLAUDE-002 with the runtime.

## 2026-07-17 — Gate Claude usage on an exact local process

The production Claude adapter treats an exact current-user `/proc/*/comm` value of
`claude` as eligibility and rescans every two seconds because `/proc` provides no usable
create/delete monitor events. It does not read command lines or count processes, and the
`--chrome-native-host` helper is not matched because its `comm` is a version string.

Every eligible refresh rereads the file-backed `.credentials.json` under
`CLAUDE_CONFIG_DIR` (absolute, else `~/.claude`), then performs one cancellable request
with a 15-second timeout, redirects disabled, and an exact HTTP 200 requirement, sending
`Authorization: Bearer` and the `anthropic-beta: oauth-2025-04-20` header the endpoint
requires. Auth and response streams have incremental 64 KiB and 256 KiB ceilings and
fatal UTF-8 decoding. Per-request identity prevents stale cleanup from touching a new
attempt. A relative inherited `CLAUDE_CONFIG_DIR` fails closed rather than adding another
secret source. The Claude and Codex providers register through the same in-process slot
and share the surface's one refresh cycle; neither spawns a process.

## 2026-07-17 — Freeze the local usage-history sample store

Local usage history records a bounded per-provider-window ring of `{atMs, percent}`
samples rather than a full time series or a database. HIST-001 fixes the store shape and
math in a pure `history-store.js` boundary; HIST-002 adds the durable file that persists
its serialized form. A small append-capped store was chosen over SQLite (operationally
heavy for a Shell extension) and over GSettings (the wrong tool for time series): samples
are sparse — at most one per refresh, every 5–15 minutes — so a 30-day retention window
and a per-window cap keep the store tiny.

Samples are recorded only during the existing eligible refresh, so no timer or background
work is added and nothing is written while no provider is present. The shipped ranges are
the catalog's `1h`/`6h`/`1d`/`7d`/`30d`. Each range renders a fixed 30-point series built
by carrying the last observed percent forward across a shared grid; a window appears only
once it holds a sample at or before the range start, so early buckets are never
back-filled with an invented value. The store keeps only percent-and-timestamp samples —
never a credential, raw response, reset detail, or error — and is local-only: nothing it
records is transmitted or shared. Visible-gap rendering for unobserved spans would need a
charting-primitive change and stays out of scope; carry-forward is the accepted default.

## 2026-07-19 — Refresh every newly eligible provider through the shared cycle

Every initial or false-to-true provider eligibility transition requests current values
immediately. If the cadence timer is idle, the transition replaces it; if a cycle is
already in flight, any number of transitions coalesce into one follow-up after the
current completion is emitted. A full shared cycle is retained instead of introducing
per-provider polling, so providers keep one lifecycle and one freshness timestamp.

Provider registration is atomic across presentation reads, initial eligibility, and
subscription. Reentrant failure leaves no registered provider or scheduled work, and a
provider that becomes ineligible before its deferred call is never accessed. Opaque
generation identities guard late work without a numeric exhaustion boundary.

Back-to-back shared cycles can complete within the same clock millisecond while carrying
different values. The history runtime therefore stores the later successful batch at
the next safe millisecond only when the observed clock is equal; backward and invalid
clocks still fail closed. If an equal timestamp is already the maximum safe integer,
the colliding history batch is dropped while live presentation remains available.
