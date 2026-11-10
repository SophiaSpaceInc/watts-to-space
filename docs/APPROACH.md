# Approach

The model is a steady-state, orbit-averaged energy balance. It is deliberately simple
enough to audit line by line. Each simplification is listed under
[Limitations](#limitations); the roadmap says which one to lift first.

## 1. Energy balance

```
bus load            P_bus(P)  = P / η_conv + P × (overhead + pumps)
heat to reject      Q         = P_bus(P_peak)          (every delivered watt becomes heat)
solar array output  P_solar   = P_bus(P_avg) × oversize / (1 − harness loss)
average payload     P_avg     = P_peak × average fraction
```

Two loads, because the hardware answers to different ones. The radiator and pumped loop
are sized for the peak heat: the model holds no thermal storage, so it cannot ride
through a peak. The solar array and battery are sized for the average over each
light/dark cycle; peaks above it come from the battery. The harness is sized for the
peak current. SpaceX quotes AI1 the same way (peak and average compute).

The solar array radiates its own unconverted sunlight, so that heat never reaches the
payload radiator. Harness I²R is dissipated along the wires.

## 2. The temperature staircase (`thermalChain.ts`)

Thermal Ohm's law, ΔT = Q·R. Source stages carry the per-unit heat (one GPU package):

| Stage kind | Resistance |
|---|---|
| conduction | t / (k A) |
| interface | R″ / A (datasheets: K·cm²/W; 1 K·cm²/W = 1e-4 K·m²/W) |
| convection | 1 / (h A) |
| resistance | lumped K/W |
| deltaT | fixed drop (process heat exchanger approach) |

Then the loop: transport drop, optional intermediate heat exchanger, and the coolant glide
across the radiator. The hottest coolant (source outlet) is the reference for the source
stack, which is conservative. A heritage **coolant setpoint** (`coolantCap_K`) can pin the
loop below what the source allows. ISS mode uses this: its 17 °C water loop leaves ~47 K
of chip temperature allowance unused.

Single-phase glide is converted to an effective radiating temperature by the T⁴-mean of a
linear profile: T_eff⁴ = (T_in⁵ − T_out⁵) / (5 (T_in − T_out)). Two-phase loops have no
glide.

## 3. Radiator and environment (`thermalEmission.ts`, `environment.ts`, `viewFactor.ts`)

Per face: q_net = η_fin ε σ (T⁴ − T_CMB⁴) − absorbed. Absorbed flux:

- **Orbit**: ε F q_IR + α F S a (cos β / π). F is the exact plate-to-sphere view factor
  (nadir: (R/(R+h))²; edge-on: (1/π)[atan(1/√(H²−1)) − √(H²−1)/H²]). The albedo term is
  orbit-averaged. Earth IR = 240 W/m² (CERES). Lunar IR = global mean S(1−A)/4 ≈ 303 W/m².
- **Deep space**: nothing absorbed; sink at 2.725 K.
- **Lunar surface**: the ground is an infinite plane at a given temperature (vertical fin:
  F = 0.5 per face). Ground IR and reflected sunlight are absorbed. Sky-facing faces see
  direct Sun at the given elevation.

Radiator area = Q × sizing margin / q_net(panel). **Rejection effectiveness** compares q_net
with a perfect two-sided black panel at the source limit in deep space. It is the thermal
analogue of electrical transmission efficiency.

## 4. Power (`power.ts`, `orbit.ts`)

- Solar array: S × η_cell × packing × operating factor.
- Storage over a light/dark cycle (f sunlit, period T): oversize = 1 + (1−f)/(f η_rt);
  battery = P (1−f) T / DoD.
- Eclipse fraction for circular orbits (cylindrical shadow); zero above β* = asin(R/(R+h)).
- Harness: copper sized for a chosen I²R loss f, as a designer would: A = ρ·2L·P / (V²·f), so copper mass ∝ L²·P / (V²·f). Voltage trades copper mass, not efficiency (about 840 kg of copper at 120 V vs 19 kg at 800 V for 164 kW over 35 m at 1 % loss). Not modelled: arcing of high-voltage solar arrays to the low-orbit plasma, which limits how high a bus can go without mitigation (NASA-HDBK-4006A).

## 5. Electricity vs heat (`transport.ts`)

For the same copper conductor, Wiedemann–Franz gives κ/σ = L·T. Conducting heat with a
budget ΔT therefore behaves like an electrical bus at V = √(L T ΔT): about 20 mV for 50 K.
Pumped loops avoid this by carrying heat in moving mass. Distance then costs pump power
(Darcy–Weisbach with the Blasius friction factor) instead of temperature.

## 5a. Distributed Tiles (`tile.ts`), a Sophia Space addition in this fork

A Tile is a flat panel of about 1 m² that carries its own compute (Jetson Thor modules)
on a passive oscillating-heat-pipe panel, which is also the radiator. There is no pumped
loop. Two reference cases sit beside the Starmind case, at the same 250 kW peak / 175 kW
average payload and the same orbit:

- **`tileShared`**: Tiles radiate from both faces, edge-on to the Sun, and draw power
  from the same solar array and battery assumptions as the Starmind case. It uses the
  model's ordinary radiator equations with zero loop mass and zero pump power. Additions:
  a 400 V distribution bus (copper ∝ 1/V²), step-down converters on the Tiles,
  networking mass per Tile, and two optional penalties that default to zero: enclosure
  mass per compute module, and support structure as a fraction of everything mounted on
  the Tiles (by default the heat-pipe panel density is taken to include structure, as
  the pumped cases' areal densities do). The Thor junction limit is set to 100 °C.
- **`tileSolar`**: the sunlit face of each Tile is solar cells, so solar array area and
  Tile area are one number and there is no harness. Per m² of Tile the cells absorb
  α S, deliver e as electricity, and keep α S − e as heat. All of e returns as heat on
  the same Tile. The cells are sized for the average load, the radiator for the peak.
  `tile.radiatorCoupling` chooses how the balance closes: `separate` puts a heat-pipe
  radiator smaller than the Tile behind the cells, insulated from them and at the
  temperature the chip's staircase allows; `bonded` ties everything to one temperature.
  Cells on a Tile run hotter than on a free-flying solar array, and their output is
  derated by a temperature coefficient. `tile.sunAngle_deg` tilts the Tile away from
  the Sun, trading Tiles for temperature.

Limits specific to these cases: a Sun-facing Tile is given the edge-on view of the body
on both faces, which holds near the terminator only; the insulation between cells and a
`separate` radiator is perfect; payload mass stays out of scope, so the networking and
enclosure penalties are the only compute-side mass counted; and battery energy for peaks is counted only when
`tile.peakDuration_h` is set (the pumped cases never count it).

## 6. Validation anchors (all in `test/`)

| Anchor | Result |
|---|---|
| ISS EATCS: 70 kW on 6 radiators of 23.3 × 3.4 m (475 m²), radiator outlet −40 °F | ISS mode reproduces this within 3 % with a calibrated sizing margin of 1.80. A nominal radiator model is therefore ~1.8× optimistic against flight hardware, because it ignores hot-case environment, coating degradation, flow distribution and reserve. |
| View factors | Closed forms match brute-force hemisphere integration (Earth 400–2000 km, Moon 100 km) within 0.002. |
| ISS orbit | Period ≈ 92.8 min, eclipse ≈ 39 % at β = 0 for 420 km. |
| GPU stack | With a 45 °C inlet and a 10 K coolant rise, the lidded stack gives a junction of ~86 °C at 1.8 kW and ~94 °C at 2.3 kW, consistent with reported Rubin operating points. |
| Starmind check (the page's callout; `test/system.test.ts` pins only the ordering) | SpaceX's stated ~1,400 W/m² needs radiating fluid at ~358 K under the preset's radiator assumptions at 600 km, so the radiator physics agrees; the Earth-style lidded stack delivers ~336 K. Rejecting the 250 kW peak (273 kW of heat) on 160 m² needs ~375 K, above the 373 K junction limit; the 175 kW average needs ~345 K. SpaceX's Starmind figures work out to 5.25 : 1 (840 / 160 m²), close to Musk's "~5 times the area of the radiator"; the model's case is 2.4 : 1, mostly because it sizes the radiator for peak and the solar array for average load, with a 25 % margin. |

## 7. Limitations

1. **Steady state, orbit-averaged.** No eclipse transients, no thermal mass, no
   hot-case/cold-case split. The radiator is sized for the peak load, so a design that
   rides through short peaks on thermal mass, or throttles, needs less radiator than
   shown; the battery energy for peaks above the average in sunlight is not counted. Real radiators are sized for the hot case and protected
   against freezing in the cold case.
2. **Lunar IR in orbit uses the global mean.** Over the dayside, low-lunar-orbit radiators
   see up to ~4× more.
3. **Lunar surface is an infinite plain.** No terrain, no shading, no parabolic or
   view-limiting radiator geometries. Those are the standard mitigations for equatorial
   noon.
4. **Linear coolant glide**, no two-phase pressure drop, no heat-pipe limits.
5. **No heat pumps.** Lifting heat to a hotter radiator trades radiator area for solar array area
   and is the only "transformer" heat has. This is the most important missing lever.
6. **Radiator areal density is a single number.** Micrometeoroid armour, redundancy and
   deployment drive it in practice.
7. **Solar is the only power source.** Fission (with its own hot radiator) is the usual
   proposal for the lunar night.
8. **One calibration point.** The ISS margin is fitted to a single published rating.
9. Payload mass and cost are out of scope by design (see McCalip's model for cost).

## 8. Roadmap (suggested order)

1. Heat-pump option (Carnot-fraction COP) with its solar-array-versus-radiator trade curve.
2. Fission power source with its own high-temperature radiator, for lunar night.
3. Hot/cold-case envelope and a freeze-margin check (the ISS radiators' real constraint).
4. Lunar-surface radiator geometries (shaded, parabolic, view-limited), with terrain and
   latitude.
5. Time-stepped orbit and lunar-day thermal simulation.
6. A CSV export that feeds a cost model (share links and JSON export already exist).
7. More calibration anchors (other flight radiators and solar arrays with published masses).

## Visual design

Charts use the dataviz reference categorical palette, six slots in fixed order. The
validator passes every adjacent-pair check in light and dark mode. In light mode, three
slots (aqua, yellow, pink) fall below 3:1 contrast on the surface. Line charts compensate
with direct labels; the mass and sensitivity charts have a "Values as a table" view. All charts
are dependency-free SVG (`src/ui/charts.ts`), with hover tooltips and crosshairs.
