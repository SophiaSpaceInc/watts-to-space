# watts-to-space

**Heat rejection in vacuum.**

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
  radiation.ts        Stefan–Boltzmann, T⁴-mean glide, fin efficiency, inverse solve
  viewFactor.ts       plate-to-sphere view factors (nadir, edge-on), plate-to-plane
  orbit.ts            period, eclipse fraction, albedo geometry
  environment.ts      absorbed flux per radiator face; sunlight for storage sizing
  thermalChain.ts     the temperature staircase (stages, loop, fin)
  power.ts            solar array specific power, storage sizing, harness loss
  system.ts           whole-system energy balance → areas, masses, warnings
  sensitivity.ts      sweeps and tornado (one-at-a-time) sensitivities
  scenarioIO.ts       JSON export/import with validation; diff against the reference case
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
