---
id: BRIEF-LOCAL-HISTORY
type: product-brief
status: delivered
owner: hugo
created: 2026-07-17
updated: 2026-07-19
source_docs:
  - docs/product/pitch.md
  - docs/product/feature-horizon.md
parent_ids: [PITCH-CLAUDEX-USAGE]
child_docs:
  - docs/product/specs/2026-07-17-local-history.md
tags: [gnome, usage, history]
supersedes: []
---

# Product Brief: Local Usage History

## Problem

The surface now shows live Claude and Codex usage, but only the current instant. A
user cannot see whether a limit is climbing fast or already easing, so the moment a
window resets the prior trajectory is lost. The approved design already includes a
merged usage chart, but it ships nowhere because the product persists no samples.

## Target User

The pitch's single Linux desktop user, wanting a quick read on how usage is trending
during and across real Claude Code and Codex sessions.

## Core Promise

While using an agent, the popup shows each eligible provider's recent usage trajectory
over a selectable range, drawn only from samples this machine recorded locally — never
from anything transmitted or shared.

## Differentiators

Product-level differentiators live in the [pitch](../pitch.md). Specific to this
capability:

- The trajectory is built from samples captured during the existing opportunistic
  refresh cycle, so it adds no background monitoring when no agent is present.
- History is local-only and durable across Shell restarts; nothing leaves the machine.
- It reuses the shipped `HistoryChart`, `CompactSelect`, and `Legend` primitives and
  the existing local-history and range preferences; live trajectory introduces no
  provider-specific visual language.

## Non-Goals

| Not this chapter | Why / where instead |
|---|---|
| Sending, syncing, or backing up history anywhere off the machine | The pitch forbids sharing usage history with another service; this chapter is local-only. |
| Threshold notifications or any alerting on the trend | Parked separately on the [feature horizon](../feature-horizon.md) until live values are trusted. |
| Backfilling history from provider APIs or logs | Only samples this product observed during real sessions are recorded; no retroactive fetch. |
| A new chart, axis, or range primitive | The catalog primitives are fixed; any new primitive is a reviewed design-system change. |
| Providers beyond Claude Code and Codex | The contract serves these two; generalization waits for a real third provider. |

## Success Metrics

- During real sessions, the popup chart shows each eligible provider's recent
  trajectory over the selected range, matching the samples actually recorded.
- No sample is recorded and no work runs while no provider is eligible; history grows
  only from the existing refresh cycle.
- History survives GNOME Shell restarts and is never transmitted, shared, or exposed
  outside the machine.
- Turning local history off stops recording and removes the chart without affecting
  the current-value panel and cards.

## Constraints

- Local-only and durable; the pitch's privacy and no-telemetry constraints bind.
- No new background obligation: sampling piggybacks on the opportunistic refresh, so
  nothing polls when no agent is present.
- The popup composes only primitives within the SPEC-PRIMITIVE-CATALOG budget.
- The durable sample-store mechanism, sample cadence, retention window, and shipped
  range set are spec and decision-log territory.
- The catalog already exposes local-history and range controls; production wiring must
  honor those persisted choices.

## Feature Bundles

| Bundle | Ships (intent) | Likely Spec |
|---|---|---|
| Sample store | Durable local recording of per-provider usage samples captured during the existing refresh cycle, with a retention window and range windows | SPEC-LOCAL-HISTORY |
| Popup chart | Merged multi-provider trajectory, compact range select, and legend wired into the production popup behind the local-history setting | SPEC-LOCAL-HISTORY |

## Red-Team

| Challenge | Resolution (resolved / deferred) |
|---|---|
| History needs samples over time, but the pitch forbids a background monitoring obligation | Resolved — samples are recorded only during the existing eligible refresh; no open agent means no polling and no new samples, so history is what was seen while in use, not continuous surveillance. |
| The product persists nothing durable except panel preferences | Resolved — the shipped bounded JSON sample store records only local percentage-and-time samples during the existing eligible refresh. |
| A chart could imply usage data ships somewhere | Resolved — local-only; the pitch's no-sharing constraint binds and nothing leaves the machine. |
| Sparse, irregular samples could render a misleading continuous line | Resolved — fixed 30-point ranges carry the last observed value forward and omit a window until it has coverage at the range start. |
| Range set and retention are unspecified | Resolved — `1h`/`6h`/`1d`/`7d`/`30d` ship against a bounded 30-day store. |

## Decision

Promoted from the feature horizon by the owner on 2026-07-17; the local-only,
no-new-polling capability shipped on 2026-07-19 with a bounded durable store, merged
trajectory, persisted compact range select, and off switch.

## Next Step

Observe the local trajectory during normal use and keep any future sync, alerting, or
provider expansion behind a separately promoted brief.
