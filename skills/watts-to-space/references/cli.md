# CLI reference: `bun run analyze`

`scripts/analyze.ts`, run as `bun run analyze <options>` from the repo root (needs `bun` >= 1.4, and `bun install` once). Same model as the web page. Output is JSON by default. Numbers are rounded to 6 significant digits; non-finite values appear as the strings `"Infinity"` or `"NaN"` (JSON has no such numbers). `Infinity` radiator area means the radiator cannot reject heat at that temperature in that environment.

Exit codes: `0` ok; `2` invalid input. On exit 2 the output is `{"error":"invalid input","problems":[...]}` on stderr, and it lists every problem that was found in that stage.

## Selecting a scenario

Combinable; `--set` is applied last.

| Option | Meaning |
|---|---|
| `--mode <id>` | Reference mode: `iss`, `starmind` (default), `ideal`, `physics`. |
| `--heat-source <id>` | `gpu-lidded`, `gpu-direct-die`, `isothermal-limit`, `process-600K`. Swapping also switches to the coolant that suits that source. |
| `--environment <id>` | `iss-leo`, `leo-600`, `llo-100`, `cislunar-deep`, `moon-equator`, `moon-polar`. |
| `--scenario <file.json>` | An exported scenario (the page's Export, or `--export`). Cannot be combined with `--mode`, `--heat-source`, `--environment` or `--share`. |
| `--share <string-or-URL>` | A `w2s1.` share string, or any URL containing `?s=`. Same exclusions as `--scenario`. |
| `--set <path>=<value>` | Override one input; repeatable. Numbers parse as numbers, everything else as strings (`loop.coolant=ammonia`, `radiator.orientation=zenithOnly`). `null` clears `loop.coolantCap_K`. Values are in stored units (watts, kelvin, kg/m²), never the page's scaled display (the page shows kW, the path takes W). |

The path must already exist in the scenario and keep its type. Every resulting scenario goes through `validateScenario` (type and physical-range checks).

Paths come from `--list`. Coolants: `water`, `ammonia`, `nak78`, `twoPhaseAmmonia`. Orientations: `edgeOn`, `nadirZenith`, `zenithOnly`. To change a stage of the heat-source stack use an index: `heatSource.stages.2.thickness_m=0.004` (`--explain all` and `--export` show the stages).

## Actions (choose at most one)

| Option | Output |
|---|---|
| (none) | Summary: see the field table in SKILL.md. Keys: `scenario`, `feasible`, `payloadPeak_W`, `payloadAverage_W`, `heatToReject_W`, `busLoadAverage_W`, `radiatorArea_m2`, `solarArrayArea_m2`, `solarArrayToRadiatorAreaRatio`, `mass_kg` (+`total`), `specificMass_kg_per_kW`, `temperatures_K`, `sourceStackDrop_K`, `chain`, `netFlux_W_m2`, `rejectionEffectiveness`, `sunlight`, `warnings`, `notices`, `reportedCheck`, `presetChangesFromModeDefault`, `changes`. |
| `--list` | Modes, heat sources, environments, parameters (`path`, `label`, `unit`, `min`, `max`, `part`, `group`; `pageShowsAs` appears where the page scales the unit, e.g. watts shown as kW). |
| `--sweep <path>=<start>:<end>:<step>` | Repeatable. Evaluates every value (each must pass validation; at most 2000 points). Points carry the swept value and each metric. Path must be a numeric input. |
| `--metric <path>` | Repeatable, with `--sweep` or `--tornado`. A dot-path into the **result object** (not the summary): `radiatorArea_m2`, `solarArrayArea_m2`, `totalMass_kg`, `specificMass_kg_per_kW`, `solarToRadiatorAreaRatio`, `netFlux_W_m2`, `rejectionEffectiveness`, `mass_kg.battery`, `mass_kg.radiator`, `chain.stackDrop_K`, `chain.coolantHot_K`, `chain.fluidEffective_K`. Sweep default: `radiatorArea_m2`, `solarArrayArea_m2`, `totalMass_kg`. Tornado default: `totalMass_kg`. |
| `--tornado` | One-at-a-time sensitivity: each tunable input with a tornado step (see `PARAMETERS`) moves down and up, and the output gives % change of the metric, sorted by largest swing. Inputs not relevant to the environment are omitted. |
| `--compare` | The four reference modes side by side. `--heat-source`, `--environment` and `--set` apply to all four; `--mode`, `--scenario` and `--share` are errors. |
| `--explain <path>` | Value, stored unit, slider range, part, `explanation` (what the input means physically, from `src/model/glossary.ts`; use it when teaching), provenance note, tags (`ASSUMPTION`, `CALIBRATED`, `SECONDARY`, `[source-id]`), resolved source titles and URLs. `documented: false` and a warning when no note exists. A note on a parent path (e.g. `heatSource.stages`) applies to its children; `noteAppliesTo` says which. |
| `--explain all` | Every note in the scenario, plus `parametersWithoutNote`: tunable inputs with no provenance. |
| `--share-out [--base-url <url>]` | `share`, `url`, `headline` (one-line suggested post), `changes`. Default base: `https://watts-to-space.chrislewicki.com/`. Any existing query or hash on the base is dropped. |
| `--export` | The scenario as an exported JSON file (`watts-to-space/scenario`, version 1). Redirect to a file. |

## Output format

`bun run` echoes a `$ bun scripts/analyze.ts ...` line on stderr; stdout is clean JSON. `bun run --silent analyze` suppresses the echo.

`--format json` (default) or `--format table`. Table output is for people; do not parse it.
`--help` prints the option summary.

## Programmatic use

`scripts/analyze.ts` exports `run(argv: string[]): { stdout: string; code: number }`; the tests call it directly.

## Examples (real output, trimmed)

```text
bun run analyze --mode iss --explain radiator.sizingMargin
```

```json
{
  "path": "radiator.sizingMargin",
  "value": 1.8,
  "unit": "×",
  "sliderRange": { "min": 1, "max": 2.5, "step": 0.05 },
  "note": "CALIBRATED (1.80): makes this model reproduce the EATCS 70 kW rating on 6 radiator ORUs of 23.3 m × 3.4 m (475 m²) [nasa-atcs]. ...",
  "tags": ["CALIBRATED", "[nasa-atcs]"],
  "sources": [{ "id": "nasa-atcs", "url": "https://www.nasa.gov/pdf/473486main_iss_atcs_overview.pdf" }],
  "documented": true
}
```

```text
bun run analyze --set radiator.emissivity=7 --set radiator.nonsense=1
```

Output (exit 2): the unknown field is reported at once (`--set radiator.nonsense: no such field...`); fix and re-run to see the range problem (`radiator.emissivity = 7 is outside (0, 1]`).
