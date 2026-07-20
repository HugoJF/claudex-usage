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

The installed extension registers built-in Codex and Claude providers through the same
in-process API used by external adapters. J-002 and J-003 use disposable packages whose
built-in providers are ineligible under reserved IDs, so their Claude and Codex stubs
remain isolated; no fixture is present in the canonical ZIP.
One five-minute timer exists only while at least one provider is eligible. A refresh
starts immediately whenever a provider newly becomes eligible: it replaces an idle
cadence timer or coalesces into one follow-up after an in-flight cycle. Each completion
is emitted before a queued successor begins, scheduling starts after the final
completion, and failure or ineligibility clears retained readings before rendering.

`codex-runtime.js` scans numeric `/proc` entries every two seconds for an exact
current-user `codex` command name. While present, each surface refresh opens the
current file-backed Codex auth JSON and sends one cancellable, non-redirecting request
to the accepted usage endpoint. Both input streams are bounded during ingress and
decoded strictly. Absence, malformed data, non-200 status, cancellation, or teardown
reduces to unavailable without logging, persistence, process launch, or retained
source values. J-004 keeps this composition intact while substituting only disposable
endpoint and process-root inputs.

The package declares `org.gnome.shell.extensions.claudex-usage` and includes its
GSettings schema, which GNOME compiles on installation. It persists the three
panel-visibility booleans, the accepted refresh enum, and the local-history boolean and
range enum; settings changes rerender the panel immediately and reschedule the single
timer without a concurrent refresh. The J-003 harness proves the values survive two fresh
Shell sessions through a disposable keyfile backend.

`history-store.js` is a pure sample-store boundary shared by Node and GJS; `history-runtime.js`
loads and persists its serialized form as a durable JSON file under the user data
directory. When local history is enabled, each completed refresh records one bounded
sample per available provider window, and the popup derives the merged trajectory for the
selected range from the store — reusing the shipped `HistoryChart`, `RangeSelector`, and
`Legend`. Recording rides the existing refresh, so nothing samples or writes while no
provider is present, and nothing recorded leaves the machine. Distinct refreshes that
complete in the same clock millisecond receive adjacent safe millisecond timestamps so
their ordering survives the store's strict monotonic boundary. J-006 seeds a store,
proves the chart, ordered live samples, the range switch, and the disable path, and
reuses the J-005 Claude endpoint and process-root inputs.
