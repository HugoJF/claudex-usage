---
id: BRIEF-LIVE-USAGE
type: product-brief
status: delivered
owner: hugo
created: 2026-07-16
updated: 2026-07-21
source_docs:
  - docs/product/pitch.md
  - docs/product/feature-horizon.md
parent_ids: [PITCH-CLAUDEX-USAGE]
child_docs:
  - docs/product/specs/2026-07-16-usage-surface.md
  - docs/product/specs/2026-07-17-codex-adapter.md
  - docs/product/specs/2026-07-17-claude-adapter.md
tags: [gnome, claude, codex, usage]
supersedes: []
---

# Product Brief: Live Usage

## Problem

The production surface now shows Codex's current account-weekly limit. Claude Code
still lacks an adapter, so the full two-provider promise in the [pitch](../pitch.md)
remains incomplete.

## Target User

The pitch's single Linux desktop user, during real Claude Code and Codex sessions.

## Core Promise

A production GNOME extension shows live usage windows and reset times through one
unified panel item that exists only while an eligible provider is present.

## Differentiators

Product-level differentiators live in the [pitch](../pitch.md). Specific to this
capability:

- One panel item composes all currently eligible providers and is absent when none
  are.
- Adapters feed the surface through one narrow provider contract, so adding a
  provider never reshapes the surface.
- The surface stays within Direction D; refinements enter only as explicit,
  token-backed primitive variants reviewed in the developer Direction Lab.

## Non-Goals

| Not this chapter | Why / where instead |
|---|---|
| Usage-history chart and its range selector | Local usage history is parked on the [feature horizon](../feature-horizon.md); the chart returns only if that idea is promoted. |
| Persisting any usage values | Same parked decision; this chapter renders current values only. |
| Threshold notifications | Parked on the feature horizon until live values are trustworthy. |
| Publishing to extensions.gnome.org | Distribution is a separate release decision after the chapter ships. |
| Providers beyond Claude Code and Codex | The contract serves these two; generalization waits for a real third provider. |

## Success Metrics

- During a real Claude Code session, panel values match the provider's own status
  view and reset times are correct.
- The Codex indicator appears only while a local Codex session is present, reads the
  existing CLI credential, and spawns no Codex process at any point.
- Closing the last eligible agent removes the panel item and stops all polling.
- A provider outage or expired session presents the unavailable state; no stale
  value is ever displayed.

## Constraints

- Single unified panel item, hidden when no provider is eligible; resolves the
  pitch's indicator open question.
- The surface composes only primitives within the SPEC-PRIMITIVE-CATALOG budget;
  any new primitive is a reviewed design-system change.
- Credential handling, lifecycle, and fail-closed rules are canonical in the
  pitch and bind every bundle.
- Panel-visibility settings persist across sessions; the storage mechanism is
  spec and decision-log territory.
- Time pace is an optional visual comparison between utilization and the elapsed
  portion of a provider window. It is not a quota target, forecast, or alert.
- Weekly Time pace can follow every day or local weekdays so a user's chosen working
  schedule, rather than weekends, determines the comparison; shorter rolling windows
  always follow elapsed clock time.

## Feature Bundles

| Bundle | Ships (intent) | Likely Spec |
|---|---|---|
| Surface shell | Production extension: unified panel item and popup composing the approved primitives (chart deferred), provider-slot contract, unavailable states, persisted visibility settings, stub provider for isolated review | SPEC-USAGE-SURFACE |
| Claude adapter | Claude Code presence detection plus the existing OAuth credential and usage endpoint feeding live windows | SPEC-CLAUDE-ADAPTER |
| Codex adapter | Read live windows through the existing Codex CLI credential while a local Codex session is present | SPEC-CODEX-ADAPTER |

## Red-Team

| Challenge | Resolution (resolved / deferred) |
|---|---|
| A surface-only brief would restate its single spec | Resolved — the chapter covers the surface and both adapters; the two horizon ideas merge here. |
| Unified item vs per-provider items (pitch open question) | Resolved — single unified item; owner decision 2026-07-16, recorded in Constraints. |
| Approved popup design renders a history chart while local history is parked | Resolved — chart deferred from this chapter; the parked horizon decision stays untouched. |
| The surface shell alone shows a user nothing | Resolved — the Codex adapter now supplies the first live provider value. |
| Concrete app IDs, window classes, and process-vs-window detection are unknown | Resolved — both providers gate on an exact current-user process (`codex`, `claude`); CLAUDE-001 freezes the Claude credential and response boundary before integration. |
| The working Codex usage endpoint is internal and may change | Resolved — accepted as the bundle's sole internal-endpoint exception; CODEX-001 freezes a fail-closed fixture contract before CODEX-002 integrates it. |
| Refresh cadence balancing usefulness and provider load | Resolved — a user-facing cadence choice ships in the surface settings (owner decision 2026-07-16); the value set and default stay decision-log territory. |
| Five inline history ranges compete with the popup header and new actions | Resolved — retain inline access through a compact previous/value/next stepper; selection still performs no provider request. |
| A pace guide could imply a provider-prescribed or optimal usage target | Resolved — name it Time pace, derive it only from elapsed window time, make it globally disableable, and show no ahead/behind judgment. |
| Relative freshness, reset copy, and a moving time marker could add provider work | Resolved — one presentation-only minute tick updates visible copy and geometry without starting a provider refresh. |
| Refresh feedback could require a second completion-state timer | Resolved — show a busy refresh icon only for the controller's existing in-flight state; the footer timestamp is completion feedback. |
| Muting the compact 5-hour value could make color the only identifier | Resolved — keep stable provider/window order and explicit window names in accessibility while using the existing muted foreground role visually. |

## Decision

Accepted by the owner. The unified indicator model and provider boundaries remain
fixed; variant A — Quiet Utility is the confirmed canonical composition for the
compact-control, time-pace, and feedback refinements as of 2026-07-19.

## Next Step

Delivered: the production surface and both provider adapters
([SPEC-USAGE-SURFACE](../specs/2026-07-16-usage-surface.md),
[SPEC-CODEX-ADAPTER](../specs/2026-07-17-codex-adapter.md),
[SPEC-CLAUDE-ADAPTER](../specs/2026-07-17-claude-adapter.md)) ship the unified panel item
with live Codex weekly and Claude 5-hour and weekly usage. The reopened surface work
refines glanceability and time feedback without changing the adapter boundary.
