# AGENTS.md

Entry point for AI agents: Grok, Claude Code, Codex, Cursor and others.

**If you cannot run code** (for example a chat assistant reading this repo on the web): explain from `docs/APPROACH.md`, `skills/watts-to-space/references/curriculum.md` and the provenance notes in `src/model/scenarios.ts`. Quote only numbers that appear in those files, with their stated conditions, and say they come from the docs rather than a fresh model run. Send the reader to https://watts-to-space.chrislewicki.com to try values themselves. Do not estimate model output you have not run.

## What this repo is

`watts-to-space` is an open-source, auditable explorer of the power and heat-rejection hardware for energy-hungry work in space: orbital data centers, cislunar industry, the lunar surface. Pure TypeScript on Bun, zero runtime dependencies. The model (`src/model/`) is three parts joined by three quantities: heat path (coolant temperature), radiator times location (net heat per m², so radiator area), power supply times location (solar array area, battery mass). The same model runs in the web page and in the command line.

Repo: https://github.com/interplanetarychris/watts-to-space

## Start here

**Load `skills/watts-to-space/SKILL.md`.** It tells you how to run analyses, share scenarios, help improve the model, and tutor a person on the subject. (Claude Code finds it at `.claude/skills/watts-to-space`; other agents should read the file directly.) Deeper material is in `skills/watts-to-space/references/`, loaded on demand.

Then do what the user asked:

- *Analyze / size / compare / "what if"*: run the CLI, report its numbers with units, name the assumptions behind them.
- *Open a share link*: `bun run analyze --share '<string or URL>'`.
- *Make a link to post*: `bun run analyze <scenario options> --share-out --format table`.
- *Teach / walk me through*: use `skills/watts-to-space/references/curriculum.md`; run the model with the user, ask one question at a time.
- *Improve the model*: read `CONTRIBUTING.md`, then follow the skill's pull-request recipe.

## Quick commands

Requires `bun` version 1.4 or newer.

```text
bun install                       # once; dev dependencies only
bun test                          # unit tests; must pass
bun x tsc --noEmit                # type check; must pass
bun run build                     # static site in dist/
bun run build:standalone          # single-file page in dist-standalone/
bun run analyze --help            # the analysis CLI
bun run analyze --list            # modes, heat sources, environments, tunable inputs
bun run analyze --mode starmind --set heatSource.totalPower_W=500000
bun run analyze --compare --format table
bun run analyze --explain all     # every provenance note, and inputs with none
```

## Non-negotiable rules

1. **Provenance.** Every number needs a note in `src/model/scenarios.ts` tagged `[source-id]`, `ASSUMPTION`, `CALIBRATED` or `SECONDARY`. Never invent a source, a URL or a number. Add a source only after opening it. If a figure has no source, say so.
2. **Run the model; do not recall numbers.** Report what the CLI printed, with units, and keep three things apart: physics, model output, assumptions. Name the relevant limitation from `docs/APPROACH.md` section 7.
3. **Tests.** Never change physics without a test. New physics is a pure function in `src/model/` plus a test, cross-checked against brute force where a closed form exists. Keep the validation anchors green. Run `bun test` and `bun x tsc --noEmit` before you say you are done.
4. **Terminology.** Say "solar array", never a bare "array" for hardware. The radiator is a "radiator" or "radiator panel", never an array. Never use the word "radiation" alone: say "thermal emission", "radiates" or "Stefan–Boltzmann".
5. **Never start servers on the user's behalf without asking.** That includes `bun run dev`. The CLI does not need one.
6. **No new runtime dependencies**, and do not change the chart palette `--s1` to `--s6` in `styles.css`.
7. **Share strings carry parameters only.** The checksum is for accidental damage, not a signature. Do not describe a link as proof of authorship.
8. **Licensing.** Code is MIT (`LICENSE`); written content and figures are CC BY 4.0 (`LICENSE-CONTENT.md`). Keep the credit line on charts and diagrams when you reproduce them.
9. Do not commit or open a pull request unless the user asks.

## Where things are

`src/model/` physics (`docs/APPROACH.md` explains it; `skills/watts-to-space/references/model-map.md` maps equations to functions) · `scripts/analyze.ts` the CLI · `test/` tests and validation anchors · `src/ui/`, `index.html`, `styles.css` the page · `CONTRIBUTING.md` the contribution rules.
