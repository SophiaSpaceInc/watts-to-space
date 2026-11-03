# Model map: where each idea lives

Read `docs/APPROACH.md` for the equations in prose. This file tells you which file and function to open.

## Three parts, three joins

| Part | What it computes | Entry point | Files |
|---|---|---|---|
| Heat path | Coolant temperature T from the source limit, minus every drop | `evaluateChain(source, loop, finEfficiency)` in `thermalChain.ts` | `thermalChain.ts`, `thermalEmission.ts` (thermal emission: T⁴-mean, fin) |
| Radiator x location | Net heat rejected per m² of panel at T | `netRejectionPerPanelArea(fluid_K, surface, absorbedPerFace)` in `thermalEmission.ts`; faces and absorbed flux from `absorbedFluxPerFace` in `environment.ts` | `thermalEmission.ts`, `environment.ts`, `viewFactor.ts` |
| Power supply x location | Solar array area, battery mass, harness | `sizePowerSupply(load_W, power, sunlight)` in `power.ts`; sunlight from `sunlight(env)` in `environment.ts` | `power.ts`, `orbit.ts` |

Joins: coolant temperature T (heat path to radiator), heat load Q and location (shared by radiator and power supply). `evaluateScenario(s)` in `system.ts` composes the three and returns the `Result` the CLI and page show.

## Equations and their homes

| Idea | Where |
|---|---|
| Every delivered watt becomes heat (bus load) | `evaluateScenario` in `system.ts` |
| Stage temperature drop dT = Q R (conduction, interface, convection, lumped, fixed) | `stageResistance`, `stageDeltaT` in `thermalChain.ts` |
| Coolant glide to effective radiating temperature (T⁴-mean) | `t4MeanTemperature` in `thermalEmission.ts` |
| Fin efficiency as an equivalent temperature | `finEquivalentTemperature` in `thermalEmission.ts` |
| Stefan–Boltzmann emission | `emittedFlux` in `thermalEmission.ts`; `SIGMA`, `T_CMB_K` in `constants.ts` |
| Net rejection per panel area; inverse (fluid temperature for a target flux) | `netRejectionPerPanelArea`, `fluidTemperatureForRejection` |
| Perfect-panel reference for "effectiveness" | `idealRejectionPerPanelArea` |
| Plate-to-sphere view factors (nadir, edge-on) | `viewFactorFacing`, `viewFactorEdgeOn` in `viewFactor.ts`; vertical fin on lunar ground: `VIEW_FACTOR_VERTICAL_ON_PLANE` |
| What each radiator face sees per environment and orientation | `radiatorFaces`, `absorbedFluxPerFace` in `environment.ts` |
| Orbit period, eclipse fraction, albedo geometry | `circularPeriod_s`, `eclipseFraction`, `albedoGeometryFactor` in `orbit.ts` |
| Solar array specific power | `solarArraySpecificPower_W_m2` in `power.ts` |
| Storage over a light/dark cycle | `storageSizing` in `power.ts` |
| Harness copper sized for a loss target (mass ∝ 1/V²) | `harness` in `power.ts` |
| Electricity vs heat transport; Wiedemann–Franz; pump power | `transport.ts` |
| Reported-area check | `reportedCheck` in `system.ts` |
| Sweeps and tornado | `sweep`, `tornado`, `getPath`, `withPath` in `sensitivity.ts` |
| Export / import / validation / diff | `exportScenario`, `importScenario`, `validateScenario`, `diffScenario`, `changesFromMode` in `scenarioIO.ts` |
| Share strings | `encodeShare`, `decodeShare`, `SHARE_PREFIX` in `shareLink.ts` |

## Data

- `types.ts`: the `Scenario` shape; units are in field names.
- `scenarios.ts`: `MODES`, `HEAT_SOURCES`, `ENVIRONMENTS`, `PARAMETERS` (the tunable inputs: path, label, unit, range, part, group, tornado step), `SOURCES` (citations), `buildScenario(mode, {heatSource, environment})`. Provenance notes live here.
- `constants.ts`: measured or defined constants only, with coolant working ranges.

## Tests (`test/`)

- `physics.test.ts`: Stefan–Boltzmann, T⁴-mean, inverse solve, view factors against brute-force integration, orbit.
- `system.test.ts`: validation anchors (ISS 70 kW on 475 m², GPU stack), energy balance, storage, harness, Starmind check, lunar noon, ordering of modes, provenance hygiene.
- `scenarioIO.test.ts`, `shareLink.test.ts`: file and link round trips and rejection of bad input.
- `analyze.test.ts`: the CLI contract.

## The page

`src/ui/app.ts` wires the model to the page; `src/ui/charts.ts` is the dependency-free SVG chart code; `index.html` and `styles.css` are the shell. Editing the page is in scope only under the UI rules in `CONTRIBUTING.md`.
