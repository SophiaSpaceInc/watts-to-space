# watts-to-space

**Heat rejection in vacuum.** Live at **https://watts-to-space.chrislewicki.com** · by [Chris Lewicki](https://chrislewicki.com)

An interactive explorer of the **power and heat-rejection hardware** for energy-hungry work in
vacuum: orbital compute, cislunar industry, and (first-order) the lunar surface.

In space every watt you use becomes heat, and the only way out is radiation. This project
follows that energy from the solar array, through the payload, down the temperature
"staircase" of interfaces, to the radiator. It is built to teach the design realities:

- why moving heat is so much harder than moving electricity (no transformer for heat);
- why the first centimetre of the thermal path (die, interface materials, cold plate)
  matters more than the next ten metres;
- how radiator flux scales as T⁴, so hot waste heat is cheap and warm chips are expensive;
- how the environment (Earth or Moon in view, sunlit regolith, eclipses, lunar night)
  changes the answer;
- what dominates mass: radiators, solar arrays, or energy storage.

## Use it with your AI agent

Point Grok, or any coding agent (Claude Code, Codex, Cursor, ...), at [AGENTS.md](AGENTS.md).
A chat assistant such as Grok can read the repo and tutor you from the model's documented
assumptions. A coding agent can also clone it, run the model from the command line, make a link
you can post, and help you contribute a better number with its source. Copy-paste one of these
into your agent:

Learn:

```text
Read https://github.com/interplanetarychris/watts-to-space, start with AGENTS.md, and walk me
through why heat rejection limits data centers in orbit. Ask me questions one at a time. If you
can run code, clone the repo and run the model as we go.
```

Analyze:

```text
Clone https://github.com/interplanetarychris/watts-to-space, read AGENTS.md, and size the
radiator and solar array for a 500 kW orbital data center in LEO, then show me what changes
if the chips can run 30 K hotter. Say which assumptions you are relying on and where each
one comes from.
```

Open a shared scenario:

```text
Clone https://github.com/interplanetarychris/watts-to-space, read AGENTS.md, and analyze
this share link: <paste the link or the w2s1... string>. Tell me what was changed from the
reference case and what it implies.
```

Contribute:

```text
Clone https://github.com/interplanetarychris/watts-to-space, read AGENTS.md and
CONTRIBUTING.md. I have a better number for one of the assumptions: <value, unit, and the
source>. Check what the model uses now, show the before and after results, and prepare a
pull request that cites my source.
```

The command line the agent uses is also yours: `bun run analyze --help`. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to improve the model, and
[skills/watts-to-space/SKILL.md](skills/watts-to-space/SKILL.md) for what the agent is told.

## Relation to McCalip's model

