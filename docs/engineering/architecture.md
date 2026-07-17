# Architecture

The product constraints governing provider boundaries are canonical in the
[product pitch](../product/pitch.md).

## Shared presentation topology

`extension/shared` is the neutral presentation source. `token-geometry.js` owns
token validation, strict CSS-color conversion, and percentage geometry;
`primitives.js` owns only the documented St/Clutter primitive inventory; and
`stylesheet.template.css` is the canonical Shell stylesheet contract. Both
JavaScript modules fail closed on invalid presentation input and import no catalog
fixtures or state.

The developer-only GNOME Shell 50.1 catalog remains under
`design/direction-lab`. Its `extension.js` adapts disposable `catalog-state.js`
snapshots and static fixtures into presentation models, composes the shared
primitives, and destroys the prior actor tree on every rerender. Provider marks
remain local attributed assets with unmodified dark- and light-chrome variants.

The packaged token manifest drives runtime drawing and actor geometry. The shared
template generates the catalog's root `stylesheet.css`, which GNOME loads, and the
gate rejects source or generated-file drift. Packaging includes the complete
`shared/` directory and tokens while forbidding stale root shared modules.

The catalog has no provider boundary, credential access, network process, polling,
or durable storage. The gate installs it and a generated, noncanonical temporary
second consumer into separate disposable GNOME devkit sessions.

## Production surface topology

`extension/` is the persistent Shell 50 production package, UUID
`claudex-usage@hugo.local`. It packages the shared primitives, token manifest,
generated stylesheet, and canonical provider marks. `surface-controller.js` is pure
and Node-testable: it validates the provider-slot contract, snapshots presentation
metadata, coalesces refreshes, and emits presentation models. `extension.js` owns
`PanelMenu`, GLib timeout ownership, theme changes, actor composition, and teardown.

The installed extension is provider-free. The J-002 harness registers Claude and
Codex stubs through the real in-process API; neither fixture is present in the ZIP.
One five-minute timer exists only while at least one provider is eligible. A refresh
starts immediately when the first provider becomes eligible, scheduling begins after
completion, and failure or ineligibility clears retained readings before rendering.

No settings schema or provider data persistence exists in this slice. SURF-003 owns
preference storage and a user-selectable cadence.
