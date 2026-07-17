---
id: BRIEF-LIVE-USAGE
type: product-brief
status: active
owner: hugo
created: 2026-07-16
updated: 2026-07-16
source_docs:
  - docs/product/pitch.md
  - docs/product/feature-horizon.md
parent_ids: [PITCH-CLAUDEX-USAGE]
child_docs: []
tags: [gnome, claude, codex, usage]
supersedes: []
---

# Product Brief: Live Usage

## Problem

The approved visual system exists only as a static catalog with hardcoded values;
no desktop surface shows real Claude Code or Codex limits. The promise in the
[pitch](../pitch.md) stays untested until live values reach the panel.

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
- The surface reuses the shipped Direction D primitives unchanged; live behavior
  introduces no new visual language.

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
- The Codex indicator appears only when a managed app-server is already running,
  and the extension spawns no Codex process at any point.
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

## Feature Bundles

| Bundle | Ships (intent) | Likely Spec |
|---|---|---|
| Surface shell | Production extension: unified panel item and popup composing the approved primitives (chart deferred), provider-slot contract, unavailable states, persisted visibility settings, stub provider for isolated review | SPEC-USAGE-SURFACE |
| Claude adapter | Claude Code presence detection plus the existing OAuth credential and usage endpoint feeding live windows | SPEC-CLAUDE-ADAPTER |
| Codex adapter | Attach to an already-running managed app-server for live windows; show nothing otherwise | SPEC-CODEX-ADAPTER |

## Red-Team

| Challenge | Resolution (resolved / deferred) |
|---|---|
| A surface-only brief would restate its single spec | Resolved — the chapter covers the surface and both adapters; the two horizon ideas merge here. |
| Unified item vs per-provider items (pitch open question) | Resolved — single unified item; owner decision 2026-07-16, recorded in Constraints. |
| Approved popup design renders a history chart while local history is parked | Resolved — chart deferred from this chapter; the parked horizon decision stays untouched. |
| The surface shell alone shows a user nothing | Resolved — shell acceptance uses a stub provider in the isolated review harness; first user value lands with the Claude adapter. |
| Concrete app IDs, window classes, and process-vs-window detection are unknown | Deferred — open questions on the adapter specs. |
| Refresh cadence balancing usefulness and provider load | Deferred — tuning-level; decision log at implementation. |

## Decision

Accepted by the owner on 2026-07-16. Scope, indicator model, and chart deferral
were confirmed at the promotion gate.

## Next Step

Spec the Surface shell bundle first (Aura `spec`): both adapters depend on its
provider contract, and the stub provider makes it acceptable without credentials.
