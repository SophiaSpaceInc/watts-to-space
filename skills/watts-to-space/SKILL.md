---
name: watts-to-space
description: Analyze, share, improve and teach the watts-to-space model of power and heat-rejection hardware in space (radiator area, solar array area, battery and mass budgets for orbital data centers, cislunar industry and lunar-surface work). Use when the user asks about heat rejection or radiators in space, orbital data centers, solar array and battery sizing, cislunar or lunar thermal design, why chips running hotter shrinks a radiator, wants to be walked through or taught the subject ("walk me through", "teach me", "explain from first principles"), shares a watts-to-space link or w2s1 string to analyze, wants a link to post a scenario, or wants to contribute a better number or new physics to the model.
---

# watts-to-space

An open-source, auditable model of the power and heat-rejection hardware behind energy-hungry work in vacuum. Repo: `github.com/interplanetarychris/watts-to-space` (pure TypeScript, Bun, zero runtime dependencies). The analysis CLI runs exactly the model the web page runs.

This skill does four jobs. Pick the one the user asked for:

1. **Run analyses** (this file, section 1; options in `references/cli.md`)
2. **Share scenarios** (section 2; detail in `references/sharing.md`)
3. **Improve the model** (section 3; the full rules are in `CONTRIBUTING.md`)
4. **Tutor** (section 4; lessons in `references/curriculum.md`)

Other references: `references/model-map.md` (which file and function owns each equation), `docs/APPROACH.md` (equations, validation anchors, Limitations, roadmap).

## 0. Setup and ground rules

```text
git clone https://github.com/interplanetarychris/watts-to-space
cd watts-to-space
bun install        # needs bun >= 1.4; dev dependencies only
bun test           # sanity check: all tests should pass
```

If the repo is already cloned, run commands from its root. Never start a dev server (`bun run dev`) yourself: ask the user to start it. The CLI needs no server.

Rules that hold in every answer:

- **Run the model; do not recall numbers.** Every figure you state comes from a command you ran in this session, or from a cited line of `docs/APPROACH.md`.
- **Keep three things separate and label them:** *physics* (Stefan–Boltzmann, energy balance), *model output* (what the CLI printed), *assumption* (a choice in the preset; check its provenance).
- **Cite provenance** with `bun run analyze --explain <path>`. If it says `documented: false`, say the assumption is undocumented. Never invent a source, a number or a URL.
- **Always give units** (m², kg, K, W/m², kg/kW).
- **Every number travels with its conditions.** State the mode, location (altitude and β, or the surface site), heat load and source temperature limit behind any figure you quote; numbers get lifted out of context. Example: not "no eclipse above 66°" but "no eclipse above β ≈ 66° for a circular orbit at 600 km (it is ≈ 70° at 420 km and ≈ 50° at 2,000 km)".
- **Name the relevant limitation** from `docs/APPROACH.md` section 7 when the answer depends on one (steady state, infinite lunar plain, no heat pumps, single calibration point...).
- **Terminology.** Say "solar array" (never a bare "array" for hardware). The radiator is a "radiator" or "radiator panel", never an array. Never write "radiation" alone: say "thermal emission", "radiates" or "Stefan–Boltzmann" (a bare "radiation" reads as ionizing dose).

## 1. Running analyses

All commands run from the repo root. Output is JSON by default (for you); add `--format table` for something to show a human. Invalid input exits with code 2 and lists every problem. The full option list is in `references/cli.md`.

### The model in one paragraph

Three parts joined by three quantities. **Heat path** (heat source + coolant loop) produces the coolant temperature T. **Radiator** (surface properties, orientation, sizing margin) at a location converts T into net heat rejected per m² and so into radiator area. **Power supply** (cells, bus, battery) at a location produces solar array area and battery mass. The heat load Q and the location are shared by the radiator and the power supply.

### Discover what exists

```text
bun run analyze --list
```

Gives modes (`iss`, `starmind`, `ideal`, `physics`), heat-source ids, environment ids and every tunable parameter with its path, unit (stored unit: watts, not kilowatts), slider range, part and group.

