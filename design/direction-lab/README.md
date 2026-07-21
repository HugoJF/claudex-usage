# Claudex Usage Primitive Catalog

Developer-only GNOME Shell extension containing the approved static Direction D
panel, usage popup, settings popup, and interaction states. It performs no
authentication, provider calls, polling, or persistence.

The lab also carries the concise
[Quiet Utility decision record](USAGE-REFINEMENT-EXPLORATION.md). Rejected alternatives
are historical context only and have no executable controls, branches, or captures.

## Validate and review

Run the complete gate. It renders the token-backed stylesheet, packages the catalog,
installs it into an isolated GNOME Shell 50.1 devkit session, runs J-001, and verifies
temporary screenshots:

```bash
npm test
```

Regenerate the canonical evidence under [`design/captures`](../captures/):

```bash
npm run capture
```

The package includes `extension.js`, the process-local catalog fixtures and state,
the neutral `shared/` presentation directory, both provider-mark contrast variants,
the canonical token manifest, and the generated root stylesheet GNOME loads. The
catalog owns all Direction D copy and adapts its frozen snapshot into explicit
shared presentation models.

The gate also generates a temporary second-consumer package from the same shared
JavaScript, tokens, and stylesheet. It constructs noncatalog actors, exercises
callbacks and invalid inputs, then destroys the tree. Both packages run in
disposable XDG homes, so review does not alter installed extensions.
