---
id: SPEC-USAGE-SURFACE
type: spec
status: done
owner: hugo
created: 2026-07-16
updated: 2026-07-21
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

Ship one production panel item and popup that present every eligible provider
through one provider contract.

## User Journeys

### J-002 — Glance at live usage (creates)

Intent: see current usage windows and reset times while an agent is in use.

Acceptance:

- **J-002.1** The panel item exists only while at least one registered provider
  reports eligible, composes provider marks with enabled percentages at native panel
  height, distinguishes Claude's 5-hour value with the existing muted foreground
  role, and shows newly eligible values without waiting for cadence.
- **J-002.2** Compact provider cards omit redundant provider detail; each visible
  window shows its percentage, zero-origin bar, reset time, and an optional neutral
  Time pace marker. Weekly markers follow the selected Every day or Weekdays
  schedule; shorter rolling windows always follow elapsed clock time.
- **J-002.3** A refresh icon beside settings requests fresh values and exposes its
  in-flight state. Freshness, reset copy, and Time pace advance while visible without
  a provider request.
- **J-002.4** An unavailable provider renders the unavailable treatment with no
  numeric or stale values; other providers stay live.
- **J-002.5** When no provider is eligible, the panel item is removed and no
  polling or timers remain.

### J-003 — Persist display preferences (creates)

Intent: control how usage is presented and how often values refresh.

Acceptance:

- **J-003.1** The gear action opens the settings view inside the same popover.
- **J-003.2** A visibility switch updates the panel immediately without closing
  the popup.
- **J-003.3** A persisted Used/Left choice updates every current and historical
  percentage immediately while retaining used percentages as canonical source data.
- **J-003.4** A global Time pace setting defaults on and removes or restores every
  marker immediately without a provider refresh.
- **J-003.5** A weekly-pace schedule defaults to Every day; choosing Weekdays updates
  weekly markers immediately by excluding local weekend hours between the provider
  window's start and reset, and leaves shorter rolling-window markers unchanged.
- **J-003.6** The refresh-cadence row presents a fixed enumerated choice set and
  applies the selection without restart.
- **J-003.7** Visibility, usage-display, Time pace, weekly-pace schedule, and cadence
  choices survive a GNOME Shell restart via the storage named in Architecture.

## Surface Map

- Absent panel — no eligible provider means no item or polling.
- Unified panel item — eligible providers' marks and enabled percentages, with the compact Claude 5-hour value visually muted.
- Usage popup cards — compact provider names, current windows, reset timing, and
  optional Time pace markers; chart composition remains owned by SPEC-LOCAL-HISTORY.
- Usage chrome — refresh with in-flight feedback beside settings and a status-only
  freshness footer.
- Current and historical percentages — selected Used or Left presentation without changing source data.
- Unavailable card state — dimmed textual notice, no values.
- Settings view — back action, three limit-visibility rows, refresh-cadence,
  usage-display, and weekly-pace choices, plus the global Time pace switch.

## Cross-Journey Acceptance

- Provider fixtures remain confined to the review harness.
- No credential or provider payload is persisted; results and history stay canonical used percentages.

## Design

Canonical reference: [Quiet Utility](../../../design/direction-lab/USAGE-REFINEMENT-EXPLORATION.md),
within [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).
The approved settings composition places the Weekly pace `ChoiceRow` directly beneath
the existing Time pace switch.

Primitives composed: `PopoverScaffold`, `PanelIndicator`, `ProviderGroup`,
`ProviderCard`, `UsageMetric`, `ProgressBar`, `IconButton`, `SettingsRow`,
`Switch`, `ChoiceRow`, and `FooterStatus`.

New primitive/variant budget: a compact history-range stepper, per-value panel tone, optional
provider detail, IconButton busy state, status-only footer, and an optional neutral
ProgressBar marker. Shared changes land only in their owning slices.

## Contracts

- API: [API contracts](../../engineering/api-contracts.md) — delta: add the
  fixed duration of each declared provider window for Time pace presentation.
- Data: [data model](../../engineering/data-model.md) — delta: persisted panel
  preferences add one global, default-on Time pace boolean and one default Every day
  weekly-pace schedule; no pace value is stored.
- Decisions: [decision log](../../engineering/decision-log.md) — cadence value set
  and default, production extension UUID; recorded at implementation.

## Architecture

- Neutral presentation sources under `extension/shared` serve the developer
  Direction Lab and production extension.
- Providers are in-process GJS adapter modules registered against the surface's
  provider-slot contract; the surface owns lifecycle and pull-based refresh.
- GSettings persists presentation and cadence preferences.
- One minute-aligned presentation timer exists only while the usage popup is open; it
  advances relative copy and Time pace in place without provider work or actor rebuilds.

## Preserve

- Preserve the [pitch](../pitch.md) lifecycle, credential, and fail-closed constraints.
- New primitives require design-system review; J-001 stays installable.

## Build Slices

- [x] `SURF-001` — extract shared token geometry, primitives, and stylesheet contract for the catalog and proof package.
- [x] `SURF-002` — ship the production shell, provider contract, glance states, J-002 test, and captures.
- [x] `SURF-003` — ship persisted visibility and cadence settings with J-003 proof.
- [x] `SURF-004` — make every new provider-eligibility transition show current values
  immediately through the shared refresh cycle, with atomic registration and ordered
  local-history completion evidence. Medium: one lifecycle/concurrency invariant, at
  most 15 edited files and 800 handwritten lines.
- [x] `SURF-005` — persist one global Used/Left presentation choice and apply it
  immediately to current values, progress geometry, accessibility, and local-history
  charting without rewriting provider or stored usage. Medium: one presentation
  invariant, at most 15 edited files and 700 handwritten lines.
- [x] `SURF-006` — move manual refresh beside settings, expose in-flight feedback,
  make the footer status-only, and advance freshness and reset copy through one
  visibility-bound presentation tick with no provider request. Medium: one temporal
  presentation invariant, at most 15 edited files and 700 handwritten lines.
- [x] `SURF-007` — remove redundant detail and mute compact Claude 5-hour values while preserving accessibility.
- [x] `SURF-008` — snapshot optional fixed provider-window duration, require it from
  built-ins, and derive bounded elapsed percentage. Medium: ≤12 files / 500 lines.
- [x] `SURF-009` — add default-on Time pace markers that follow Used/Left and the
  visible tick without changing usage. Medium: ≤15 files / 800 lines.
- [x] `SURF-010` — persist an Every day or Weekdays weekly-pace schedule and apply it
  immediately to weekly markers using the local calendar while shorter rolling
  windows retain elapsed-clock pace. Medium: one temporal presentation invariant,
  at most 15 edited files and 700 handwritten lines. Depends on `SURF-009`.

## Non-Scope

- History storage, recording, range behavior, and retention
  ([SPEC-LOCAL-HISTORY](2026-07-17-local-history.md)).
- Live provider adapters and real eligibility detection (SPEC-CLAUDE-ADAPTER,
  SPEC-CODEX-ADAPTER); the shell trusts the contract's eligibility signal.
- Publishing to extensions.gnome.org.
- Pace alerts, forecasts, budgets, or ahead/behind judgments.

## Open Questions
None.
