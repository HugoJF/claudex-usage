---
id: SPEC-CLAUDE-ADAPTER
type: spec
status: draft
owner: hugo
created: 2026-07-17
updated: 2026-07-17
source_docs:
  - docs/product/briefs/2026-07-16-live-usage.md
  - docs/product/pitch.md
parent_ids: [BRIEF-LIVE-USAGE]
child_docs: []
tags: [gnome, claude, adapter]
supersedes: []
---

# Spec: Claude Adapter

## Goal

Show trustworthy live Claude Code usage in the existing GNOME Shell surface while a
local Claude Code session is present, using the existing Claude Code OAuth credential
without starting, authenticating, or otherwise changing Claude Code.

## User Journeys

### J-005 — See Claude usage (creates)

Intent: see the current Claude Code usage windows while using Claude Code locally.

Acceptance:

- **J-005.1** A present local Claude Code session makes the provider eligible and adds
  its existing mark plus its short and weekly percentages to the unified panel.
- **J-005.2** The popup shows the provider's fresh short and weekly percentages and
  reset times through the existing usage-card treatment.
- **J-005.3** Closing the last local Claude Code session removes eligibility; the
  adapter never starts, authenticates, or keeps a Claude Code process alive.
- **J-005.4** An unsupported, malformed, or failed usage response becomes the existing
  unavailable state and immediately clears prior values.

## Surface Map

- Unified panel item — existing Claude mark and enabled short and weekly metrics while
  the adapter is eligible.
- Claude provider card — existing live metrics or unavailable treatment.
- Absent Claude state — no Claude contribution when no local Claude Code session is
  present.

## Cross-Journey Acceptance

- The adapter persists no endpoint configuration, credential, raw response, usage
  value, or error detail.
- The Claude Code usage endpoint is the only accepted Claude provider endpoint; schema
  drift fails closed.
- It makes no process-launch, login, browser, or dashboard-scraping attempt.

## Design

Canonical reference: [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).
The adapter composes the existing Claude provider mark, `ProviderCard`, `UsageMetric`,
`ProgressBar`, and unavailable treatment across the shipped `show-claude-short` and
`show-claude-weekly` panel roles. New primitives: none.

## Contracts

- API: [Provider slot](../../engineering/api-contracts.md#provider-slot) and
  [Claude credential and usage boundary](../../engineering/api-contracts.md#claude-credential-and-usage-boundary)
  — delta: a Claude module maps the evidenced source contract into the existing
  provider object with one short and one weekly window.
- Data: [Data model](../../engineering/data-model.md) — delta: no durable adapter
  data; transport results reduce to the presentation contract.
- Decisions: [Decision log](../../engineering/decision-log.md) — records the evidenced
  OAuth credential location, usage endpoint, short and weekly payload mapping, presence
  signal, and accepted compatibility risk.

## Architecture

The framework-free Claude contract establishes credential and response mapping without
filesystem or network access. CLAUDE-002 packages a Claude adapter module that registers
against the in-process provider slot, observes local Claude Code-session presence, reads
the existing OAuth credential at refresh time, and requests the accepted usage endpoint
asynchronously. The adapter owns presence, credential access, and transport handling;
the surface continues to own polling, rendering, and provider lifecycle. No process is
spawned by either layer.

## Preserve

- The pitch's opportunistic-visibility, privacy, and fail-closed constraints.
- The surface's strict provider-slot validation and one shared refresh cycle.
- The installed extension remains free of test stubs, credentials, and provider
  payload logging.
- The shipped Codex adapter's fail-closed and no-launch behavior stays unchanged.

## Build Slices

- [ ] `CLAUDE-001` — evidence the existing Claude Code OAuth credential, the accepted
  usage endpoint, the short and weekly response mapping, and the eligibility presence
  signal; add deterministic sanitized fixtures and record the fail-closed mapping
  decision. Medium: one credential-to-response boundary invariant, at most 14 files and
  750 handwritten lines.
- [ ] `CLAUDE-002` — implement the provider module against the evidenced contract,
  package it, and prove J-005 through the production surface. Medium: one
  eligibility-to-presentation invariant, at most 15 files and 800 handwritten lines.

## Non-Scope

- Starting or authenticating Claude Code, browser/dashboard automation, or undocumented
  remote endpoint discovery beyond the accepted usage endpoint.
- Codex adapter changes, usage history, notifications, or new visual primitives.
- Providers beyond Claude Code and Codex.

## Open Questions

- None. Local evidence resolved the pitch presence question: an exact current-user
  Claude Code process is accepted as sufficient eligibility, matching the Codex signal.
  The owner accepts the OAuth usage endpoint's compatibility risk; CLAUDE-001 must freeze
  its fail-closed credential and response boundary — reading only the account short and
  weekly windows and discarding model-scoped, dollar, and promotional fields — before
  CLAUDE-002.
