# Data Model

The catalog retains only process-local presentation state. The production shell
persists nine preferences in its GSettings schema: three boolean visibility choices,
one refresh-cadence enum, a global `usage-display` enum defaulting to `used`, a global
`show-time-pace` boolean defaulting to true, a global `weekly-pace` enum defaulting to
`every-day`, the local-history boolean, and the history-range enum. Raw responses,
credentials, errors, pace values, and popup view state are never persisted.

Local usage history adds one durable, local-only store, defined by the
`extension/history-store.js` boundary and written during the existing refresh cycle. It
retains bounded per-provider-window `{atMs, percent}` samples within a 30-day retention
window; older samples and any beyond the per-window cap are dropped. A durable JSON file
under the user data directory persists the serialized store, and a `show-usage-history`
boolean and a `history-range` enum join the GSettings schema. The store holds only
percent-and-timestamp samples — never a credential, raw response, reset detail, or
error — and nothing it records leaves the machine. Two successful refreshes observed at
the same safe clock millisecond are stored one millisecond apart to retain event order;
backward, invalid, or exhausted timestamps remain fail-closed.

Provider results and stored samples always remain percentages used. Selecting Left
computes `100 - used` only for disposable presentation models. IEEE-754 subtraction can
collapse extreme subnormal values, and signed negative zero is normalized visually;
neither loss feeds back into the controller, provider, or durable store.

Provider window duration is immutable adapter metadata. The controller derives an
ephemeral bounded elapsed percentage from duration, reset time, and the current clock;
an exact seven-day window also carries a weekday-compressed percentage, or `null` when
its local calendar cannot be represented. The composer selects the configured weekly
basis, maps it through Used or Left, and consumes it only for the optional Time pace
marker and its accessibility text. Shorter rolling windows always use elapsed clock
time.
