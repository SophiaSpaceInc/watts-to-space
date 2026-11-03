/**
 * Plain-language explanations of every input: what it is physically, how it enters the
 * model, and which way it pushes the results. Shown on the page (Assumptions table),
 * by the CLI (`--explain`) and to agents (the skill).
 *
 * Provenance for the *values* lives in the notes in scenarios.ts. These explanations
 * describe the *meaning*, and should hold for any value. A test requires an entry for
 * every input that can appear in the Assumptions table.
 */
export const EXPLANATIONS: Record<string, string> = {
  // ------------------------------------------------------------- shared: load
  'heatSource.totalPower_W':
    'Total heat load of the installation: the power the payload uses, all of which ends up as heat. It scales the radiator, the solar array and the battery together.',
  'power.conversionEfficiency':
    'Efficiency of converting bus power into what the payload uses. The lost share also becomes heat inside the spacecraft, so a lower efficiency enlarges both the solar array and the radiator.',

  // ------------------------------------------------------------- shared: location
  'environment.altitude_km':
    'Height of the circular orbit above the surface. Higher orbits see less of the planet, so the radiator absorbs less of its infrared and reflected sunlight, and they spend less time in shadow. Not modelled: around Earth, roughly 1,000 to 2,000 km lies in the inner Van Allen belt, which is hard on electronics.',
  'environment.beta_deg':
    'Angle between the orbit plane and the direction of the Sun. Near 90° (a dawn–dusk or terminator orbit) the spacecraft can stay in sunlight and sees little sunlit ground; near 0° it has the longest eclipses and the most reflected sunlight.',
  'environment.groundTemperature_K':
    'Temperature of the ground the radiator stands on (lunar regolith). Warm ground emits infrared that the radiator absorbs: a vertical fin sees ground over half of each face. At lunar equatorial noon (about 390 K) this can cancel a low-temperature radiator entirely.',
  'environment.sunElevation_deg':
    'Height of the Sun above the horizon at a surface site. It sets the direct sunlight on upward-facing radiator faces and the sunlight reflected from the ground.',
  'environment.sunlitFraction':
    'Share of each light/dark cycle spent in sunlight. The solar array must make all the energy while lit, and the battery must carry the load through the dark, so a lower fraction enlarges both.',

  // ------------------------------------------------------------- heat path
  'heatSource.maxTemperature_K':
    'Hottest temperature the heat source may reach: a chip junction limit or a process temperature. It is the top of the temperature staircase. Every extra kelvin of allowance lets the radiator run hotter, and radiator output grows as T⁴.',
  'heatSource.unitPower_W':
    'Heat flowing through one stack of the source (for example, one GPU package). The first-centimetre temperature drops scale with it, so denser chips leave a colder coolant and need a larger radiator.',
  'heatSource.stages':
    'The layers heat crosses in the first centimetre: silicon, interface materials, lid and cold plate, or a heat exchanger for a process. Each is a thermal resistance, so its temperature drop is heat flow × resistance. The stage table under chart 1 lists them.',
  'loop.coolant':
    'The fluid that carries heat from the source to the radiator. Its working window matters: below its freezing point it freezes in a cold radiator, and above its limit it boils or passes its critical point.',
  'loop.coolantCap_K':
    'An upper limit on coolant temperature set by heritage design, not physics. The ISS keeps its water loop at crew-friendly temperatures, which leaves electronics cooler than they need to be and forces a cold, large radiator.',
  'loop.transportDrop_K':
    'Temperature lost to the surroundings along insulated lines between source and radiator. Small in a pumped loop: there, distance costs pump power, not temperature.',
  'loop.hxApproach_K':
    'Temperature lost in a heat exchanger between two loops, for example an internal water loop and an external ammonia loop. Two loops isolate faults; the price is this drop, taken straight off the radiator temperature.',
  'loop.rise_K':
    'How much the coolant warms crossing the heat sources, which equals how much it cools crossing the radiator. A larger glide needs less flow and pump power but makes the radiator cooler on average. A two-phase loop condenses at nearly constant temperature, so its glide is about zero.',

  // ------------------------------------------------------------- radiator
  'radiator.orientation':
    'Which way the radiator faces: edge-on to the body (both faces look at the horizon), flat (one face toward the body or ground, one toward the sky), or one sky-facing face. It sets how much of each face sees warm surfaces or the Sun.',
  'radiator.emissivity':
    'How close the surface comes to a perfect infrared emitter (1.0). It multiplies emitted heat directly. By Kirchhoff’s law it also sets how much infrared the radiator absorbs from a warm planet or ground.',
  'radiator.solarAbsorptance':
    'Fraction of incident sunlight the surface absorbs. White paints and optical solar reflectors keep it low, and it creeps up as coatings degrade over the mission.',
  'radiator.finEfficiency':
    'How much of the panel radiates at the fluid temperature. Heat must conduct from the tubes across the fin, so the fin runs cooler than the fluid; an efficiency below 1 acts like a lower radiating temperature.',
  'radiator.sizingMargin':
    'Extra radiator area beyond the nominal calculation, for hot-case environments, coating degradation, uneven flow and reserve. The ISS calibration needs 1.80, which shows how optimistic a nominal model is.',
  'radiator.arealDensity_kg_m2':
    'Mass per m² of radiator panel, including fluid, tubes, face sheets, micrometeoroid protection and deployment. Radiator mass is its area times this.',
  'radiator.loopSpecificMass_kg_per_kW':
    'Mass of pumps, accumulators, valves and rotary joints per kW of heat moved. The radiator panels are counted separately.',
  'reported.radiatorArea_m2':
    'A radiator area published for a real system. The model works backwards from it: what radiating temperature would that area need for this heat load, and does the modelled temperature staircase leave that much room?',

  // ------------------------------------------------------------- power supply
  'power.cellEfficiency':
    'Fraction of sunlight a solar cell turns into electricity at beginning of life. With the solar constant (1,361 W/m²) and the packing and operating factors, it sets watts per m² of solar array.',
  'power.operatingFactor':
    'Real-world losses of a working solar array, lumped together: cell temperature, mismatch between cells, string wiring and end-of-life degradation.',
  'power.packingFactor':
    'Share of the solar array blanket covered by active cells; the rest is gaps, interconnects and structure.',
  'power.solarArrayArealDensity_kg_m2':
    'Mass per m² of solar array, including blanket, cells and deployment structure. Solar array mass is its area times this.',
  'power.busVoltage_V':
    'Voltage of the power bus from the solar array to the payload. For a given loss, the copper needed scales as 1/V²: doubling the voltage quarters the harness mass. That is the "transformer" advantage electricity has and heat does not. In low orbit, high voltages also risk arcing to the surrounding plasma.',
  'power.harnessLossFraction':
    'The resistive loss the copper harness is sized for, as a share of the power it carries. Designers pick the loss and size the copper to meet it; a lower target needs proportionally more copper. The lost power heats the wires, not the payload.',
  'power.battery.specificEnergy_Wh_kg':
    'Stored energy per kilogram of battery at pack level: cells, structure, wiring and thermal control. Battery mass is the dark-period energy divided by this and by the depth of discharge.',
  'power.battery.depthOfDischarge':
    'Share of the battery’s rated energy used each cycle. Thousands of short eclipses a year in low orbit force shallow cycling; one long lunar night a month allows deeper use. Shallower cycling means a heavier battery.',
};
