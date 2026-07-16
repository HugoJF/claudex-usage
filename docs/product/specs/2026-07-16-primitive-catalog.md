---
id: SPEC-PRIMITIVE-CATALOG
type: spec
status: draft
owner: hugo
created: 2026-07-16
updated: 2026-07-16
source_docs:
  - docs/product/pitch.md
  - design/direction-lab/DIRECTION-BRIEF.md
parent_ids: [PITCH-CLAUDEX-USAGE]
child_docs: []
tags: [gnome, design-system, ui]
supersedes: []
---

# Spec: Primitive Catalog

## Goal

Provide an installable, static GNOME Shell catalog that makes the approved visual
system reusable and reviewable before live usage behavior is built.

## User Journeys

### J-001 — Review usage interface primitives (creates)

Intent: review the selected panel, popup, settings, and interaction states in their
real GNOME medium.

Acceptance:

- **J-001.1** A developer can package and install the catalog without provider access.
- **J-001.2** The panel shows provider SVGs and enabled percentages within the native
  top-bar height.
- **J-001.3** The usage popup presents provider-grouped zero-origin bars, reset times,
  the full-width merged chart, Y-axis labels, range controls, and full legend names.
- **J-001.4** The settings popup presents independent visibility controls for all three
  limits and updates the static panel state in place.
- **J-001.5** The review harness captures the required theme, scaling, focus, hover,
  range, and switch states without changing catalog geometry.

## Surface Map

- Minimized panel — Claude and Codex SVG groups followed by their enabled percentages.
- Usage popup — header, provider cards, three usage metrics, merged chart, legend,
  range selector, freshness status, and refresh action.
- Settings popup — back action, panel-visibility rows, provider-presence row, refresh
  choice, and local-history row.
- Capture output — deterministic visual evidence for the catalog state matrix.

## Cross-Journey Acceptance

- Target GNOME Shell 50.1 on Wayland using GJS and Shell Toolkit actors.
- Render only static catalog data; perform no provider, authentication, network,
  polling, browser, or persistence operations.
- Load provider marks from the vendored attributed SVGs without visual modification.
- Preserve keyboard focus, accessible action names, Shell popup dismissal, and panel
  sizing across the catalog.

## Design

Canonical reference: [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).

Primitives composed: `PopoverScaffold`, `PanelIndicator`, `ProviderGroup`,
`ProviderCard`, `UsageMetric`, `ProgressBar`, `HistoryChart`, `Legend`,
`RangeSelector`, `IconButton`, `SettingsRow`, `Switch`, `ChoiceRow`, and
`FooterStatus`.

New primitives introduced: the inventory above is the initial primitive budget. Any
additional primitive requires a reviewed change to the design system and this Spec.

## Contracts

- Design: [design system](../../engineering/design-system.md#authority) — delta:
  implement the initial inventory against the token manifest.
- Architecture: [architecture](../../engineering/architecture.md) — delta: expose the
  catalog only as a developer-installed Shell extension.
- API: [API contracts](../../engineering/api-contracts.md) — delta: none.
- Data: [data model](../../engineering/data-model.md) — delta: none; static state is
  process-local and disposable.

## Preserve

- Direction D remains the only canonical variant.
- Progress bars begin at zero; chart series are continuous and have labeled Y values.
- Claude 5-hour uses a 1 px line; both weekly series use 2.5 px lines.
- Provider data colors remain reserved from controls, focus, and decorative accents.
- The design catalog cannot start, authenticate, or keep either provider running.

## Build Slices

- [ ] `UI-001` — token-backed GJS primitives and the selected static catalog, covered
  by the J-001 journey test.
- [ ] `UI-002` — developer packaging plus deterministic screenshot evidence for the
  required theme, scaling, and interaction-state matrix.

## Non-Scope

- Live Claude or Codex values, reset synchronization, and unavailable-state behavior.
- Settings or history persistence.
- Provider lifecycle detection and opportunistic visibility.
- Alerts, notifications, telemetry, or threshold behavior.
- Shipping A, B, or C as selectable product themes.

## Open Questions

None.