Andrew McCalip's [Space Datacenters](https://andrewmccalip.com/space-datacenters)
([source](https://github.com/andrewmccalip/thoughts)) asks an **economic** question: can
orbital compute match the cost per watt of gas-fired terrestrial compute? Thermal is one
pass/fail check inside it (an integrated PV/radiator panel, a fixed 10 K die-to-radiator
drop).

This project asks the **hardware** question underneath: what must the heat and power
system look like, and which assumptions move it? The two are complementary. Our outputs
(radiator and solar array area, power-and-thermal mass per kW) are natural inputs to a cost model
like his. One concrete difference: his model floors an edge-on panel's Earth view factor at
5 % of nadir (≈0.04 at 550 km); the exact value is ≈0.26 (see
`src/model/viewFactor.ts` and the test that integrates it numerically).

## Quick start

Requires [Bun](https://bun.sh) ≥ 1.4 (for `build:standalone`; the rest runs on 1.3).

```sh
bun install            # TypeScript + Bun type definitions (dev only)
bun run dev            # serves index.html with on-the-fly TypeScript bundling
bun test               # unit tests (bun:test)
bun run typecheck      # tsc --noEmit, strict
bun run analyze --help # command-line analysis: the same model, JSON out (see the agent section)
bun run build          # static site in dist/ (serve it with any static server)
bun run build:standalone  # one self-contained HTML file in dist-standalone/
```

`dist-standalone/index.html` has the script and styles inlined. It opens straight from
disk (double-click, email, attach it to a ticket). The unbuilt `index.html` loads
TypeScript modules, so use `bun run dev` for it.

## Modes, environments, heat sources

The **mode switch** installs a whole assumption set; the selectors then swap parts of it.

| Mode | What it represents |
|---|---|
| ISS heritage | Flight-proven ISS architecture: water loop at crew-friendly temperatures, intermediate heat exchanger, single-phase ammonia radiators, silicon solar arrays, 124 V bus. Radiator sizing is **calibrated** to the ISS EATCS rating (70 kW on 475 m²). |
| SpaceX Starmind (reported) | Reported AI1 figures (150 kW peak, 110 m² radiators, ~600 km) with an Earth-style lidded Rubin-class package. A "reality check" panel backs out what the reported radiator area implies. |
| Ideal engineering | Best plausible near-term choices: direct-die two-phase cooling, a single isothermal loop, optical-solar-reflector coatings, multi-junction cells, light radiators. |
| Limited by physics | Only physics binds: radiator at the source temperature, black surfaces, perfect fins, detailed-balance solar cells. Areal densities are placeholders (no physical floor exists). |

**Page structure.** The model splits into three nearly independent parts, joined by only
three quantities (`assets/system-diagram.svg`):

| Part | Inputs | Output |
|---|---|---|
| Heat path | heat source, temperature limit, power per package, coolant loop | coolant temperature T |
| Radiator | ε, α, fin efficiency, orientation, sizing margin, areal density | heat rejected per m² at T → radiator area |
| Power supply | cells, bus voltage, battery | solar array area, battery mass |

The heat load Q and the location are shared: both feed the radiator and the power supply.
The page follows the same split: shared inputs at the top, then one section per part with
its inputs beside its charts, then results that combine everything. In code,
`evaluateScenario` composes `evaluateChain` (heat path), `netRejectionPerPanelArea`
(radiator) and `sizePowerSupply` (power supply).

Pick a reference case and it is shown as published, with the other three drawn faint for
context. Change anything and the page says so ("Modified", with the list of changes). The
comparison charts then show your scenario as the strong line, with the reference case's
published version dashed beside it. **Reset to reference** undoes everything.

Every log-scale chart has a **Log / Linear** switch, so a log axis never hides how big a
difference really is. Every parameter can be dragged or typed; typed values are clamped to
the slider range.

**Export assumptions** downloads the whole scenario as JSON (`watts-to-space/scenario`,
version 1). **Import assumptions** loads one back. Imports are validated field by field
(type and physical range), and every problem is listed if a file is rejected. Use it to
share a case, keep a design log, or diff two assumption sets.

Environments: LEO 420 km (ISS-like), LEO 600 km terminator-like, low lunar orbit, cislunar
deep space (NRHO / L-points), lunar equator at noon, lunar polar ridge.
Heat sources: lidded GPU, direct-die GPU, isothermal limit, 600 K industrial process.

## Layout

```
src/model/            pure, DOM-free physics; every function unit-testable
  types.ts            the Scenario data shape (units in field names)
  constants.ts        measured/defined constants only, each with a source
  thermalEmission.ts  Stefan–Boltzmann, T⁴-mean glide, fin efficiency, inverse solve
  viewFactor.ts       plate-to-sphere view factors (nadir, edge-on), plate-to-plane
  orbit.ts            period, eclipse fraction, albedo geometry
  environment.ts      absorbed flux per radiator face; sunlight for storage sizing
  thermalChain.ts     the temperature staircase (stages, loop, fin)
  power.ts            solar array specific power, storage sizing, harness loss
  system.ts           whole-system energy balance → areas, masses, warnings
  sensitivity.ts      sweeps and tornado (one-at-a-time) sensitivities
  scenarioIO.ts       JSON export/import with validation; diff against the reference case
  glossary.ts         plain-language explanation of every input (page, CLI and skill use it)
  transport.ts        electricity vs heat over distance; Wiedemann–Franz equivalence
  scenarios.ts        modes, environments, heat sources, sources, slider metadata
src/ui/               charts.ts (dependency-free SVG) and app.ts (page wiring)
test/                 physics and system tests, including validation anchors
docs/APPROACH.md      equations, assumptions, validation, limitations, roadmap
```

## Contributing

- **Every number needs provenance.** Notes in `scenarios.ts` are tagged `[source-id]`,
  `ASSUMPTION`, `CALIBRATED` or `SECONDARY`. A test fails on an untagged note or an unknown
  source id. The page lists every tunable parameter and flags undocumented ones; replacing
  those with sourced values is the most useful first contribution.
- **Constants vs assumptions.** Only measured or defined quantities go in `constants.ts`.
- **New physics** goes in `src/model/` as a pure function with a test. If a closed form
  exists, test it against a brute-force calculation (see the view-factor tests).
- **New presets**: add an entry to `MODES`, `ENVIRONMENTS` or `HEAT_SOURCES`. The UI picks
  it up automatically.
- Keep `bun test` and `bun run typecheck` green.

See [docs/APPROACH.md](docs/APPROACH.md) for the model and its known gaps.

## License

Code: [MIT](LICENSE). Written content and figures (docs, explanations, diagrams and the charts the page produces): [CC BY 4.0](LICENSE-CONTENT.md). Please credit "Chris Lewicki, watts-to-space (github.com/interplanetarychris/watts-to-space), CC BY 4.0".
