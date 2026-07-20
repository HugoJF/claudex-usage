# API Contracts

## Provider slot

The production extension accepts in-process GJS adapters through
`registerProvider(provider)`. Registration returns an idempotent unregister callback.
It snapshots presentation metadata and retains only the three lifecycle callbacks;
the installed package registers the built-in Codex and Claude providers through the
same slot.

| Field | Contract |
| --- | --- |
| `id`, `order` | Globally unique safe ID and non-negative integer. Providers sort by order, then ID. |
| `label`, `detail` | Required nonempty presentation text. |
| `marks` | Required package-relative `darkPanel`, `lightPanel`, and `popup` paths plus an accessible name. Absolute or traversal paths fail. |
| `windows` | Nonempty, uniquely identified usage windows in declared order. Each has label and a token-backed `dataRole`. |
| `isEligible()` | Returns a strict boolean. |
| `subscribeEligibility(callback)` | Observes strict boolean eligibility values and returns an unsubscribe callback. Invalid observations fail closed as ineligible. |
| `refresh()` | Asynchronously returns one availability result. |

`refresh()` returns either `{status: "unavailable"}` or `{status: "available",
readings}`. Available readings contain exactly one `{id, percent, resetAtMs}` for each
declared window: percentages are finite 0–100 and reset timestamps are non-negative
safe epoch milliseconds. Rejections, exceptions, malformed data, missing or extra
readings, and unavailable results carrying readings all become `unavailable` without
logging or retaining raw error details.

The surface owns atomic registration, eligibility visibility, one shared refresh
cycle, and teardown. Every initial or false-to-true eligibility transition requests
that shared cycle immediately: an idle cadence timer is replaced, while demand during
an in-flight cycle coalesces into one follow-up. Adapters own presence detection and
provider access. Provider payloads, credentials, and errors never cross this
presentation contract.

## Codex credential and usage boundary

`extension/codex-contract.js` is a synchronous, framework-free source boundary that
can be imported by Node tests and GJS. It exports:

| Export | Accepted input | Failure result |
| --- | --- | --- |
| `extractCodexAccessToken(authPayload)` | A parsed object whose `tokens.access_token` is a nonempty opaque string, optionally prefixed by case-insensitive `Bearer` and surrounding whitespace | `null` |
| `mapCodexUsage(payload)` | Exactly one valid seven-day account window in `rate_limit.primary_window` or `secondary_window` | Frozen `{status: "unavailable"}` |

Token extraction reads no top-level or alternate credential field. It removes at
most one bearer prefix and rejects embedded whitespace, non-string values, and
malformed containers. The caller owns auth-file access, the parsed payload, and the
returned ephemeral credential; this boundary never logs, persists, or retains them.

Usage mapping reads only the two account-level `rate_limit` window slots. Exactly one
must have numeric `limit_window_seconds` equal to `604800`, finite numeric
`used_percent` from 0 through 100, and non-negative integer Unix-second `reset_at`.
The seconds are multiplied by 1000 only when the epoch-millisecond result remains a
safe integer. `additional_rate_limits`, identity, plan, credit, promotion, allowance,
limit-state, and relative-reset fields cannot affect the result.

## Claude credential and usage boundary

`extension/claude-contract.js` is a synchronous, framework-free source boundary that
can be imported by Node tests and GJS. It exports:

| Export | Accepted input | Failure result |
| --- | --- | --- |
| `extractClaudeAccessToken(authPayload)` | A parsed object whose `claudeAiOauth.accessToken` is a nonempty opaque string, optionally prefixed by case-insensitive `Bearer` and surrounding whitespace | `null` |
| `mapClaudeUsage(payload)` | A `five_hour` and a `seven_day` account window, each a structurally valid `{utilization, resets_at}` record | Frozen `{status: "unavailable"}` |

Token extraction reads no top-level, `mcpOAuth`, or alternate credential field. It
removes at most one bearer prefix and rejects embedded whitespace, non-string values,
and malformed containers. The caller owns auth-file access, the parsed payload, and the
returned ephemeral credential; this boundary never logs, persists, or retains them.

Usage mapping reads only the `five_hour` and `seven_day` account windows and maps them,
in order, to one `short` and one `weekly` reading. Each window needs finite numeric
`utilization` from 0 through 100 and a strict ISO-8601 `resets_at` (calendar-checked,
with `Z` or a `±HH:MM` offset) reduced to non-negative safe epoch milliseconds; both
windows must be valid or the whole result is unavailable. The `limits` array, any
model-scoped window, dollar, spend, extra-usage, and promotional fields cannot affect
the result. An accepted payload becomes a deeply frozen provider-slot result with two
readings; every call creates new presentation objects and retains no source reference.

## Usage history store

`extension/history-store.js` is a synchronous, framework-free boundary that can be
imported by Node tests and GJS. It owns sample recording, range derivation, and durable
serialization; it performs no file, network, or clock access — the caller supplies every
timestamp. It exports:

| Export | Behavior | Failure result |
| --- | --- | --- |
| `recordSample(store, {providerId, windowId, percent, atMs})` | Appends one bounded per-window sample; drops samples older than `RETENTION_MS` and caps each window's ring | Returns the store unchanged (invalid or non-increasing sample) |
| `seriesForRange(store, rangeId, nowMs)` | Derives one `SERIES_POINTS`-length carry-forward series per window covered at the range start | Frozen `[]` (unknown range, invalid `nowMs`, no coverage) |
| `serializeStore(store)` / `deserializeStore(data)` | Convert to and from a versioned durable object | `deserializeStore` returns an empty store on any malformed or non-monotonic data |

Samples require a finite `percent` from 0 through 100 and a non-negative safe-integer
`atMs`; per window they stay strictly increasing in time. `seriesForRange` builds a
shared grid over `[nowMs - span, nowMs]` and, for each window holding a sample at or
before the grid start, carries the last observed percent forward to each point, so every
series is an equal-length array of valid percents; windows without start coverage are
omitted rather than interpolated backward. Every call returns deeply frozen values and
retains no source reference. No credential, response, or reset detail enters the store —
only `{providerId, windowId, percent, atMs}` samples.

An accepted payload becomes a deeply frozen provider-slot result with one `weekly`
reading. Every call creates new presentation objects and retains no source reference.
`extension/codex-runtime.js` is the first production consumer. It exports the provider
factory and runtime, detects an exact current-user `codex` process, reads file-backed
auth fresh per refresh, and performs the fixed usage request. Auth and response reads
are fatal-UTF-8 and incrementally bounded at 64 KiB and 256 KiB respectively. The
runtime follows `CODEX_HOME` only when absolute, allows no redirects, requires HTTP
200, owns cancellable request identity, and retains no token, raw body, or error.
