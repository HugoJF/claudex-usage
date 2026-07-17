# Feature Horizon

Rough release intent and document maturity per capability. This is not a delivery
plan or task list.

Status values: `idea`, `brief`, `spec`, and `done`.

## V1

- Design system and primitive catalog — `done`; Direction D is implemented as an
  installable static catalog with its screenshot harness.
- Usage surface shell — `done`; persisted panel preferences, unified panel item,
  popup, and fail-closed provider slot ([SPEC-USAGE-SURFACE](specs/2026-07-16-usage-surface.md)).
- Claude adapter — `spec`; live Claude Code short and weekly windows from the existing
  OAuth credential ([SPEC-CLAUDE-ADAPTER](specs/2026-07-17-claude-adapter.md)).
- Codex adapter — `done`; live weekly usage through the existing CLI credential while
  a local session is present ([SPEC-CODEX-ADAPTER](specs/2026-07-17-codex-adapter.md)).

## Later / Parking Lot

- Local usage history — `idea`; decide whether the trajectory chart belongs in the
  product after the core glance-and-reset experience is validated.
- Usage-threshold notifications — `idea`; consider only after live values are
  trustworthy.
