---
id: SPEC-CODEBASE-CLEANUP
type: spec
status: draft
owner: hugo
created: 2026-07-21
updated: 2026-07-21
source_docs:
  - docs/product/briefs/2026-07-16-live-usage.md
  - docs/product/briefs/2026-07-17-local-history.md
parent_ids: [BRIEF-LIVE-USAGE, BRIEF-LOCAL-HISTORY]
child_docs: []
tags: [quality, gnome, trust-boundary]
supersedes: []
---

# Spec: Codebase Cleanup

## Goal

Make every first-party JavaScript and CSS surface easier to verify and change while
preserving valid-user behavior, production pixels, and the concrete Claude and Codex
provider contracts.

## User Journeys

### J-001 through J-006 — preserve every shipped journey (extends)

Intent: keep the shipped catalog, usage, preferences, provider, and history journeys
trustworthy while their implementation is simplified.

Acceptance:

- **J-001** Quiet Utility is the sole executable catalog composition and is proven in
  required themes, scales, disabled, focus, and hover states.
- **J-002/J-003** Production presentation, refresh, lifecycle, settings, and pixels are
  unchanged for valid inputs; invalid clocks produce explicit unavailable-time output.
- **J-004/J-005** Built-in adapters preserve their public metadata and valid request
  behavior while malformed process, credential, timestamp, and transport inputs fail closed.
- **J-006** One canonical frozen range model drives persistence and the inline stepper;
  malformed or oversized history fails closed and a fresh session reload renders it.

## Surface Map

- Production extension — lifecycle orchestration plus focused panel, usage, history,
  and settings builders.
- Shared presentation — one component per direct-import module; no primitive barrel or
  hidden progress-marker state.
- Provider boundaries — concrete runtimes sharing only bounded I/O, exact presence,
  cancellable request cleanup, and small value predicates.
- Developer catalog — Quiet Utility only, split by surface, with generic capture names.
- Validation — full-repository ESLint, module-graph accounting, package scanning, and
  committed positive and negative fixtures in the single `npm test` gate.

## Cross-Journey Acceptance

- Provider slots, ordering, frozen snapshots, coalescing, eligibility, idempotent
  unregister, provider options, endpoints, headers, and metadata remain stable.
- Out-of-lifecycle extension API calls throw one stable error; repeated disable is safe.
- Production captures remain byte-identical; only canonical catalog evidence changes.
- Every first-party JavaScript and CSS surface passes the documented quality rules and
  package/privacy checks without warnings.

## Design

Canonical composition: Quiet Utility, formerly variant A, using the existing approved
tokens and production geometry. Rejected executable variants and selectors are removed.

## Contracts

- API: [provider and history boundaries](../../engineering/api-contracts.md) retain
  their public shapes while validation and lifecycle failures become explicit.
- Architecture: [shared and production topology](../../engineering/architecture.md)
  is decomposed without a provider framework, service container, or compatibility barrel.
- Design: [design system](../../engineering/design-system.md) retains production tokens,
  geometry, light/dark states, and accessibility roles.

## Preserve

- All six journey outcomes and valid persisted v1 history.
- GSettings keys and enum indices, including the default `6h` range.
- Concrete Codex and Claude factory/runtime exports and provider-specific validation.
- Local-only history, no credential retention, and no provider work from presentation ticks.

## Build Slices

- [x] `CLEAN-001` — reconcile history authority, register this Spec, and remove stale contract text.
- [x] `CLEAN-002` — install pinned ESLint 10 flat-config guardrails.
- [x] `CLEAN-003` — extract the production history stepper with focus and pixel proof.
- [x] `CLEAN-004` — make Quiet Utility the sole split catalog and canonical evidence.
- [x] `CLEAN-005` — commit proof fixtures and remove `RangeSelector`.
- [x] `CLEAN-006` — make one frozen range model authoritative everywhere.
- [x] `CLEAN-007` — strictly parse Claude timestamps with built-in `Date`.
- [x] `CLEAN-008` — harden process, bounded-file, and cancellation boundaries.
- [x] `CLEAN-009` — harden history ingress, identifiers, v1 validation, and ownership.
- [x] `CLEAN-010` — share only proven provider infrastructure.
- [x] `CLEAN-011` — split presentation primitives and remove hidden geometry state.
- [x] `CLEAN-012` — make invalid-clock behavior explicit and safe.
- [ ] `CLEAN-013` — split controller validation, time, and state-machine concerns.
- [ ] `CLEAN-014` — split extension composition into focused view builders.
- [ ] `CLEAN-015` — split harness/package checks and strengthen recursive scanning.
- [ ] `CLEAN-016` — close lint exclusions, reconcile docs, and bind final assessment.

## Non-Scope

- New provider behavior, provider generalization, date dependencies, history migration,
  new settings, visual redesign, release packaging, or broader Shell compatibility.

## Open Questions

None.