Environment ids: `iss-leo`, `leo-600`, `llo-100`, `cislunar-deep`, `moon-equator`, `moon-polar`. Heat-source ids: `gpu-lidded`, `gpu-direct-die`, `isothermal-limit`, `process-600K`.

### Recipes

**Radiator size for X kW.** The load input is `heatSource.totalPower_W` (payload watts; the bus adds conversion loss and overhead, so heat to reject is larger).

```text
bun run analyze --mode starmind --set heatSource.totalPower_W=500000
```

Real output (trimmed): `heatToReject_W` 546316, `radiatorArea_m2` 642.936, `solarArrayArea_m2` 1544.67, `solarArrayToRadiatorAreaRatio` 2.40252, total mass 9741.49 kg, 19.483 kg/kW. Starmind mode is LEO 600 km with an Earth-style lidded GPU stack.

**What if the chips run hotter?** Sweep the source temperature limit.

```text
bun run analyze --mode starmind --sweep heatSource.maxTemperature_K=340:400:20 --metric radiatorArea_m2 --format table
```

Real output: 513.64 m² at 340 K, 383.29 at 360 K, 293.59 at 380 K, 229.6 at 400 K. Radiator area never increases with a higher limit: hotter coolant radiates more per m² (T⁴). The model assumes the chips tolerate it; the limit is an ASSUMPTION (check with `--explain heatSource.maxTemperature_K`).

**Which input matters most?**

```text
bun run analyze --mode starmind --tornado --format table
```

Real output, top rows for total mass: radiator areal density ±7.9 % (for a ±20 % step), solar array areal density ±6.3 %, source temperature limit ±10 K gives +5.7 % (colder) and −4.8 % (hotter), average-load fraction ±0.1 gives ±4.5 %, cell efficiency ±10 % gives +3.5 % (lower) and −2.9 % (higher). Each row perturbs one input by its own step (listed in `--list` as the tornado step) and holds the rest. Use `--metric radiatorArea_m2` to rank for radiator area instead.

**LEO vs cislunar vs the lunar surface.** Same hardware, different location:

```text
bun run analyze --mode starmind --environment moon-equator --format table
bun run analyze --mode starmind --environment cislunar-deep --format table
```

