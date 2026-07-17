# User Journeys

App-wide journey registry. Stable `J-XXX` IDs are added when a Spec is authored;
each Spec declares which journeys it creates, extends, or joins.

## Index

| ID | Name | Owning specs | Test |
| --- | --- | --- | --- |
| J-001 | Review usage interface primitives | SPEC-PRIMITIVE-CATALOG | `tests/journeys/J-001-primitive-catalog.journey.test.js` |
| J-002 | Glance at live usage | SPEC-USAGE-SURFACE | `tests/journeys/J-002-usage-surface.journey.test.js` |
| J-003 | Persist panel preferences | SPEC-USAGE-SURFACE | `tests/journeys/J-003-panel-preferences.journey.test.js` |
| J-004 | See Codex usage | SPEC-CODEX-ADAPTER | `tests/journeys/J-004-codex-usage.journey.test.js` |
| J-005 | See Claude usage | SPEC-CLAUDE-ADAPTER | `tests/journeys/J-005-claude-usage.journey.test.js` |

## J-001 — Review usage interface primitives

Owning Spec: [SPEC-PRIMITIVE-CATALOG](specs/2026-07-16-primitive-catalog.md)

1. The developer packages and installs the static catalog into a GNOME Shell 50.1
   development session.
2. The Shell panel shows the enabled Claude and Codex provider marks with their static
   percentages at native panel height.
3. The developer opens the indicator and reviews the provider groups, limit bars,
   reset timing, merged chart, Y-axis labels, range controls, and full legend.
4. The developer opens settings and changes each panel-visibility control; the panel
   preview reflects the state without closing the popup.
5. The developer captures the catalog state matrix across required themes, scaling,
   keyboard focus, hover, ranges, and switch states.

## J-002 — Glance at live usage

Owning Spec: [SPEC-USAGE-SURFACE](specs/2026-07-16-usage-surface.md)

1. While at least one eligible provider is present, the unified panel item shows
   each eligible provider's mark and enabled percentages at native panel height.
2. The user opens the popup and reviews provider cards: window percentages,
   zero-origin bars, reset times, and the freshness footer with its refresh action.
3. The user triggers refresh; values and freshness text update without the popup
   closing.
4. A provider's data becomes unavailable; its card presents the unavailable notice
   with no numeric values while other providers stay live.
5. The last eligible provider goes away; the panel item disappears and all polling
   stops.

## J-003 — Persist panel preferences

Owning Spec: [SPEC-USAGE-SURFACE](specs/2026-07-16-usage-surface.md)

1. The user opens the settings view from the popup's gear action.
2. The user switches a limit's visibility off; the panel reflects the change
   immediately and the popup stays open.
3. The user changes the refresh-cadence choice; the new cadence applies without a
   restart.
4. After GNOME Shell restarts, the panel and popup honor the persisted visibility
   and cadence choices.

## J-004 — See Codex usage

Owning Spec: [SPEC-CODEX-ADAPTER](specs/2026-07-17-codex-adapter.md)

1. The user starts or already has a local Codex session; the GNOME panel adds the
   Codex mark and its current weekly usage using the existing CLI login.
2. The user opens the unified popup and reviews Codex's weekly percentage and reset
   time alongside any other eligible provider.
3. The last local Codex session closes; Codex disappears from the surface without the
   extension starting or retaining a Codex process.
4. The credential or usage service returns unusable data; Codex shows the unavailable state
   without stale metrics or exposed response details.

## J-005 — See Claude usage

Owning Spec: [SPEC-CLAUDE-ADAPTER](specs/2026-07-17-claude-adapter.md)

1. The user starts or already has a local Claude Code session; the GNOME panel adds the
   Claude mark and its current short and weekly usage using the existing OAuth login.
2. The user opens the unified popup and reviews Claude's short and weekly percentages and
   reset times alongside any other eligible provider.
3. The last local Claude Code session closes; Claude disappears from the surface without
   the extension starting or retaining a Claude Code process.
4. The credential or usage service returns unusable data; Claude shows the unavailable
   state without stale metrics or exposed response details.
