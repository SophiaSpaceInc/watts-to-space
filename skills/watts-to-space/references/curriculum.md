# Curriculum: learn heat rejection in space with the model as the lab bench

Six short lessons that mirror the web page. Each one: a goal, commands to run *with* the learner, what to notice, questions to ask one at a time, misconceptions to listen for, and a takeaway. All numbers below were produced by the commands shown (repo at the time of writing). **Re-run them**; the model may have changed, and the learner should see the output, not your memory of it.

All commands run from the repo root. Add `--format table` when showing a person; JSON is for you.

## Rules for answering questions (read first)

1. **Run the model rather than recalling numbers.** If a number is not from a command you ran this session or a cited line of `docs/APPROACH.md`, do not state it.
2. **Cite provenance with `--explain <path>`** for any preset value you lean on. If the answer is `documented: false`, say the assumption is undocumented. Never invent a source, a link or a number.
3. **Keep three things separate and name which one you are speaking about:**
   - *Physics*: what nature does regardless of this model (energy conservation, Stefan–Boltzmann, T⁴, Wiedemann–Franz).
   - *Model output*: what the CLI printed for these inputs.
   - *Assumptions*: the choices in a preset (emissivity 0.92, junction limit 373 K, sizing margin). Each is tagged `[source]`, `ASSUMPTION`, `CALIBRATED` or `SECONDARY`.
4. **Name the relevant limitation** from `docs/APPROACH.md` section 7 (Limitations): steady state; global-mean lunar infrared; lunar surface is an infinite plain; linear coolant glide; no heat pumps; single areal density; solar is the only power source; one calibration point; no cost.
5. **Always give units** (W, kW, K, m², kg, W/m², kg/kW). Say "per m² of panel planform" for fluxes.
6. **Teach, do not lecture.** One question at a time; wait for an answer; if the learner is wrong, run a command that shows why rather than just correcting.
7. **Terminology.** "Solar array", never a bare "array"; the radiator is never an array; never "radiation" alone, say "thermal emission", "radiates" or "Stefan–Boltzmann".

Start by asking what the learner already knows and what they want (curiosity, a design decision, a paper). Begin at the matching lesson.

---

## Lesson 0: every watt becomes heat

**Goal.** The learner can say why a spacecraft's heat to reject equals its electrical load, and why that is the problem.

**Run.**

```text
bun run analyze --mode starmind --format table
bun run analyze --mode starmind --set power.conversionEfficiency=1 --set power.overheadFraction=0 --set power.pumpFraction=0 --format table
```

**Notice.** The payload (`heatSource.totalPower_W`) is 150,000 W, but `heatToReject_W` is 163,895 W: conversion losses, avionics overhead and pumps all end as heat too. With those set to a perfect bus (efficiency 1, overhead 0, pumps 0), heat to reject is exactly 150,000 W and the radiator shrinks from 192.88 m² to 176.529 m². Nothing is "consumed": electrical energy ends as heat, and in vacuum the only way out is thermal emission (APPROACH section 1).

**Ask** (one at a time):
1. A 150 kW compute payload runs flat out. How much heat must leave the spacecraft, and where does the energy go if it cannot leave?
2. On the ground you throw heat into air or water. What is different about vacuum?
3. The solar array also gets hot in sunlight. Does its waste heat go through the payload radiator? (No: the solar array radiates its own unconverted sunlight; APPROACH section 1.)

**Misconceptions.** "Computing uses up the power." "Space is cold so cooling is easy" (it is a good heat sink, a terrible conductor: no convection). "Efficiency losses are someone else's heat" (they count too).

**Takeaway.** Q equals the bus load. Everything that follows is about getting Q out through emission alone. *Limitation:* steady state, orbit-averaged (section 7, item 1): no thermal mass to absorb a burst.

---

## Lesson 1: the heat path, the first centimetre, and why heat has no transformer

**Goal.** The learner sees the temperature staircase from die to radiator and why the first centimetre matters more than the next ten metres.

**Run.**

```text
bun run analyze --mode starmind --format table
bun run analyze --mode starmind --heat-source gpu-direct-die --format table
bun run analyze --mode starmind --sweep heatSource.unitPower_W=1000:2500:500 --metric chain.stackDrop_K --metric chain.coolantHot_K --metric radiatorArea_m2 --format table
```