Real results for the Starmind hardware (radiator m² / solar array m² / battery kg): `iss-leo` 329.5 / 1303.4 / 2547; `leo-600` 321.5 / 772.3 / 0; `llo-100` 339.1 / 1319.3 / 3291; `cislunar-deep` 290.8 / 772.3 / 0; `moon-equator` 15,076 / 1611.8 / 1,505,720; `moon-polar` 322.3 / 920.5 / 451,716. The lunar equator at noon rejects only 22.6 W/m² per panel with a vertical fin, and the 14-day night makes the battery 94 % of mass (the CLI's warning says so). See `references/curriculum.md` lesson 3.

**Compare the four reference modes** (add `--environment` or `--heat-source` to apply to all four):

```text
bun run analyze --compare --format table
```

Real output rows (radiator m²): `iss` 2002.2, `starmind` 321.47, `ideal` 198.19, `physics` 121.66. Note `iss` defaults to LEO 420 km, the others to LEO 600 km, unless you pass `--environment`.

**Check a reported radiator area.** Modes with a published figure carry a `reportedCheck`. Starmind reported 160 m² (250 kW peak / 175 kW average, 75 kW per ton, LEO 600 km):

```text
bun run analyze --mode starmind
```

`reportedCheck` (real, `leo-600`, β 70): 160 m² must reject 1707.24 W/m² at the 250 kW peak load (1195.07 W/m² at the 175 kW average load, `targetAverage_W_m2`), so the radiating fluid must be 375.139 K (345.379 K at average load, `requiredFluidAverage_K`); the model's coolant is 336.242 K; `budgetLeft_K` is -2.13947 K: at peak load the reported area needs a radiating fluid hotter than the 373 K source limit, so no heat path could meet it at that limit, and the lidded stack alone drops `modelChainDrop_K` 36.7575 K. The vehicle line: the published 75 kW per ton implies `vehicleMass_kg` 3333.33 kg, and the model's power and thermal hardware (total 4870.75 kg) is `powerThermalShareOfVehicle` 1.46122, about 146 % of it. Reading: the reported figures are not consistent with an Earth-style lidded package at a 373 K limit, or the figures describe different things (peak versus average load, area counted differently). It is a consistency check, not proof the report is wrong.

**Any scenario from a file or link.**

```text
bun run analyze --scenario my.json
bun run analyze --share 'w2s1....'
```

### Reading the summary

| Field | Meaning |
|---|---|
| `payloadPeak_W`, `payloadAverage_W` | Payload at peak and averaged over time (`heatSource.averageFraction` times peak). |
| `heatToReject_W`, `busLoadAverage_W` | Bus load at peak, which sizes the radiator, and averaged, which sizes the solar array and battery. Every delivered watt becomes heat. |
| `radiatorArea_m2` | Panel area (planform) including the sizing margin. A string `"Infinity"` means the environment heats the radiator faster than it radiates at that temperature. |
| `solarArrayArea_m2`, `solarArrayToRadiatorAreaRatio` | Solar array sized for the average load plus battery recharge. Ratio above 1 means the solar array, not the radiator, is the bigger structure. |
| `mass_kg` | radiator, thermalLoop (pumps and joints), solarArray, battery, harness, total. |
| `specificMass_kg_per_kW` | Total power-and-thermal mass per kW of payload. |
| `temperatures_K` | `sourceLimit`, `sourceActual`, `coolantHot`, `radiatorIn/Out`, `radiatingEffective` (T⁴-mean of the coolant glide), `radiatingAfterFin`. |
| `sourceStackDrop_K`, `chain` | The temperature staircase from source to radiator; the "first centimetre". |
| `netFlux_W_m2` | Net heat rejected per m² of panel after what the radiator absorbs. |
| `rejectionEffectiveness` | Net flux relative to a perfect two-sided black panel at the source limit in deep space. Below 1 by design; negative means a net loss. |
| `sunlight` | Sunlit fraction and cycle period (hours) that size storage. |
| `warnings` | `error`, `warn`, `info`. Always relay these. |
| `changes` | Inputs changed from the preset combination, as `{path, from, to}`. |

Numbers are printed to 6 significant digits. Report fewer: the model is first-order.

## 2. Sharing scenarios publicly

Produce a link to post in a thread, paper or issue:

```text
bun run analyze --mode ideal --environment moon-polar --set heatSource.totalPower_W=100000 --set radiator.emissivity=0.85 --share-out --format table
```

Real output: a share string `w2s1.eyJtIjoiaWRlYWwi...e8363f42`, the link `https://watts-to-space.chrislewicki.com/?s=<share string>`, a suggested one-line post, and the list of changes. (That is the public page. The string also works with the CLI, and the page can be opened offline from `dist-standalone/index.html` after `bun run build:standalone`.) Use `--base-url` for a different host.

**Open a link someone posted:** `bun run analyze --share '<w2s1 string or the whole URL>'`. Quote it; the string can contain characters the shell dislikes. The user can also paste the URL into a browser.

**Files:** `bun run analyze ... --export > scenario.json` writes the page's export format (`watts-to-space/scenario`, version 1); `--scenario scenario.json` reads it back. Files carry the whole scenario and provenance notes; share strings carry only the differences from presets.

**What a share string contains:** the mode, preset ids and the inputs that differ from those presets. Nothing personal: no name, no account, no file path, no timestamp. It is parameters only. Decoding rebuilds the presets and re-runs full validation, so a link is exactly as trustworthy as an imported file.

**Integrity check:** the last segment is an FNV-1a checksum of the payload. It catches truncated or mangled links (the CLI then exits 2 with "checksum mismatch"). It is **not a signature**: anyone can edit a payload and recompute it. Never present a link as proof of who made it.

**Versioning:** `w2s1` is format and version. If the meaning of an encoded field ever changes, the prefix is bumped, and the decoder says which prefix it reads. Old links stay decodable only if the maintainers keep old decoders (see CONTRIBUTING.md).

**Posting convention.** Post the link plus one line saying what changed and what it shows. `--share-out --format table` prints that line ("Suggested post") and the changes. Example shape:

```text
Moon polar ridge, 100 kW payload, emissivity 0.85 instead of 0.92: radiator 86 m², solar array 268 m², 40 t.
https://watts-to-space.chrislewicki.com/?s=w2s1....
```

State the mode if the reader needs it, and keep numbers consistent with the link. Details: `references/sharing.md`.

## 3. Improving the model

Read `CONTRIBUTING.md` before touching `src/`. The rules an agent must follow:

1. **Provenance on every number.** Notes in `src/model/scenarios.ts` carry `[source-id]`, `ASSUMPTION`, `CALIBRATED` or `SECONDARY`. A new source id needs an entry in `SOURCES` with a real title and URL you have actually opened. A test fails on untagged notes or unknown ids.
2. **Constants vs assumptions.** Only measured or defined quantities go in `src/model/constants.ts`.
3. **New physics = pure function in `src/model/` plus a test.** Where a closed form exists, cross-check it against a brute-force calculation (see the view-factor tests).
4. **Validation anchors stay green** (ISS 70 kW on 475 m², view factors, ISS orbit, GPU stack). If a change moves an anchor, say so and justify it.
5. **Terminology rules** (above) apply to code comments, docs and UI text.
6. **No runtime dependencies.** The UI palette `--s1`...`--s6` in `styles.css` must not change.
7. **Before/after numbers** in the pull request for every model change, from `bun run analyze`.
8. Run `bun test`, `bun x tsc --noEmit`, `bun run build`, `bun run build:standalone`.

**Turning a user's better number into a pull request.** The user says "the emissivity of that coating is 0.85, not 0.92".

1. Get the source: a link or citation the user can show. No source means it stays an `ASSUMPTION`; say so rather than guessing a citation.
2. Find the current value and note: `bun run analyze --mode <m> --explain radiator.emissivity`.
3. Record before numbers: `bun run analyze --mode <m> > before.json` (in a scratch location outside the repo).
4. Edit the value in the mode in `src/model/scenarios.ts`, replace the note with `[new-source-id] ...` text, add the source to `SOURCES` (title, URL).
5. Run the tests. If an anchor moves, stop and explain.
6. Record after numbers, and write the PR body: what changed, the source, before/after table, tests run.
7. The user opens the pull request (or you do, if they ask and git is set up). Contributions are licensed as the repo is: code MIT, text and figures CC BY 4.0 (`LICENSE`, `LICENSE-CONTENT.md`).

The page's Assumptions table flags undocumented assumptions; `--explain all` lists `parametersWithoutNote`. Replacing those with sourced values is the best first contribution.

## 4. Tutor mode

When the user wants to learn ("walk me through", "teach me", "why is heat rejection the limit"), load `references/curriculum.md` and teach lesson by lesson. Use the model as a lab bench: run a command with the user, show the output, ask what they notice.

- One question at a time. Let the learner answer before you explain (Socratic).
- Ask where they are starting from, then start at the matching lesson; do not lecture all six.
- Every number comes from a command you just ran; cite provenance with `--explain`.
- Separate physics, model output and assumption out loud ("physics says T⁴; the model's 0.92 emissivity is the ISS paint's beginning-of-life value").
- Name the limitation that matters (the curriculum names one per lesson).
- Close each lesson with its takeaway and offer the next one or a what-if.

Lessons: 0 every watt becomes heat; 1 the heat path and the first centimetre; 2 the radiator and what it sees; 3 the power supply and darkness; 4 putting it together; 5 the reference cases as case studies.
