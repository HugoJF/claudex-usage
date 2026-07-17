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
