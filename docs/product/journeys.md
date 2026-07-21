# User Journeys

App-wide journey registry. Stable `J-XXX` IDs are added when a Spec is authored;
each Spec declares which journeys it creates, extends, or joins.

## Index

| ID | Name | Owning specs | Test |
| --- | --- | --- | --- |
| J-001 | Review usage interface primitives | SPEC-PRIMITIVE-CATALOG | `tests/journeys/J-001-primitive-catalog.journey.test.js` |
| J-002 | Glance at live usage | SPEC-USAGE-SURFACE | `tests/journeys/J-002-usage-surface.journey.test.js` |
| J-003 | Persist display preferences | SPEC-USAGE-SURFACE | `tests/journeys/J-003-panel-preferences.journey.test.js` |
| J-004 | See Codex usage | SPEC-CODEX-ADAPTER | `tests/journeys/J-004-codex-usage.journey.test.js` |
| J-005 | See Claude usage | SPEC-CLAUDE-ADAPTER | `tests/journeys/J-005-claude-usage.journey.test.js` |
| J-006 | See usage history | SPEC-LOCAL-HISTORY | `tests/journeys/J-006-usage-history.journey.test.js` |

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

1. While at least one eligible provider is present, the unified panel item shows each
   eligible provider's mark and enabled percentages at native panel height; a newly
   eligible provider's current values appear without waiting for the existing cadence,
   and Claude's compact 5-hour value is visually quieter than its weekly value.
2. The user opens the popup and reviews compact provider cards: each named window has
   its percentage, zero-origin bar, reset time, and — while Time pace is enabled — a
   neutral marker comparing utilization with elapsed window time. Weekly markers use
   the selected Every day or Weekdays schedule; shorter rolling windows always use
   elapsed clock time.
3. The user triggers the refresh action beside settings; its busy state, current
   values, freshness text, reset countdowns, and time markers update in place without
   the popup closing, moving keyboard focus, collapsing an open range select, or a
   passage-of-time update requesting provider data.
4. A provider's data becomes unavailable; its card presents the unavailable notice
   with no numeric values while other providers stay live.
5. The last eligible provider goes away; the panel item disappears and all polling
   stops.

## J-003 — Persist display preferences

Owning Spec: [SPEC-USAGE-SURFACE](specs/2026-07-16-usage-surface.md)

1. The user opens the settings view from the popup's gear action.
2. The user switches a limit's visibility off; the panel reflects the change
   immediately and the popup stays open.
3. The user changes Usage display from Used to Left; panel values, popup percentages
   and bars, accessibility, and any visible history trajectory update immediately
   while recorded usage remains unchanged.
4. The user turns Time pace off or on; every current bar removes or restores its
   marker immediately without refreshing a provider.
5. The user changes weekly pace from Every day to Weekdays; weekly markers update
   immediately using only local weekday time remaining before the provider reset,
   while shorter rolling-window markers do not change.
6. The user changes the refresh-cadence choice; the new cadence applies without a
   restart.
7. After GNOME Shell restarts, the panel and popup honor the persisted visibility,
   usage-display, Time pace, weekly-pace schedule, and cadence choices.

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

## J-006 — See usage history

Owning Spec: [SPEC-LOCAL-HISTORY](specs/2026-07-17-local-history.md)

1. While using an agent with local history on, each refresh records a durable sample and
   the popup shows the merged multi-provider trajectory for the selected range.
2. The user opens the compact history select with the pointer or keyboard, navigates
   its choices, and selects a range; the chart re-renders over the new window from
   recorded samples without a network request or history mutation. An uncovered range
   keeps the select available, and Escape closes the containing Shell popup.
3. After a GNOME Shell restart, the popup honors the persisted history and range choice;
   no sample was recorded while no provider was eligible.
4. The user turns local history off; recording stops and the chart disappears while the
   current-value panel and cards stay live, and nothing recorded leaves the machine.
