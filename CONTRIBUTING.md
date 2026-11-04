# Contributing to watts-to-space

Thank you for helping. This project is a small, auditable model of the power and heat-rejection hardware behind energy-hungry work in space, with a page that lets anyone change the assumptions and see what moves. Its value is that every number can be checked. Contributions that make a number more correct, better sourced, or easier to check are the most welcome. If you use an AI coding agent, point it at [AGENTS.md](AGENTS.md); it carries these rules.

**License.** Code is MIT ([LICENSE](LICENSE)); written content and figures are CC BY 4.0 ([LICENSE-CONTENT.md](LICENSE-CONTENT.md)). By contributing you agree that your code is licensed under MIT and your text and figures under CC BY 4.0, on the same terms.

## Scope

In scope:

- Better sourced values for existing assumptions (the best first contribution).
- New physics that closes a documented limitation (the roadmap is in [docs/APPROACH.md](docs/APPROACH.md) section 8), with a test.
- New presets: modes, environments, heat sources, with provenance.
- Corrections to equations, units, or documentation.
- Accessibility and clarity improvements to the page.
- The analysis CLI and the agent skill in [skills/watts-to-space/](skills/watts-to-space/SKILL.md).

Out of scope by design: cost modelling (see McCalip's model, linked in the README), payload mass, and anything that adds a runtime dependency.

## Development setup

Requires [Bun](https://bun.sh) version 1.4 or newer.

```text
git clone https://github.com/interplanetarychris/watts-to-space
cd watts-to-space
bun install
bun test
```

| Command | What it does |
|---|---|
| `bun test` | Unit tests (`bun:test`). Must pass. |
| `bun x tsc --noEmit` (or `bun run typecheck`) | Strict type check. Must pass. |
| `bun run build` | Static site in `dist/`. |
| `bun run build:standalone` | One self-contained HTML file in `dist-standalone/index.html`. |
| `bun run analyze --help` | Command-line analysis of any scenario. |
| `bun run dev` | Serves the page for development. Start it yourself; agents must not start it for you. |

## Project layout

```text
src/model/            pure, DOM-free physics; every function unit-testable
  types.ts            the Scenario data shape (units in field names)
  constants.ts        measured or defined constants only, each with a source
  thermalEmission.ts  thermal emission: Stefan–Boltzmann, T⁴-mean glide, fin efficiency, inverse solve
  viewFactor.ts       plate-to-sphere view factors, plate-to-plane
  orbit.ts            period, eclipse fraction, albedo geometry
  environment.ts      absorbed flux per radiator face; sunlight for storage sizing
  thermalChain.ts     the temperature staircase
  power.ts            solar array specific power, storage sizing, harness copper for a loss target
  system.ts           whole-system energy balance
  sensitivity.ts      sweeps and tornado
  scenarioIO.ts       JSON export, import and validation; diff against the reference mode
  shareLink.ts        share strings (w2s1)
  transport.ts        electricity versus heat over distance
  scenarios.ts        modes, environments, heat sources, sources, tunable parameters
src/ui/               charts.ts (dependency-free SVG) and app.ts (page wiring)
scripts/analyze.ts    the analysis CLI
skills/watts-to-space the Agent Skill (also visible to Claude Code at .claude/skills/)
test/                 physics, system, IO, share and CLI tests, including validation anchors
docs/APPROACH.md      equations, assumptions, validation, limitations, roadmap
```

The model is three parts joined by three quantities: heat path (produces coolant temperature), radiator times location (net heat per m², so radiator area), power supply times location (solar array area and battery mass). The heat load and the location are shared. `evaluateScenario` composes `evaluateChain`, `netRejectionPerPanelArea` and `sizePowerSupply`. [skills/watts-to-space/references/model-map.md](skills/watts-to-space/references/model-map.md) lists where each equation lives.

## Provenance rules

Every number a user can see needs a provenance note in `src/model/scenarios.ts`, tagged with exactly one of:

| Tag | Meaning |
|---|---|
| `[source-id]` | A reference listed in `SOURCES` (title and URL). Prefer a primary source. |
| `ASSUMPTION` | Engineering judgement. Replace it with better data and cite it. |
| `CALIBRATED` | Tuned so the model reproduces a named published figure. Name the figure. |
| `SECONDARY` | Widely quoted but not confirmed against a primary source. |

A test fails on an untagged note or an unknown source id. Add a source to `SOURCES` only after you have opened it and checked that it says what the note claims. Never add a source from memory or from a summary; an agent must not invent a citation.

Good notes, from the code:

```text
'radiator.emissivity': 'Z-93 white paint, ε ≈ 0.92, α ≈ 0.17 at beginning of life [gilmore][nasa-radiator-2026].'
'radiator.sizingMargin': 'CALIBRATED (1.80): makes this model reproduce the EATCS 70 kW rating on 6 radiator ORUs of 23.3 m × 3.4 m (475 m²) [nasa-atcs]. Lumps hot-case environment, coating degradation, flow distribution and reserve.'
'heatSource.maxTemperature_K': '373 K (100 °C) junction: the premise that the chips run reliably this hot. HBM DRAM may set a lower limit. ASSUMPTION.'
```

What makes them good: the value, where it comes from, what it lumps or leaves out, and the tag. A bad note says "typical value" or cites a source without saying what it says.

Constants versus assumptions: only measured or defined quantities (Stefan–Boltzmann constant, solar constant, body radii) go in `constants.ts`. A design choice never does.

Check your work: `bun run analyze --mode <mode> --explain <path>` shows the note and resolved URLs; `bun run analyze --explain all` also lists `parametersWithoutNote`.

## Adding physics

1. Write a pure function in `src/model/` (no DOM, no hidden state, units in names).
2. Write a test in `test/`. Where a closed form exists, cross-check it against a brute-force calculation (see the view-factor tests, which integrate numerically). A test that restates the formula proves nothing.
3. Keep the validation anchors green: ISS 70 kW on 475 m² within 3 %, view factors within 0.002 of numerical integration, ISS orbit period and eclipse, the GPU stack, and the Starmind check. If a change moves an anchor, say so in the pull request and justify it.
4. State the new assumption's provenance (above), and update `docs/APPROACH.md` (equation, limitation lifted or added, roadmap).
5. If it adds an input, add it to `PARAMETERS` in `scenarios.ts` with a range its defaults fit (a test checks every default against its slider), add validation in `scenarioIO.ts`, and add a plain-language explanation in `src/model/glossary.ts`: what it is physically, how it enters the model, which way it pushes the results. A test fails if any input lacks one; the page shows it in the Assumptions table and the CLI prints it with `--explain`.

## Adding presets

Add an entry to `ENVIRONMENTS` or `HEAT_SOURCES` in `src/model/scenarios.ts`; the page and the CLI pick it up automatically (`bun run analyze --list`). A new entry in `MODES` also needs its id added to `ModeId` in `src/model/types.ts` and a colour in `MODE_COLORS` in `src/ui/app.ts` (the type check fails until both are done). Every number in it needs a note. Use the preset ids in commands, share strings and tests, and do not rename an id that has been published: share strings record preset ids, so renaming breaks old links.

## Wanted: more reference cases

Starmind is the only commercial design in the model because SpaceX has published the most about it. Other designs deserve the same treatment. Representative cases are wanted for, for example:

- Starcloud
- Sophia Space
- Cowboy Space (formerly Aetherflux)
- Relativity Space
- Blue Origin's Project Sunrise
- Google's Project Suncatcher
- Axiom Space
- anyone else with published figures (filings, papers, company statements)

What a case needs:

1. A primary source for each number you take from the company: an FCC or other regulatory filing, a paper, a datasheet, or the company's own published statement. Press coverage is `SECONDARY` until checked against one of those.
2. Every value the company has not published labelled `ASSUMPTION`, with your reasoning. A case can be mostly assumptions; it just has to say so.
3. A `reported` block if the company has published a radiator area or a power-per-mass figure, so the page can run the same "what would the reported area require" check it runs for Starmind.
4. A summary that states plainly which figures are reported and which are assumed.

The comparison charts draw every reference case, and two palette slots (`--s5`, `--s6`) are free, so two more cases fit as things stand. Past that, the comparison needs a design change; open an issue first. If you have numbers but not code, open a "Challenge an assumption" issue with the figures and sources and say they are for a new case.

## Changing the export or share formats

- **Scenario file** (`watts-to-space/scenario`): bump `SCENARIO_VERSION` in `scenarioIO.ts` when the meaning or required shape of the file changes. `importScenario` currently accepts only the current version, so a bump needs a migration from every older version you want to keep reading, plus a test with a pinned old file.
- **Share string** (`w2s1.<payload>.<check>`): bump the prefix (to `w2s2`) only when the meaning of an encoded field changes. Adding a new optional field that older builds would reject as unknown does not change meaning but does break old builds; say so. When you bump, keep a decoder for every earlier prefix so links already posted still open, and add a test that decodes a pinned old link (for example `w2s1.eyJtIjoiaXNzIn0.0d9e1f64`, the ISS reference case). Share strings hold preset ids and differences only, so correcting a preset value changes what an old link evaluates to; mention that in the pull request.
- The checksum is for accidental damage only. Do not describe it as a signature.
- Share strings must stay parameters-only: no personal data.

## UI rules

- **No runtime dependencies.** `package.json` has dev dependencies only (TypeScript and Bun types). Charts are hand-written SVG.
- **The chart palette is validated.** The six categorical slots `--s1` to `--s6` in `styles.css` (and their dark-mode values) must not change; they passed adjacent-pair checks in light and dark mode. Do not reorder or substitute them.
- **Accessibility.** Keyboard operable controls, visible focus, text alternatives and hover values for charts, and colour never the only carrier of meaning. Where a slot is below 3:1 contrast on the surface, add direct labels or values.
- **Log and linear.** Every log-scale chart keeps its Log / Linear switch so a log axis never hides how big a difference is.
- Page copy follows the terminology rules below.

## Terminology

- Always say "solar array". Never use a bare "array" for hardware, and never call the radiator an array: it is a "radiator" or "radiator panel".
- Never use the word "radiation" alone (readers read it as ionizing dose). Say "thermal emission", "radiates" or "Stefan–Boltzmann". This applies to code comments, documentation, notes and page text. (File and function names that already exist may stay.)
- Units belong in names (`_K`, `_W`, `_m2`) and in every number you write.

## Pull-request checklist

- [ ] `bun test` passes (include new tests for new behavior).
- [ ] `bun x tsc --noEmit` passes.
- [ ] `bun run build` and `bun run build:standalone` both succeed.
- [ ] Every new or changed number has a provenance note; every new source was opened and checked. (The provenance test checks only that each note carries a tag or a known source id. Whether the source supports the number is the reviewer's job.)
- [ ] Validation anchors still pass, or the pull request says which moved and why.
- [ ] For any model change, the description has **before and after numbers** from `bun run analyze` (for example `--compare`, or the mode you changed), as a small table.
- [ ] Terminology rules followed.
- [ ] No new runtime dependency; palette untouched.
- [ ] Docs updated: `docs/APPROACH.md` for model changes, the skill references if a CLI option changed.
- [ ] Format changes follow the rules above (version bump, old links still decode).
- [ ] `CHANGELOG.md` has an entry, and `package.json` carries the new version (the changelog says when a change is a patch, minor or major).

## Good first issues

- **Undocumented assumptions.** The page flags them in its Assumptions table, and `bun run analyze --explain all` lists them under `parametersWithoutNote`. Replacing one with a sourced value (or an honest `ASSUMPTION` note) is the most useful first contribution. At the time of writing, for example, only the ISS mode documents `radiator.emissivity`; the other modes do not.
- **Roadmap.** [docs/APPROACH.md](docs/APPROACH.md) section 8 lists the next pieces of physics in suggested order (heat pumps, fission power for lunar night, hot and cold cases, lunar radiator geometries, time-stepped simulation, more calibration anchors).
- **More calibration anchors.** The ISS margin is fitted to a single published rating; a second flight radiator or solar array with published figures would help.

## Reporting a wrong number

Use the **Challenge an assumption** button on the page, or the "Challenge this value" link on any row of its Assumptions table, which fills in the scenario and the value for you. The form asks for:

1. The scenario: a share link or string, or the exact `bun run analyze ...` command (from `--share-out`).
2. The value or claim you dispute, and what it should be.
3. Your source (link, page or table), or say it is your own estimate and how you got it.

You don't need to say whether the problem is the physics, an equation or an assumption; that's for the maintainers to work out.

If you have a better number with a source, a pull request is better still: change the value, replace its note with your `[source-id]` text, add the source to `SOURCES`, and include before and after results. Please be specific and polite; the maintainer would rather be corrected than be wrong.

Questions about the project can go in an issue as well.
