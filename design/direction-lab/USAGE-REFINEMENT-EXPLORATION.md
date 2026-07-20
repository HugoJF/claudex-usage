# Usage Surface Refinement Exploration

Direction D remains the visual system. This developer-only exploration compares
three static compositions for compact range selection, refresh feedback, provider
hierarchy, compact-panel differentiation, and optional Time pace markers. It
contains no provider access, polling, or production persistence.

## Shared intent

- Put refresh beside settings and retain a status-only freshness footer.
- Remove provider-detail subtitles from current-value cards.
- Replace five always-visible history ranges with one compact select.
- Make Claude's compact 5-hour value quieter than its weekly value.
- Compare usage with elapsed window time through a neutral marker when the global
  Time pace setting is on.
- Keep the marker advisory: no target, forecast, alert, or ahead/behind judgment.

## Variant A — Quiet Utility

The recommended composition keeps the popup visually quiet: two flat header icons,
an abbreviated range select, provider names without subtitles, a thin unlabeled
marker crossing each bar, and freshness as footer metadata. The compact panel mutes
only Claude's first percentage while stable order and accessibility name the window.

Refresh feedback swaps the circular-arrow icon to its busy state without adding
completion animation or moving text. Settings expose **Time pace markers** as one
global switch, default on.

Review captures:

- `usage-refinement-a-panel-dark-100.png`
- `usage-refinement-a-popup-dark-100.png`
- `usage-refinement-a-settings-dark-100.png`

## Variant B — Explicit Pace

The header keeps the same two icon actions but exposes visible `Refreshing…`
microcopy during work. The range select uses `Last 6 hours`, each reset row names
the marker as `Time pace 23%`, and the compact Claude value gains a muted `5h`
prefix. This minimizes interpretation cost at the price of width and repeated copy.

Review captures:

- `usage-refinement-b-panel-dark-100.png`
- `usage-refinement-b-popup-dark-100.png`

## Variant C — Status Rail

Refresh and freshness become one compact header control, the history select keeps
the short `6h` label, and each marker uses a small `PACE` caption above the track.
The footer disappears. This is the densest, most instrument-like option and competes
most strongly with current usage values.

Review captures:

- `usage-refinement-c-panel-dark-100.png`
- `usage-refinement-c-popup-dark-100.png`

## Primitive budget

**Composes:** `PopoverScaffold`, `PanelIndicator`, `ProviderCard`, `UsageMetric`,
`ProgressBar`, `HistoryChart`, `Legend`, `IconButton`, `SettingsRow`, `Switch`,
`ChoiceRow`, and `FooterStatus`.

**Introduces:** compact select menu; optional provider detail; per-value panel tone;
IconButton busy state; status-only FooterStatus; optional neutral ProgressBar marker.
No new token is proposed: existing muted foreground, separator, focus, spacing,
radius, and type roles cover all three variants.

**CANONICAL: variant A — Quiet Utility keeps every requested signal visible with the
least repeated copy and no new token role.**
