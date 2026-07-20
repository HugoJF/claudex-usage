---
id: SPEC-USAGE-SURFACE
type: spec
status: done
owner: hugo
created: 2026-07-16
updated: 2026-07-19
source_docs:
  - docs/product/briefs/2026-07-16-live-usage.md
  - design/direction-lab/DIRECTION-BRIEF.md
parent_ids: [BRIEF-LIVE-USAGE]
child_docs: []
tags: [gnome, ui, surface]
supersedes: []
---

# Spec: Usage Surface

## Goal

Ship the production extension shell: a unified panel item and popup that present
whatever eligible providers supply through one provider contract, so live values
have a surface before any adapter exists.

## User Journeys

Neither journey extends J-001: that journey is the developer-facing catalog review
and stays untouched. These are the product's first user journeys, composing the
primitives J-001 validated.

### J-002 — Glance at live usage (creates)

Intent: see current usage windows and reset times while an agent is in use.

Acceptance:

- **J-002.1** The panel item exists only while at least one registered provider
  reports eligible, composes provider marks with enabled percentages at native panel
  height, and shows each newly eligible provider's current values without waiting for
  an existing refresh cadence.
- **J-002.2** The popup groups metrics by provider; each visible window shows its
  percentage, zero-origin bar, and reset time from provider-supplied data.
- **J-002.3** The refresh action requests fresh values and updates the freshness
  text in place.
- **J-002.4** An unavailable provider renders the unavailable treatment with no
  numeric or stale values; other providers stay live.
- **J-002.5** When no provider is eligible, the panel item is removed and no
  polling or timers remain.

### J-003 — Persist panel preferences (creates)

Intent: control which limits the panel shows and how often values refresh.

Acceptance:

- **J-003.1** The gear action opens the settings view inside the same popover.
- **J-003.2** A visibility switch updates the panel immediately without closing
  the popup.
- **J-003.3** The refresh-cadence row presents a fixed enumerated choice set and
  applies the selection without restart.
- **J-003.4** Visibility and cadence choices survive a GNOME Shell restart via the
  storage named in Architecture.

## Surface Map

- Absent panel — no eligible provider: no item, no polling.
- Unified panel item — eligible providers' marks and enabled percentages.
- Usage popup — provider cards, freshness footer with refresh action; no history
  chart.
- Unavailable card state — dimmed textual notice, no values.
- Settings view — back action, three limit-visibility rows, refresh-cadence
  choice row.

## Cross-Journey Acceptance

- The stub provider exists only in the review harness; the installed production
  package registers no provider until an adapter spec ships one.
- No credential, provider payload, or usage value is ever persisted.

## Design

Canonical reference: [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).
Deviations, both from [BRIEF-LIVE-USAGE](../briefs/2026-07-16-live-usage.md) scope
decisions: the history chart, legend, and range selector are omitted; the settings
view carries only the visibility rows and the refresh choice.

Primitives composed: `PopoverScaffold`, `PanelIndicator`, `ProviderGroup`,
`ProviderCard`, `UsageMetric`, `ProgressBar`, `IconButton`, `SettingsRow`,
`Switch`, `ChoiceRow`, and `FooterStatus`.

New primitives introduced: none. The unavailable state composes existing
primitives as a stamped direction-lab variant with capture evidence, added within
its build slice.

## Contracts

- API: [API contracts](../../engineering/api-contracts.md) — delta: add the
  provider-slot contract (identity, marks, eligibility signal, usage windows with
  reset times, availability state), authored with `SURF-002`.
- Data: [data model](../../engineering/data-model.md) — delta: persisted panel
  preferences (limit visibility, refresh cadence); nothing else durable.
- Decisions: [decision log](../../engineering/decision-log.md) — cadence value set
  and default, production extension UUID; recorded at implementation.

## Architecture

- Neutral token/geometry, primitive, and stylesheet sources live under
  `extension/shared`; the direction-lab catalog remains the unchanged developer
  review vehicle.
- `SURF-001` proves reuse with a generated temporary second-consumer GNOME package
  using the same shared JavaScript, tokens, and generated stylesheet.
- The persistent production extension source and its own UUID begin in `SURF-002`;
  the temporary proof is not the production shell.
- Providers are in-process GJS adapter modules registered against the surface's
  provider-slot contract; the surface owns lifecycle — registration,
  eligibility-driven visibility, and poll start/stop.
- The production schema persists panel preferences and the accepted cadence choice;
  refresh remains pull-based while at least one provider is eligible.

## Preserve

- Lifecycle, credential, and fail-closed constraints stay canonical in the
  [pitch](../pitch.md) and bind every surface state.
- The primitive inventory budget: composition only; any new primitive is a
  reviewed design-system change.
- The J-001 catalog remains installable and unchanged.

## Build Slices

- [x] `SURF-001` — shared-module extraction: pure token/geometry, data-driven
  primitives, and stylesheet contract reused by the catalog and a temporary
  second-consumer GNOME package; catalog behavior and J-001 remain unchanged.
- [x] `SURF-002` — production extension shell, provider contract with harness-only
  stubs, glance behavior including unavailable and absent states, J-002 journey test,
  and capture evidence.
- [x] `SURF-003` — settings view with persisted visibility and cadence, J-003
  journey test, capture evidence for the new production states.
- [x] `SURF-004` — make every new provider-eligibility transition show current values
  immediately through the shared refresh cycle, with atomic registration and ordered
  local-history completion evidence. Medium: one lifecycle/concurrency invariant, at
  most 15 edited files and 800 handwritten lines.

## Non-Scope

- History chart, legend, and range selector (brief non-goal).
- Local-history settings row (parked capability).
- Live provider adapters and real eligibility detection (SPEC-CLAUDE-ADAPTER,
  SPEC-CODEX-ADAPTER); the shell trusts the contract's eligibility signal.
- Publishing to extensions.gnome.org.

## Open Questions

None.
