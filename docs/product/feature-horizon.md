# Feature Horizon

Rough release intent and document maturity per capability. This is not a delivery
plan or task list.

Status values: `idea`, `brief`, `spec`, and `done`.

## V1

- Design system and primitive catalog — `done`; Direction D is implemented as an
  installable static catalog with its screenshot harness.
- Usage surface shell — `done`; provider-free production package, unified panel item,
  popup, and fail-closed provider slot ([SPEC-USAGE-SURFACE](specs/2026-07-16-usage-surface.md)).
- Claude adapter — `brief`; live Claude Code windows from the existing OAuth
  credential ([BRIEF-LIVE-USAGE](briefs/2026-07-16-live-usage.md)).
- Codex adapter — `brief`; live Codex windows from an already-running managed
  app-server ([BRIEF-LIVE-USAGE](briefs/2026-07-16-live-usage.md)).

## Later / Parking Lot

- Local usage history — `idea`; decide whether the trajectory chart belongs in the
  product after the core glance-and-reset experience is validated.
- Usage-threshold notifications — `idea`; consider only after live values are
  trustworthy.
