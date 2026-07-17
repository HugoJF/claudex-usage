---
id: SPEC-CODEX-ADAPTER
type: spec
status: done
owner: hugo
created: 2026-07-17
updated: 2026-07-17
source_docs:
  - docs/product/briefs/2026-07-16-live-usage.md
  - docs/product/pitch.md
parent_ids: [BRIEF-LIVE-USAGE]
child_docs: []
tags: [gnome, codex, adapter]
supersedes: []
---

# Spec: Codex Adapter

## Goal

Show trustworthy live Codex weekly usage in the existing GNOME Shell surface while
a local Codex session is present, using the existing CLI credential without starting,
authenticating, or otherwise changing Codex.

## User Journeys

### J-004 — See Codex usage (creates)

Intent: see the current Codex weekly limit while using Codex locally.

Acceptance:

- **J-004.1** A present local Codex session makes the provider eligible and adds its
  existing mark and weekly percentage to the unified panel.
- **J-004.2** The popup shows the provider's fresh weekly percentage and reset time
  through the existing usage-card treatment.
- **J-004.3** Closing the last local Codex session removes eligibility; the adapter
  never starts, authenticates, or keeps a Codex process alive.
- **J-004.4** An unsupported, malformed, or failed usage response becomes the
  existing unavailable state and immediately clears prior values.

## Surface Map

- Unified panel item — existing Codex mark and weekly metric while the adapter is
  eligible.
- Codex provider card — existing live metric or unavailable treatment.
- Absent Codex state — no Codex contribution when no local Codex session is present.

## Cross-Journey Acceptance

- The adapter persists no endpoint configuration, credential, raw response, usage
  value, or error detail.
- The internal Codex usage endpoint is the only accepted undocumented provider
  endpoint; schema drift fails closed.
- It makes no process-launch, login, browser, or dashboard-scraping attempt.

## Design

Canonical reference: [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).
The adapter composes the existing Codex provider mark, `ProviderCard`, `UsageMetric`,
`ProgressBar`, and unavailable treatment. New primitives: none.

## Contracts

- API: [Provider slot](../../engineering/api-contracts.md#provider-slot) and
  [Codex credential and usage boundary](../../engineering/api-contracts.md#codex-credential-and-usage-boundary)
  — delta: a Codex module maps the evidenced source contract into the existing
  provider object with one weekly window.
- Data: [Data model](../../engineering/data-model.md) — delta: no durable adapter
  data; transport results reduce to the presentation contract.
- Decisions: [Decision log](../../engineering/decision-log.md) — records the
  evidenced internal HTTP contract, payload mapping, and accepted compatibility
  risk.

## Architecture

The framework-free Codex contract establishes credential and response mapping without
filesystem or network access. CODEX-002 packages a Codex adapter module that registers
against the in-process provider slot, observes local Codex-session presence, reads the
existing CLI credential at refresh time, and requests the accepted internal usage
endpoint asynchronously. The adapter owns presence, credential access, and transport
handling; the surface continues to own polling, rendering, and provider lifecycle.
No process is spawned by either layer.

## Preserve

- The pitch's opportunistic-visibility, privacy, and fail-closed constraints.
- The surface's strict provider-slot validation and one shared refresh cycle.
- The installed extension remains free of test stubs, credentials, and provider
  payload logging.

## Build Slices

- [x] `CODEX-001` — evidence the existing CLI auth-file and accepted internal HTTP
  usage contract; add deterministic sanitized fixtures and record the fail-closed
  mapping decision. Medium: one credential-to-response boundary invariant, at most
  14 files and 750 handwritten lines.
- [x] `CODEX-002` — implement the provider module against the evidenced contract,
  package it, and prove J-004 through the production surface. Medium: one
  eligibility-to-presentation invariant, at most 15 files and 800 handwritten lines.

## Non-Scope

- Starting or authenticating Codex, browser/dashboard automation, or undocumented
  remote endpoint discovery beyond the accepted usage endpoint.
- Codex background-service or Remote Control integration.
- Claude Code integration, usage history, notifications, or new visual primitives.

## Open Questions

- None. The owner accepts the internal usage endpoint's compatibility risk; CODEX-001
  must define its fail-closed credential and response boundary before CODEX-002.
