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
- Current phase: product documentation and visual design; no application code yet.

```bash
node scripts/doc-lint.mjs docs/product docs/engineering
```

This document gate is the single validation command until application tooling is
introduced. Development and screenshot-harness commands will be added with the
first implementation Spec.

## Architecture

No application topology has been accepted yet. The founding provider constraints
are canonical in `docs/product/pitch.md`. The first UI milestone uses static mock
states so panel and popup design can be settled independently of provider access.

## Docs Map

- `docs/product/` — pitch, briefs, specs, journey registry, and feature horizon
- `docs/engineering/` — architecture and shared engineering contracts
- `design/` — canonical in-repository design references and visual captures

## Project Conventions

- Target GNOME Shell 50.1 first; broader Shell-version support requires an explicit
  compatibility decision.
- Keep provider access out of the design prototype.
- Treat light and dark Shell themes as required visual states.