**Notice.** In the first run read the "Temperature staircase": the source limit is 373 K, the silicon die, interface materials, copper lid and cold plate use up about 30.8 K (`sourceStackDrop_K` 30.795), so the coolant leaves at 342.2 K and the radiator radiates at an effective 336.2 K. Swapping to direct-die two-phase cooling cuts the stack drop to 11.7 K, raises coolant to 361.3 K and shrinks the radiator from 192.88 to 151.52 m². Sweeping power per package from 1000 to 2500 W grows the stack drop from 17.1 K to 42.8 K, and the radiator from 161.9 to 226.7 m². Every kelvin spent in a thin interface is a kelvin not available to the radiator, where flux goes as T⁴.

Optional, ISS heritage: `bun run analyze --mode iss --sweep loop.hxApproach_K=0:30:10 --metric radiatorArea_m2` gives 963.5, 1201.3, 1540.1, 2053.9 m² as the intermediate heat exchanger approach grows 0, 10, 20, 30 K.

**Why no transformer.** Electricity is moved at high voltage and stepped up or down with a transformer, so distance costs little. Heat has no equivalent: conduction with a temperature budget behaves like a bus at only about 20 mV for 50 K of copper (Wiedemann–Franz, APPROACH section 5; `test/system.test.ts`). Pumped loops carry heat in moving mass instead, and distance then costs pump power. The one device that does "transform" heat is a heat pump, and the model does not have one (section 7, item 5; roadmap item 1).

**Ask.**
1. Where in the staircase is the biggest single drop, and which stage causes it?
2. If you could remove 10 K anywhere, would you rather remove it at the die, or lower the radiator's own temperature by 10 K? Why? (Run `--set heatSource.maxTemperature_K=` changes to test.)
3. Why can a power company move megawatts for 100 km but we struggle to move 1 kW across a 10 cm cold plate?

**Misconceptions.** "Radiator size is the whole problem" (the heat path sets the temperature the radiator works at). "Just use a bigger pipe" (the loop is not where most of the drop is).

**Takeaway.** The heat path outputs one number to the radiator: its temperature. Spend kelvins carefully near the source. *Limitations:* linear coolant glide, no two-phase pressure drop (item 4); stack values are `ASSUMPTION` (`--explain heatSource.stages`).

---

## Lesson 2: the radiator: T⁴, emissivity, view factors, what it sees

**Goal.** The learner can predict the direction and rough size of how radiator area responds to temperature, surface, orientation and location.

**Run.**

```text
bun run analyze --mode physics --sweep heatSource.maxTemperature_K=300:600:100 --metric netFlux_W_m2 --metric radiatorArea_m2 --format table
bun run analyze --mode starmind --sweep radiator.emissivity=0.5:1:0.25 --metric radiatorArea_m2 --format table
bun run analyze --mode starmind --environment moon-equator --set radiator.orientation=zenithOnly
bun run analyze --mode starmind --explain radiator.emissivity
```

**Notice.**
- *T⁴ (physics).* In physics mode (black, perfect fins, radiator at source temperature) net flux per m² of panel is 799.13 W/m² at 300 K and 14,578 W/m² at 600 K; area falls from 189.6 to 10.393 m². Doubling the temperature gives 18.2 times the net flux, a little more than 2⁴ = 16, because the radiator also absorbs a roughly fixed amount of thermal emission from Earth (two faces at 300 K emit 918.6 W/m²; the model nets 799.1, so about 119.5 W/m² is absorbed). Hot waste heat is cheap to reject; warm chips are expensive.
- *Emissivity (model, assumption).* Radiator area is 348.37, 231.65, 173.52 m² at emissivity 0.5, 0.75, 1.0. The Starmind preset has no provenance note for emissivity: `--explain` returns `documented: false`. Compare `--mode iss --explain radiator.emissivity`, which cites Z-93 paint with sources. Say which is which.
- *What the radiator sees (physics plus model).* Net flux per m² of panel, Starmind chain (336 K radiating), by orientation:

| Location | `edgeOn` (both faces) | `nadirZenith` | `zenithOnly` |
|---|---|---|---|
| LEO 600 km (`leo-600`) | 1062.2 W/m² (192.9 m²) | 986.2 W/m² (207.7 m²) | 587.1 W/m² (349.0 m²) |
| Cislunar deep space (`cislunar-deep`) | 1174.2 W/m² (174.5 m²) | 1174.2 W/m² (174.5 m²) | 587.1 W/m² (349.0 m²) |
| Lunar equator noon (`moon-equator`) | 22.6 W/m² (9045.5 m²) | -249.6 W/m² (infeasible) | 314.9 W/m² (650.6 m²) |

