# Approach

The model is a steady-state, orbit-averaged energy balance. It is deliberately simple
enough to audit line by line. Each simplification is listed under
[Limitations](#limitations); the roadmap says which one to lift first.

## 1. Energy balance

```
bus load          P_bus   = P_payload / η_conv + P_payload × (overhead + pumps)
heat to reject    Q       = P_bus                      (every delivered watt becomes heat)
solar array output P_solar = P_bus × oversize / (1 − harness loss)
```

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

## 3. Radiator and environment (`radiation.ts`, `environment.ts`, `viewFactor.ts`)

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
- Harness: loss fraction = P R / V².

## 5. Electricity vs heat (`transport.ts`)

For the same copper conductor, Wiedemann–Franz gives κ/σ = L·T. Conducting heat with a
budget ΔT therefore behaves like an electrical bus at V = √(L T ΔT): about 20 mV for 50 K.
Pumped loops avoid this by carrying heat in moving mass. Distance then costs pump power
(Darcy–Weisbach with the Blasius friction factor) instead of temperature.

## 6. Validation anchors (all in `test/`)

| Anchor | Result |
|---|---|
| ISS EATCS: 70 kW on 6 radiators of 23.3 × 3.4 m (475 m²), radiator outlet −40 °F | ISS mode reproduces this within 3 % with a **calibrated** sizing margin of 1.80. That margin is itself a finding: a nominal radiator model is ~1.8× optimistic against flight hardware, because it ignores hot-case environment, coating degradation, flow distribution and reserve. |
| View factors | Closed forms match brute-force hemisphere integration (Earth 400–2000 km, Moon 100 km) within 0.002. |
| ISS orbit | Period ≈ 92.8 min, eclipse ≈ 39 % at β = 0 for 420 km. |
| GPU stack | With a 45 °C inlet and a 10 K coolant rise, the lidded stack gives a junction of ~86 °C at 1.8 kW and ~94 °C at 2.3 kW, consistent with reported Rubin operating points. |
| Starmind check | Rejecting 150 kW (164 kW of bus heat) on 110 m² needs radiating fluid at ~363 K at 600 km. A 373 K junction then leaves ~10 K for the whole chain; an Earth-style lidded stack spends ~37 K. |

## 7. Limitations

1. **Steady state, orbit-averaged.** No eclipse transients, no thermal mass, no
   hot-case/cold-case split. Real radiators are sized for the hot case and protected
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
7. **Solar is the only power source.** Fission (with its own hot radiator) is the obvious
   lunar-night answer.
8. **One calibration point.** The ISS margin is fitted to a single published rating.
9. Payload mass and cost are out of scope by design (see McCalip's model for cost).

## 8. Roadmap (suggested order)

1. Heat-pump option (Carnot-fraction COP) with its solar-array-versus-radiator trade curve.
2. Fission power source with its own high-temperature radiator, for lunar night.
3. Hot/cold-case envelope and a freeze-margin check (the ISS radiators' real constraint).
4. Lunar-surface radiator geometries (shaded, parabolic, view-limited), with terrain and
   latitude.
5. Time-stepped orbit and lunar-day thermal simulation.
6. Shareable URL state, and a CSV/JSON export that feeds a cost model.
7. More calibration anchors (other flight radiators and solar arrays with published masses).

## Visual design

Charts use the dataviz reference categorical palette, six slots in fixed order. The
validator passes every adjacent-pair check in light and dark mode. In light mode, three
slots (aqua, yellow, pink) fall below 3:1 contrast on the surface. Line charts compensate
with direct labels; the stacked mass bars rely on the legend, totals and hover values. A
table view for the mass charts would fully satisfy the relief rule (open item). All charts
are dependency-free SVG (`src/ui/charts.ts`), with hover tooltips and crosshairs.
