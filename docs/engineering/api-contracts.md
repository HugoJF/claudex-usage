# API Contracts

## Provider slot

The production extension accepts in-process GJS adapters through
`registerProvider(provider)`. Registration returns an idempotent unregister callback.
It snapshots presentation metadata and retains only the three lifecycle callbacks;
the installed package registers no provider itself.

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

The surface owns registration, eligibility visibility, one shared refresh cycle, and
teardown. Adapters own presence detection and provider access. Provider payloads,
credentials, and errors never cross this presentation contract.
