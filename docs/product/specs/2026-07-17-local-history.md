---
id: SPEC-LOCAL-HISTORY
type: spec
status: done
owner: hugo
created: 2026-07-17
updated: 2026-07-21
source_docs:
  - docs/product/briefs/2026-07-17-local-history.md
  - docs/product/pitch.md
parent_ids: [BRIEF-LOCAL-HISTORY]
child_docs: []
tags: [gnome, history, chart]
supersedes: []
---

# Spec: Local Usage History

## Goal

Show each eligible provider's recent usage trajectory in the existing popup, drawn only
from usage samples this machine recorded locally during the opportunistic refresh, and
never transmitted or shared.

## User Journeys

### J-006 — See usage history (creates)

Intent: see how usage has been trending while working with an agent.

Acceptance:

- **J-006.1** While local history is enabled and a provider is eligible, each refresh
  records a durable local sample and the popup shows the merged trajectory for the
  selected range.
- **J-006.2** Stepping to a range with the inline previous/next controls re-renders the chart over the
  new window from recorded samples, without a network request or discarded history.
- **J-006.3** History and the selected range survive a GNOME Shell restart; no sample is
  recorded while no provider is eligible.
- **J-006.4** Turning local history off stops recording and removes the chart while the
  current-value panel and cards stay live; nothing recorded ever leaves the machine.

## Surface Map

- Usage popup chart — merged multi-provider trajectory, compact range stepper, and legend,
  drawn from recorded samples while local history is on.
- Settings — the local-history toggle and range choice persist across sessions.
- Absent-history state — with local history off or no samples yet, the popup shows
  current values with no chart.
- Uncovered range — a selected range with no coverage keeps the range stepper and shows
  an empty state instead of hiding, so the range is never a dead end.

## Cross-Journey Acceptance

- Samples are recorded only during the existing eligible refresh; no sampling or store
  write occurs while no provider is eligible.
- The store is local, bounded, and durable; no sample, timestamp, or series is
  transmitted, shared, or logged.
- The chart composes only existing catalog primitives; series keep the reserved provider
  colors and the zero-origin, continuous rendering.

## Design

Canonical reference: [Quiet Utility](../../../design/direction-lab/USAGE-REFINEMENT-EXPLORATION.md),
within [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).
The popup composes `HistoryChart` and `Legend` with an inline `< 6h >` range stepper.
Claude 5-hour keeps its 1 px line and both weekly series their 2.5 px lines. The
persisted range and chart geometry stay unchanged. Each arrow is a native focusable
button, wraps across the ordered range set, and preserves focus after selection.

## Contracts

- API: [Provider slot](../../engineering/api-contracts.md#provider-slot) — delta: none;
  history derives from the readings the surface already receives each refresh.
- Data: [Data model](../../engineering/data-model.md) — delta: a durable, bounded
  per-provider sample store plus a local-history boolean and a selected-range enum join
  the persisted preferences. Credentials, raw responses, errors, and reset detail beyond
  a recorded sample still never persist.
- Decisions: [Decision log](../../engineering/decision-log.md) — records the durable
  store mechanism, sample cadence, retention window, range set, and gap handling.

## Architecture

The surface's existing refresh cycle appends a bounded sample per eligible provider
window to a durable local store; the popup derives each range's series from the store and
composes the shipped chart. Recording piggybacks on refresh, so no new timer or
background work exists, and nothing is sampled or written while no provider is eligible.
The store is bounded by retention and is never transmitted. HIST-001 owns the record and
read boundary; the surface continues to own polling, rendering, and provider lifecycle.

## Preserve

- The pitch's opportunistic-visibility, privacy, and fail-closed constraints; no
  background monitoring when no agent is present.
- The surface's one shared refresh cycle and strict provider-slot validation.
- Zero-origin, continuous series and the reserved provider colors from the catalog.
- The installed extension stays free of telemetry and credential or response logging.

## Build Slices

- [x] `HIST-001` — a durable, bounded local sample store: define the record-and-read
  boundary fed by the refresh cycle, its retention and range windows, and gap handling;
  add deterministic tests and record the store-mechanism decision. Medium: one
  sample-to-series boundary invariant, at most 14 files and 750 handwritten lines.
- [x] `HIST-002` — wire the merged chart, range selector, legend, and the local-history
  and range settings into the production popup behind the store, and prove J-006 through
  the production surface. Medium: one recording-to-presentation invariant, at most 15
  files and 800 handwritten lines.
- [x] `HIST-003` — replace the five always-visible range buttons with one compact
  history-range control while preserving the range enum, empty-range escape, and
  no-request rerender behavior. Medium: one range-selection invariant, at most 12
  hand-edited files and 700 handwritten lines, plus generated styles, captures, and
  conformance metadata.
- [x] `HIST-004` — replace the range menu with an inline previous/value/next stepper,
  deleting all popup and overlay behavior while preserving ordered selection, focus,
  empty-range escape, and no-request behavior. Small: one range-control invariant, at
  most 8 hand-edited files and 400 handwritten lines, plus generated styles and capture
  evidence.

## Non-Scope

- Sending, syncing, or backing up history off the machine, or retroactive backfill from
  provider APIs or logs.
- Threshold notifications or any alerting on the trend.
- New chart or axis primitives, additional range choices, or provider generalization
  beyond Claude and Codex.

## Open Questions

None.
