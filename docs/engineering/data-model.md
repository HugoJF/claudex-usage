# Data Model

The catalog retains only process-local presentation state. The production shell
persists four panel preferences in its GSettings schema: three boolean visibility
choices and one refresh-cadence enum. Raw responses, credentials, errors, and popup
view state are never persisted.

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
