<div align="center">

# Claudex Usage

**Claude Code and Codex usage limits, at a glance in the GNOME panel.**

![GNOME Shell 50](https://img.shields.io/badge/GNOME%20Shell-50-4a86cf)
![GJS](https://img.shields.io/badge/built%20with-GJS-1a5fb4)
![Status: Codex live](https://img.shields.io/badge/status-Codex%20live-4a86cf)

<img src="design/captures/usage-dark-100.png" width="440" alt="Claudex Usage popover showing Claude and Codex usage windows, reset times, and usage history">

</div>

## Why

Subscription-backed coding agents run on rolling usage windows, but checking how much
capacity remains means leaving your work to open a separate status view. Claudex Usage
puts those numbers where you already are: while Claude Code or Codex is in use, a small
GNOME Shell indicator shows each provider's current usage windows and reset times —
and when the agents close, it gets out of the way.

## Principles

These constraints are product-level commitments, not implementation details
(canonical in the [product pitch](docs/product/pitch.md)):

- **One surface, per-provider adapters.** A single panel experience covers both
  providers.
- **Opportunistic visibility.** An indicator appears only while its matching
  application is active — no permanent background monitoring obligation.
- **Never wake an agent to watch it.** Codex usage uses the existing CLI login while a
  local session is present; nothing is started solely to obtain usage.
- **Privacy by default.** Credentials and raw provider responses are never persisted,
  logged, or displayed, and nothing is shared with another service.
- **Fail closed.** An outage, expired session, or provider failure produces an
  explicit unavailable state — never a stale or misleading value.

## Project status

The approved visual system, production surface, and live account-weekly Codex adapter
ship today. The Claude Code adapter is the next provider milestone.

| Capability | Status |
| --- | --- |
| Design system and primitive catalog | ✅ Done — Direction D, installable with a screenshot harness |
| Unified usage surface | ✅ Done — production UUID `claudex-usage@hugo.local`, persisted panel choices, and fail-closed polling while eligible providers exist |
| Codex provider adapter | ✅ Done — current account-weekly usage from the existing file-backed CLI login |
| Claude Code provider adapter | 🔜 Planned |

The [feature horizon](docs/product/feature-horizon.md) tracks the full capability map.

## Gallery

Every state is captured deterministically from an isolated GNOME Shell 50.1 session.
J-001 proves the static catalog; J-002 proves the production surface through
harness-only provider registration; J-004 proves the packaged Codex runtime from
session presence through credential rotation, unavailable data, and teardown.

| Panel indicator (dark) | Panel indicator (light) |
| --- | --- |
| ![Dark panel indicator](design/captures/panel-dark-100.png) | ![Light panel indicator](design/captures/panel-light-100.png) |

| Settings popover | Range focus & hover |
| --- | --- |
| <img src="design/captures/settings-dark-100.png" width="360" alt="Settings popover, dark theme"> | <img src="design/captures/usage-range-7d-focus-hover.png" width="360" alt="Usage history with the 7-day range focused and hovered"> |

The complete evidence set lives in [`design/captures`](design/captures/README.md).

## Preview without installing

Launch the catalog in an isolated GNOME Shell devkit session:

```bash
npm run capture
```

The devkit uses a disposable home and does not change the extensions installed in
the current desktop session.

## Install for development

The catalog currently supports GNOME Shell 50. Run these commands from the project
root to build and install it for the current user; `sudo` is not required.

```bash
npm run styles
mkdir -p /tmp/claudex-usage-package

gnome-extensions pack \
  --force \
  --extra-source=icons \
  --extra-source=catalog-state.js \
  --extra-source=../../extension/shared \
  --extra-source=../system/tokens.json \
  --out-dir=/tmp/claudex-usage-package \
  design/direction-lab

gnome-extensions install --force \
  /tmp/claudex-usage-package/claudex-usage-design@hugo.local.shell-extension.zip
```

On Wayland, log out and back in so GNOME Shell loads the newly installed code, then
enable the catalog and verify its status:

```bash
gnome-extensions enable claudex-usage-design@hugo.local
gnome-extensions info claudex-usage-design@hugo.local
```

To install an updated development build, repeat the pack and install commands, then
log out and back in. To remove the catalog:

```bash
gnome-extensions uninstall claudex-usage-design@hugo.local
```

This installs the static design catalog only. The production extension has UUID
`claudex-usage@hugo.local` and packages the built-in Codex adapter. It becomes visible
for an exact current-user process named `codex`, reads `CODEX_HOME/auth.json` (or
`~/.codex/auth.json`) at refresh time, and otherwise stays absent. Keyring-only login
and a `CODEX_HOME` not inherited by GNOME Shell are unavailable states.

## Development

One command is the entire validation gate — docs, token/CSS drift, unit tests,
extension packaging, and the isolated J-001 GNOME journey with capture verification:

```bash
npm test
```

Use `npm run capture` only when the canonical screenshots must be regenerated.

The project follows the [Aura workflow](AGENTS.md): work descends from an accepted
spec, docs are the source of truth, and every slice closes through the same gate.

## Documentation

| Document | Purpose |
| --- | --- |
| [Product pitch](docs/product/pitch.md) | Problem, promise, and provider constraints |
| [Product index](docs/product/README.md) | Every brief and spec with one-line status |
| [Feature horizon](docs/product/feature-horizon.md) | Capability maturity and parking lot |
| [Architecture](docs/engineering/architecture.md) | Catalog topology and boundaries |
| [Design system](docs/engineering/design-system.md) | Tokens, primitives, interaction idioms |
| [Primitive catalog](design/direction-lab/README.md) | The installable Direction D catalog |
| [Visual evidence](design/captures/README.md) | Canonical J-001 captures |

## Trademarks

Claude and Anthropic are trademarks of Anthropic. Codex, OpenAI, and the Blossom mark
are trademarks of OpenAI. This is an independent project, not affiliated with or
endorsed by either company; provider marks are vendored for local presentation
(see [provider mark provenance](design/direction-lab/icons/README.md)).
