# User Journeys

App-wide journey registry. Stable `J-XXX` IDs are added when a Spec is authored;
each Spec declares which journeys it creates, extends, or joins.

## Index

| ID | Name | Owning specs | Test |
| --- | --- | --- | --- |
| J-001 | Review usage interface primitives | SPEC-PRIMITIVE-CATALOG | `tests/journeys/J-001-primitive-catalog.journey.test.js` |

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
