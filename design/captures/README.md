# GNOME journey captures

These images are deterministic actor-level captures from isolated GNOME Shell 50.1
journeys. J-001 covers the developer-only primitive catalog: its selected Direction D
panel, usage and settings states, range focus/hover, off visibility switch, light
Shell chrome, and 200% panel scaling. Its refinement review adds panel and popup
captures for Quiet Utility, Explicit Pace, and Status Rail, plus the proposed
default-on Time pace setting in Quiet Utility.

J-002 covers the provider-free production package after harness-only providers are
registered through its public contract: dark panel and popup, refresh focus/hover,
unavailable treatment, light panel, and 200% panel scaling. The production surface's
absent state is asserted by the journey rather than captured.

J-003 covers the same production package's persisted settings: dark settings,
visibility-switch focus/hover, cadence-choice focus/hover, and light settings. It
also proves the selected values in a separate fresh Shell session using a disposable
GSettings keyfile.

J-006 adds the production Left popup and the compact history-range select. Current
values and bars are complemented from canonical used percentages, and asymmetric
seeded history proves the chart trajectory is complemented without rewriting the
local sample store. Open-select evidence covers dark and light Shell states plus an
isolated 200% selector state; the journey also drives its keyboard map, focus
restoration, native Shell Escape, persisted enum, uncovered-range escape, and
request/store invariance.

J-002's default, pending-refresh, and unavailable popup captures retain the compact
select in its closed empty-history state, so those production baselines cover the
control alongside provider success, refresh, and partial-failure presentation.

Regenerate the evidence from an isolated GNOME Shell 50.1 session:

```bash
npm run capture
```

The ordinary `npm test` gate runs the same journey into a temporary directory so
validation does not dirty the worktree.
