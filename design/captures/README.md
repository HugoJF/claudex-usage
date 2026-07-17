# GNOME journey captures

These images are deterministic actor-level captures from isolated GNOME Shell 50.1
journeys. J-001 covers the developer-only primitive catalog: its selected Direction D
panel, usage and settings states, range focus/hover, off visibility switch, light
Shell chrome, and 200% panel scaling.

J-002 covers the provider-free production package after harness-only providers are
registered through its public contract: dark panel and popup, refresh focus/hover,
unavailable treatment, light panel, and 200% panel scaling. The production surface's
absent state is asserted by the journey rather than captured.

Regenerate the evidence from an isolated GNOME Shell 50.1 session:

```bash
npm run capture
```

The ordinary `npm test` gate runs the same journey into a temporary directory so
validation does not dirty the worktree.
