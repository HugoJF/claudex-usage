# AGENTS Instructions

Canonical agent contract for this repository; `CLAUDE.md` is a compatibility
pointer here. Workflow rules live in the installed Aura plugin's `WORKFLOW.md`.
This file contains only Claudex Usage project facts.

## Read Order

1. `AGENTS.md` (this file)
2. `README.md`
3. `docs/product/README.md` and `docs/product/journeys.md`
4. The Spec for the work
5. The `docs/engineering/` files linked by that Spec

## Stack & Commands

- Target desktop: GNOME Shell 50.1 on Linux.
- Intended UI surface: a GNOME Shell extension written in GJS.
- Current phase: approved visual system, developer-only primitive catalog, persisted
  panel preferences, and a built-in account-weekly Codex adapter; the Claude adapter
  remains unimplemented.

```bash
npm test
```

This is the single validation gate: docs, token/CSS drift, unit tests, extension
packaging, the isolated J-001 GNOME journey, and temporary capture verification.
Use `npm run capture` only when canonical visual evidence must be regenerated.

## Architecture

`design/direction-lab` is the developer-installed static Shell extension described
in `docs/engineering/architecture.md`. Provider access stays out of that prototype;
the production Codex topology is documented separately in the same architecture.

## Docs Map

- `docs/product/` — pitch, briefs, specs, journey registry, and feature horizon
- `docs/engineering/` — architecture and shared engineering contracts
- `design/` — canonical in-repository design references and visual captures

## Project Conventions

- Target GNOME Shell 50.1 first; broader Shell-version support requires an explicit
  compatibility decision.
- Keep provider access out of the design prototype.
- Treat light and dark Shell themes as required visual states.
