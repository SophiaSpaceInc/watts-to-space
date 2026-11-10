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
    'Peak heat load of the installation: the most power the payload draws, all of which ends up as heat. The radiator and pumped loop are sized for it, because the model holds no thermal storage to ride through peaks.',
  'heatSource.averageFraction':
    'Average load as a share of peak. The solar array and battery only have to sustain the average through each light/dark cycle; peaks above it come from the battery. SpaceX quotes AI1 as peak and average figures.',
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
    'The fluid that carries heat from the source to the radiator. It has a working window: below its freezing point it freezes in a cold radiator, and above its limit it boils or passes its critical point.',
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
    'Extra radiator area beyond the nominal calculation, for hot-case environments, coating degradation, uneven flow and reserve. The ISS calibration needs 1.80: matching the ISS’s 70 kW on 475 m² takes 80 % more area than the nominal calculation.',
  'radiator.arealDensity_kg_m2':
    'Mass per m² of radiator panel, including fluid, tubes, face sheets, micrometeoroid protection and deployment. Radiator mass is its area times this.',
  'radiator.loopSpecificMass_kg_per_kW':
    'Mass of pumps, accumulators, valves and rotary joints per kW of heat moved. The radiator panels are counted separately.',
  'reported.vehicleSpecificPower_kW_per_t':
    'Payload power per ton of the whole vehicle, as published. The model turns it into a whole-satellite mass at peak load and compares its own power and thermal hardware against it. If that hardware alone exceeds the inferred vehicle mass, either the model\'s mass assumptions are heavier than the real design or the published figure is optimistic.',
  'reported.radiatorFlux_W_m2':
    'Net heat a real design says each m² of radiator panel rejects. The model finds the radiating fluid temperature that flux needs under this case\'s radiator assumptions (environment, ε, α, fin efficiency), so the published figure and the model can be compared at the same conditions.',
  'reported.solarArrayArea_m2':
    'A solar array area published for a real system, compared with the published radiator area. The ratio of the two is the "5:1" figure often quoted; the model\'s own ratio depends on the radiator area its heat path produces.',
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
    'Voltage of the power bus from the solar array to the payload. For a given loss, the copper needed scales as 1/V²: doubling the voltage quarters the harness mass. That is the "transformer" advantage electricity has; heat\'s nearest equivalent, a heat pump, costs power. In low orbit, high voltages also risk arcing to the surrounding plasma.',
  'power.pumpFraction':
    'Electrical power the coolant pumps draw, as a share of the payload. It is part of the bus load and ends as heat. Zero for passive heat-pipe Tiles.',
  'power.harnessOneWayLength_m':
    'Distance from the solar array to the load. Copper mass grows with its square for a fixed loss. Zero for Tiles that carry their own cells.',
  'tile.area_m2': 'Planform of one Tile. It sets how many Tiles a design needs, and so how much per-Tile mass it carries.',
  'tile.massPerTile_kg':
    'One rolled-up mass for everything a Tile carries except its compute modules and battery: heat-pipe panel, cells, converters, networking and structure. When set, it replaces those separate inputs.',
  'tile.networkingMass_kg': 'Networking hardware carried by every Tile. A centralized payload does not need it, so it is a penalty on the Tile cases.',
  'tile.extraMassPerUnit_kg':
    'Enclosure and mounting mass added for every compute module on the Tiles. A penalty that scales with compute; payload mass itself is out of scope for every case.',
  'tile.supportStructureFraction':
    'Hinges, booms and support structure, as a share of everything mounted on the Tiles: heat-pipe panels, cells, batteries, converters and networking. The pumped cases count this inside their areal densities.',
  'tile.converterSpecificMass_kg_per_kW':
    'Power converters mounted on the Tiles, per kW they carry: the step-down from the distribution bus, or the cell and battery regulation on a self-powered Tile.',
  'tile.peakDuration_h':
    'How long a self-powered Tile must hold its peak above the average on its own battery. Zero leaves that battery out, as the other cases do.',
  'tile.radiatorCoupling':
    'How a self-powered Tile sheds heat. "separate": a radiator smaller than the Tile sits behind the cells, insulated from them, and carries only the compute heat. "bonded": cells and radiator share one temperature and both faces radiate everything.',
  'tile.sunAngle_deg':
    'Angle between the Sun and the normal of a self-powered Tile. Face-on (0°) gives the most power per Tile and the hottest Tile; tilting away cools it and needs more Tiles.',
  'tile.cellAbsorptance': 'Share of sunlight the cell face absorbs. What is not turned into electricity heats the Tile.',
  'tile.cellEmissivity': 'Infrared emissivity of the cell face (its cover glass). The sunlit face still radiates: the Sun covers a tiny part of the sky it sees.',
  'tile.cellBackEmissivity': 'Infrared emissivity of the back of the cell panel where no radiator covers it.',
  'tile.cellLayerArealDensity_kg_m2': 'Cells, cover glass, wiring and their substrate per m² of Tile. It replaces the deployed solar array of the other cases.',
  'tile.cellTemperatureCoefficient_per_K':
    'Change in cell output per kelvin. Cells on a Tile run hotter than on a free-flying solar array, which radiates from both faces, and lose output in proportion.',
  'power.harnessLossFraction':
    'The resistive loss the copper harness is sized for, as a share of the power it carries. Designers pick the loss and size the copper to meet it; a lower target needs proportionally more copper. The lost power heats the wires, not the payload.',
  'power.battery.specificEnergy_Wh_kg':
    'Stored energy per kilogram of battery at pack level: cells, structure, wiring and thermal control. Battery mass is the dark-period energy divided by this and by the depth of discharge.',
  'power.battery.depthOfDischarge':
    'Share of the battery’s rated energy used each cycle. Thousands of short eclipses a year in low orbit force shallow cycling; one long lunar night a month allows deeper use. Shallower cycling means a heavier battery.',
};