Run the same commands with `--set radiator.orientation=<o> --environment <e>` to reproduce a cell. In orbit a two-sided panel edge-on to a planet sees little of it (the exact edge-on view factor at 550 km is about 0.26; `test/physics.test.ts`). In deep space it sees 2.725 K sky on both faces. On the Moon at noon, a vertical fin sees half its view as 390 K ground, and a horizontal panel with a Sun-facing face heats up faster than it radiates (negative flux: the CLI warns "the environment heats this radiator faster than it radiates"). Of the three orientations tried here, a single sky-facing face is best there.

**Ask.**
1. Before running: if I double the radiator temperature, how much does its rejection per m² change? (Let them guess; then run the sweep.)
2. Why does a perfectly black radiator at 300 K in LEO not reach 918.6 W/m² net? (It absorbs Earth's thermal emission and albedo.)
3. Which would you rather have on the Moon at noon: a large fin or a small panel facing the sky? Why does "view factor" explain it?

**Misconceptions.** "Radiators work better when they are big and cold." "Space is 3 K so everything radiates freely" (the Moon's ground is not 3 K). "Emissivity is a detail" (it moves area by 2x between 0.5 and 1.0).

**Takeaway.** Net flux = what you emit (T⁴, ε) minus what you absorb (Earth, Moon, Sun, ground). Orientation is a design choice with big consequences. *Limitations:* infinite lunar plain, no terrain, no shaded or parabolic radiators (item 3); lunar infrared in orbit uses the global mean (item 2); one areal density (item 6).

---

## Lesson 3: the power supply, darkness, and why lunar night is a mass problem

**Goal.** The learner understands that darkness, not heat, can dominate the mass budget, and how the answer changes with the day length.

**Run.**

```text
bun run analyze --mode starmind --environment iss-leo --format table
bun run analyze --mode starmind --environment moon-equator --format table
bun run analyze --mode starmind --environment moon-equator --sweep environment.sunlitFraction=0.3:0.7:0.2 --metric mass_kg.battery --format table
bun run analyze --mode starmind --environment moon-polar --format table
```

**Notice.**
- In LEO at 420 km (`iss-leo`, beta 0) the sunlit fraction is 0.61253 over a 1.547 h cycle; battery 2183.2 kg (34 % of total) and a solar array of 1147.3 m² (versus 679.87 m² in `leo-600`, because it must also charge the battery). In `leo-600` (beta 70, no eclipse) the battery is 0 kg and the solar array is 679.87 m².
- At the lunar equator (`moon-equator`) the sunlit fraction is 0.5 over a 708.72 h cycle: about 354 h of darkness (`--explain environment.sunlitFraction`). Battery mass is 1,290,620 kg, 96 % of the total (the CLI warns "darkness, not heat, dominates this design"). Raising sunlit fraction to 0.7 cuts battery to 774,370 kg. The polar ridge (`moon-polar`, 0.85 sunlit, an `ASSUMPTION`) needs 387,185 kg.
- Battery mass is energy over specific energy: doubling specific energy halves it (`--sweep power.battery.specificEnergy_Wh_kg`).

Storage oversize is 1 + (1-f)/(f eta_rt) (APPROACH section 4): darkness inflates the solar array as well as the battery.

**Ask.**
1. A satellite is in sunlight 61 % of an orbit. Why must its solar array deliver more than the load while the Sun is up?
2. On the Moon, the night is 354 hours. Why does battery mass scale with night length, not with how hot the radiator is?
3. If batteries were not the answer, what would you try? (Fission with its own radiator; section 7 item 7. Polar sites with long daylight.)

**Misconceptions.** "Cislunar space is easy because it is sunny" (true for storage: the `cislunar-deep` run has 0 kg of battery, but the radiator story is Lesson 2). "Batteries are small compared to radiators" (not at lunar night).

**Takeaway.** The power supply sizes to the load and the light/dark cycle; on the Moon the cycle dominates. *Limitations:* solar is the only source (item 7); steady state (item 1); lunar illumination in `moon-polar` is one guessed fraction, not a real dark-period schedule.

---

## Lesson 4: putting it together: mass budget, area ratio, sensitivity

**Goal.** The learner can read a full result and say what dominates and what to improve first.

**Run.**

```text
bun run analyze --compare --format table
bun run analyze --mode starmind --tornado --format table
bun run analyze --mode starmind --format table
```

**Notice.**
- `--compare`: radiator area 1201.3 (`iss`, at LEO 420 km), 192.88 (`starmind`), 118.91 (`ideal`), 72.993 m² (`physics`); total mass 33,946, 3,367.8, 1,356.7, 241.46 kg; solar array : radiator area ratio 2.35, 3.52, 4.04, 2.23.
- Starmind mass budget (kg): radiator 1157.3, thermal loop 819.47, solar array 1359.7, battery 0, harness 31.36, total 3367.8, which is 22.452 kg/kW. The solar array is 3.5x the radiator in area; by mass, radiator plus thermal loop is about 1977 kg and the solar array about 1360 kg.
- Tornado, total mass, top rows: solar array areal density +/-8.1 %, radiator areal density +/-6.9 %, source temperature limit +4.9 % (10 K colder) and -4.2 % (10 K hotter), cell efficiency +4.5 % / -3.7 %. Some "levers" are material properties (areal density) rather than design choices. In this model they are partly `ASSUMPTION` (`--explain power.solarArrayArealDensity_kg_m2`).

**Ask.**
1. Which is the larger piece of hardware here, the radiator or the solar array? By how much, and does it match your intuition?
2. If you could improve exactly one assumption, which would the tornado say, and which would you trust least?
3. Change the location with `--environment`. Which part of the mass budget moves first?

**Misconceptions.** "The radiator is the biggest piece" (area ratio says the solar array is). "Sensitivity means importance" (a sensitive input that is well known matters less than an uncertain one: check `--explain`).

**Takeaway.** Three parts, three joins; read the ratio and the mass split before optimising. *Limitations:* mass only, no cost (item 9); one number per areal density (item 6).

---

## Lesson 5: the reference cases as case studies

**Goal.** The learner sees how a model earns trust: a calibration, a consistency check, and a physics limit.

### 5a. ISS: calibration (the 1.80x sizing margin)

```text
bun run analyze --mode iss --set heatSource.totalPower_W=70000 --set power.conversionEfficiency=1 --set power.overheadFraction=0 --set power.pumpFraction=0 --set radiator.sizingMargin=1.8
bun run analyze --mode iss --set heatSource.totalPower_W=70000 --set power.conversionEfficiency=1 --set power.overheadFraction=0 --set power.pumpFraction=0 --set radiator.sizingMargin=1
bun run analyze --mode iss --explain radiator.sizingMargin
```

70 kW of heat, with margin 1.80, gives a radiator area of 474.6 m² (the ISS radiators total 475 m² over 6 panels of 23.3 x 3.4 m) with a radiator outlet at 233 K (-40 F). With margin 1.0 it gives 263.7 m². The margin is `CALIBRATED`, tuned to that one number: it lumps hot-case environment, coating degradation, flow distribution and reserve. The finding: a nominal radiator model is about 1.8x optimistic against flight hardware. Ask: if every other design used a margin of 1.0, what would be missing from the answer? *Limitation:* one calibration point (item 8).

### 5b. Starmind: the reported-area check

```text
bun run analyze --mode starmind
```

Look at `reportedCheck`: 110 m² of radiator must reject 1489.95 W/m² of panel, which needs radiating fluid at 363.4 K; the Earth-style lidded stack gives 336.2 K. The report leaves a chain budget of 9.6 K between the source limit and the fluid; the lidded stack spends 36.8 K. So either the heat path is far better than the lidded Earth-style assumption (try `--heat-source gpu-direct-die`), the junction runs hotter than 373 K, or the figures describe different things. It is a consistency check, not proof anything is wrong. Ask the learner which of the three they would check first, and what source would settle it. Be careful: the sources are reporting, tagged `SECONDARY` where applicable (`--explain heatSource.totalPower_W`).

### 5c. The physics limit

```text
bun run analyze --mode physics --environment cislunar-deep
bun run analyze --mode physics
```

In cislunar deep space the physics mode has rejection effectiveness exactly 1 and a radiator area of 69.0206 m²; it radiates at the source temperature (373 K) with black surfaces and perfect fins. In LEO 600 km it is 72.993 m² (effectiveness 0.94558) because Earth is in view. This is the floor for this payload and temperature, not a design: areal densities are placeholders (`--explain radiator.arealDensity_kg_m2`).

**Ask.**
1. Why does the limit mode, with no engineering at all, still need about 70 m²?
2. Which reference case would you quote in a paper, and what would you say about its assumptions?

**Takeaway.** A model earns trust with anchors it can reproduce (ISS), checks it can run against claims (Starmind), and a limit it cannot beat (physics). Where it has only one anchor, say so.

---

## Wrapping up a session

Offer: a what-if on something the learner cares about, a share link of the scenario they built (`--share-out`; see `sharing.md`), or the open items in the Assumptions table where a better sourced number would help (`--explain all` lists `parametersWithoutNote`). If they have a better number, go to `CONTRIBUTING.md`.
