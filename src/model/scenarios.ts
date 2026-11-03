/**
 * Assumption sets ("modes"), heat sources, and environments, with a provenance note
 * on every number.
 *
 * Provenance tags used in notes:
 *   [source-id]  a reference in SOURCES below (primary where we could find one)
 *   ASSUMPTION   engineering judgement; replace with better data and cite it
 *   CALIBRATED   tuned so the model reproduces a published figure (named in the note)
 *   SECONDARY    widely quoted, but we have not confirmed it against a primary source
 *
 * A scenario is plain data. `buildScenario` composes one from a mode plus optional
 * heat-source and environment overrides. The model never reads anything else.
 */
import { MOON_SYNODIC_DAY_H, SILICON_K_360K_W_MK } from './constants.ts';
import type { CoolantId, Environment, HeatSource, Loop, ModeId, Power, Radiator, Scenario, Stage } from './types.ts';

export interface Source {
  title: string;
  url: string;
}

export const SOURCES: Record<string, Source> = {
  'nasa-atcs': {
    title: 'Boeing for NASA, "Active Thermal Control System (ATCS) Overview" (ISS)',
    url: 'https://www.nasa.gov/pdf/473486main_iss_atcs_overview.pdf',
  },
  'nasa-radiator-2026': {
    title: 'NASA/ICES 2026, ISS EATCS radiator face-sheet anomaly paper (Z93 paint, 8-panel radiators)',
    url: 'https://ntrs.nasa.gov/citations/20260002946',
  },
  'nasa-eps': {
    title: 'NASA, "Overview of International Space Station Electrical Power System" (NTRS 20160014034)',
    url: 'https://ntrs.nasa.gov/citations/20160014034',
  },
  'starmind-nbc': {
    title: 'Notebookcheck (2026), "SpaceX details AI1 satellite specs and cooling for Starmind"',
    url: 'https://www.notebookcheck.net/SpaceX-details-AI1-satellite-specs-and-cooling-for-Starmind-data-center-in-space.1340218.0.html',
  },
  'starmind-fcc': {
    title: "Let's Data Science (2026), \"SpaceX confirms Starmind, targets one million satellites\" (FCC filing, 500–2,000 km)",
    url: 'https://letsdatascience.com/news/spacex-confirms-starmind-targets-one-million-satellites-4cc7bcc9',
  },
  'rubin-ctee': {
    title: 'CTEE (2026), Vera Rubin NVL72 Max Q (~1.8 kW) / Max P (~2.3 kW) GPUs, microchannel cold plates',
    url: 'https://www.ctee.com.tw/news/20260722701589-430502',
  },
  'rubin-2crsi': {
    title: '2CRSI, "NVIDIA from Blackwell to Rubin: power and cooling" (45 °C coolant inlet)',
    url: 'https://2crsi.com/nvidia-from-blackwell-to-rubin-platforms-power-and-cooling',
  },
  mccalip: {
    title: 'A. McCalip, "Space Datacenters" (economics model) and source repository',
    url: 'https://andrewmccalip.com/space-datacenters',
  },
  'spacex-fcc-2022': {
    title: 'SpaceX letter to the FCC, Oct 4 2022, Exhibit B "Satellite Dimensions and DAS Outputs" (SAT-LOA-20200526-00055, SAT-AMD-20210818-00105; cited by the FCC in DA 24-1193 n.110). Copy hosted by J. McDowell',
    url: 'https://planet4589.org/astro/starsim/papers/StarGen2.pdf',
  },
  'starlink-v3': {
    title: 'Starlink, "Starlink V3 satellites" update page (V3 solar arrays ≈ 2× the power of V2)',
    url: 'https://starlink.com/updates/starlink-version-3-satellites',
  },
  'nvidia-800vdc': {
    title: 'NVIDIA, "800 VDC Architecture" for AI factories (terrestrial facility-to-rack power)',
    url: 'https://www.nvidia.com/en-us/data-center/technologies/800-vdc-architecture/',
  },
  'nasa-hdbk-4006a': {
    title: 'NASA-HDBK-4006A, Low Earth Orbit Spacecraft Charging Design Handbook (incl. §6.1 solar array arcing)',
    url: 'https://standards.nasa.gov/sites/default/files/standards/NASA/A/0/nasa-hdbk-4006a.pdf',
  },
  'nasa-factsheets': {
    title: 'NASA NSSDCA planetary fact sheets (Earth, Moon: radii, GM, Bond albedo, synodic period)',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
  },
  gilmore: {
    title: 'D. G. Gilmore (ed.), Spacecraft Thermal Control Handbook Vol. I, 2nd ed., Aerospace Press/AIAA, 2002',
    url: 'https://arc.aiaa.org/doi/book/10.2514/4.989117',
  },
  'williams2017': {
    title: 'Williams et al. (2017), "The global surface temperatures of the Moon as measured by Diviner", Icarus 283',
    url: 'https://doi.org/10.1016/j.icarus.2016.08.012',
  },
  'paige2010': {
    title: 'Paige et al. (2010), "Diviner observations of cold traps in the lunar south polar region", Science 330',
    url: 'https://doi.org/10.1126/science.1187726',
  },
  'mazarico2011': {
    title: 'Mazarico et al. (2011), "Illumination conditions of the lunar polar regions using LOLA topography", Icarus 211',
    url: 'https://doi.org/10.1016/j.icarus.2010.10.030',
  },
  'devos1980': {
    title: 'A. De Vos (1980), "Detailed balance limit of the efficiency of tandem solar cells", J. Phys. D 13, 839',
    url: 'https://doi.org/10.1088/0022-3727/13/5/018',
  },
  'glassbrenner1964': {
    title: 'Glassbrenner & Slack (1964), "Thermal conductivity of silicon and germanium", Phys. Rev. 134, A1058',
    url: 'https://doi.org/10.1103/PhysRev.134.A1058',
  },
};

// ---------------------------------------------------------------------------------
// Heat sources
// ---------------------------------------------------------------------------------

/** Rubin-class GPU package with an Earth-style lid. Values are representative, not vendor data. */
const GPU_LIDDED_STAGES: Stage[] = [
  { id: 'die', label: 'Silicon die', kind: 'conduction', thickness_m: 0.5e-3, conductivity_W_mK: SILICON_K_360K_W_MK, area_m2: 16e-4, factor: 1.5, lengthScale_m: 0.5e-3 },
  { id: 'tim1', label: 'TIM1 (indium / solder)', kind: 'interface', arealResistance_Km2_W: 0.05e-4, area_m2: 16e-4, lengthScale_m: 0.05e-3 },
  { id: 'lid', label: 'Copper lid (spreading)', kind: 'conduction', thickness_m: 3e-3, conductivity_W_mK: 390, area_m2: 25e-4, lengthScale_m: 3e-3 },
  { id: 'tim2', label: 'TIM2 (lid to cold plate)', kind: 'interface', arealResistance_Km2_W: 0.08e-4, area_m2: 40e-4, lengthScale_m: 0.1e-3 },
  { id: 'coldplate', label: 'Microchannel cold plate to coolant', kind: 'convection', h_W_m2K: 50000, area_m2: 40e-4, lengthScale_m: 3e-3 },
];

/** Same silicon, lid and TIMs removed, coolant boiling directly on a thinned die backside. */
const GPU_DIRECT_DIE_STAGES: Stage[] = [
  { id: 'die', label: 'Thinned silicon die', kind: 'conduction', thickness_m: 0.3e-3, conductivity_W_mK: SILICON_K_360K_W_MK, area_m2: 16e-4, factor: 1.5, lengthScale_m: 0.3e-3 },
  { id: 'boiling', label: 'Flow boiling on die backside', kind: 'convection', h_W_m2K: 150000, area_m2: 16e-4, lengthScale_m: 1e-3 },
];

const GPU_NOTES: Record<string, string> = {
  'heatSource.unitPower_W': 'Rubin "Max Q" GPU ≈ 1.8 kW; "Max P" ≈ 2.3 kW [rubin-ctee]. SECONDARY (pre-launch reporting).',
  'heatSource.totalPower_W': 'Starmind AI1 reported 120 kW average, 150 kW peak compute [starmind-nbc]. Used for every mode so modes compare technology, not payload.',
  'heatSource.maxTemperature_K': '373 K (100 °C) junction: the premise that the chips run reliably this hot. HBM DRAM may set a lower limit. ASSUMPTION.',
  'heatSource.stages': 'Die 0.5 mm Si (k ≈ 120 W/m·K near 360 K [glassbrenner1964]) over ~16 cm² (two reticle-sized dies), ×1.5 hot-spot peaking; TIM1 0.05 K·cm²/W; 3 mm Cu lid; TIM2 0.08 K·cm²/W over 40 cm²; microchannel h_eff 50 kW/m²K. ASSUMPTION, sanity-checked: with a 45 °C inlet [rubin-2crsi] and a 10 K coolant rise, this stack puts the junction at ~86 °C (1.8 kW) to ~94 °C (2.3 kW).',
};

export interface HeatSourcePreset {
  label: string;
  /** Coolant that suits this source's temperature; applied when the source is selected. */
  loopCoolant: CoolantId;
  heatSource: HeatSource;
  notes: Record<string, string>;
}

export const HEAT_SOURCES: Record<string, HeatSourcePreset> = {
  'gpu-lidded': {
    label: 'AI accelerator, lidded (Rubin-class, Earth-style cold plate)',
    loopCoolant: 'water',
    heatSource: { name: 'Rubin-class GPU (lidded)', maxTemperature_K: 373, unitPower_W: 1800, totalPower_W: 150e3, stages: GPU_LIDDED_STAGES },
    notes: GPU_NOTES,
  },
  'gpu-direct-die': {
    label: 'AI accelerator, direct-die two-phase',
    loopCoolant: 'twoPhaseAmmonia',
    heatSource: { name: 'Rubin-class GPU (direct-die)', maxTemperature_K: 373, unitPower_W: 1800, totalPower_W: 150e3, stages: GPU_DIRECT_DIE_STAGES },
    notes: {
      ...GPU_NOTES,
      'heatSource.stages': 'Die thinned to 0.3 mm with ×1.5 peaking; no lid, no TIMs; flow boiling h_eff 150 kW/m²K on the die footprint. ASSUMPTION (aggressive, not flight-proven at this power).',
    },
  },
  'isothermal-limit': {
    label: 'Physics limit: no interface drops (radiator at source temperature)',
    loopCoolant: 'twoPhaseAmmonia',
    heatSource: { name: 'Isothermal source', maxTemperature_K: 373, unitPower_W: 1800, totalPower_W: 150e3, stages: [] },
    notes: { ...GPU_NOTES, 'heatSource.stages': 'No stages: the radiator runs at the source temperature. A bound, not a design.' },
  },
  'process-600K': {
    label: 'Industrial process waste heat at 600 K (e.g. refining, power conversion)',
    loopCoolant: 'nak78',
    heatSource: {
      name: 'Process heat, 600 K',
      maxTemperature_K: 600,
      unitPower_W: 150e3,
      totalPower_W: 150e3,
      stages: [{ id: 'processHx', label: 'Process to coolant heat exchanger', kind: 'deltaT', deltaT_K: 20, lengthScale_m: 0.05 }],
    },
    notes: {
      'heatSource.maxTemperature_K': 'Generic mid-temperature process. The point: radiator flux grows as T⁴, so hot waste heat is cheap to reject. ASSUMPTION.',
      'heatSource.stages': '20 K approach in the process heat exchanger. ASSUMPTION.',
      'heatSource.totalPower_W': 'Same 150 kW as the compute cases, for comparison. ASSUMPTION.',
    },
  },
};

// ---------------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------------

export interface EnvironmentPreset {
  short: string;
  label: string;
  environment: Environment;
  notes: Record<string, string>;
}

export const ENVIRONMENTS: Record<string, EnvironmentPreset> = {
  'iss-leo': {
    short: 'LEO 420 km (ISS)',
    label: 'LEO 420 km, β = 0° (ISS-like, worst eclipse)',
    environment: { kind: 'orbit', body: 'earth', altitude_km: 420, beta_deg: 0 },
    notes: { 'environment.beta_deg': 'ISS β angle ranges roughly ±75°; β = 0 is the longest-eclipse case. ASSUMPTION.' },
  },
  'leo-600': {
    short: 'LEO 600 km',
    label: 'LEO 600 km, terminator-like (β = 70°)',
    environment: { kind: 'orbit', body: 'earth', altitude_km: 600, beta_deg: 70 },
    notes: {
      'environment.altitude_km': 'AI1 reported at ~600 km; FCC filing spans 500–2,000 km [starmind-nbc][starmind-fcc]. SECONDARY.',
      'environment.beta_deg': 'Orbit plane not published. β = 70° (eclipse-free at 600 km, little albedo) is an ASSUMPTION.',
    },
  },
  'llo-100': {
    short: 'Low lunar orbit',
    label: 'Low lunar orbit 100 km, β = 0°',
    environment: { kind: 'orbit', body: 'moon', altitude_km: 100, beta_deg: 0 },
    notes: { 'environment.altitude_km': 'Typical low lunar orbit. Lunar IR uses the global mean; real dayside loads are ~4× higher [williams2017].' },
  },
  'cislunar-deep': {
    short: 'Cislunar deep space',
    label: 'Cislunar deep space (NRHO / Earth–Moon L-points)',
    environment: { kind: 'deepSpace', sunlitFraction: 1, cyclePeriod_h: 156 },
    notes: {
      'environment.sunlitFraction': 'Far from both bodies, radiators see ~3 K sky and the Sun is nearly always up. NRHO-class orbits are chosen to avoid most eclipses (≈6.5-day period). ASSUMPTION: eclipse-free.',
    },
  },
  'moon-equator': {
    short: 'Moon equator, noon',
    label: 'Lunar surface, equator at noon (sizing case), 14-day night',
    environment: {
      kind: 'surface',
      body: 'moon',
      groundTemperature_K: 390,
      groundEmissivity: 0.95,
      groundAlbedo: 0.11,
      sunElevation_deg: 90,
      sunlitFraction: 0.5,
      cyclePeriod_h: MOON_SYNODIC_DAY_H,
    },
    notes: {
      'environment.groundTemperature_K': 'Equatorial noon regolith ≈ 390 K; night ≈ 95 K [williams2017]. Noon is the radiator sizing case.',
      'environment.sunlitFraction': 'Half of each 29.53-day synodic day is dark [nasa-factsheets]: ~354 h of storage.',
    },
  },
  'moon-polar': {
    short: 'Moon polar ridge',
    label: 'Lunar surface, polar ridge (low Sun, long daylight)',
    environment: {
      kind: 'surface',
      body: 'moon',
      groundTemperature_K: 220,
      groundEmissivity: 0.95,
      groundAlbedo: 0.11,
      sunElevation_deg: 2,
      sunlitFraction: 0.85,
      cyclePeriod_h: MOON_SYNODIC_DAY_H,
    },
    notes: {
      'environment.groundTemperature_K': 'Sunlit polar terrain at grazing Sun ≈ 200–250 K, cold traps far colder [paige2010]. 220 K is an ASSUMPTION.',
      'environment.sunlitFraction': 'Best polar ridge sites are illuminated ~80–90 % of the year [mazarico2011]. 0.85 is an ASSUMPTION; dark periods are irregular, not one per synodic day.',
    },
  },
};

// ---------------------------------------------------------------------------------
// Modes: technology and assumption sets
// ---------------------------------------------------------------------------------

export interface ModePreset {
  name: string;
  summary: string;
  heatSource: string;
  environment: string;
  loop: Loop;
  radiator: Radiator;
  power: Power;
  reported?: { radiatorArea_m2: number };
  notes: Record<string, string>;
}

export const MODES: Record<ModeId, ModePreset> = {
  iss: {
    name: 'ISS heritage',
    summary:
      "Today's flight-proven architecture: a water loop held at crew-friendly temperatures, an intermediate heat exchanger, single-phase ammonia radiators, silicon solar arrays, a 124 V bus.",
    heatSource: 'gpu-lidded',
    environment: 'iss-leo',
    loop: { coolant: 'ammonia', transportDrop_K: 1, transportLength_m: 30, hxApproach_K: 10, rise_K: 51, coolantCap_K: 295 },
    radiator: { orientation: 'edgeOn', emissivity: 0.92, solarAbsorptance: 0.17, finEfficiency: 0.85, arealDensity_kg_m2: 14.2, sizingMargin: 1.8, loopSpecificMass_kg_per_kW: 22.1 },
    power: {
      cellEfficiency: 0.145,
      packingFactor: 0.8,
      operatingFactor: 0.75,
      solarArrayArealDensity_kg_m2: 3.5,
      conversionEfficiency: 0.9,
      overheadFraction: 0.05,
      pumpFraction: 0.02,
      busVoltage_V: 124,
      harnessOneWayLength_m: 30,
      harnessLossFraction: 0.02,
      battery: { roundTripEfficiency: 0.9, depthOfDischarge: 0.35, specificEnergy_Wh_kg: 100 },
    },
    notes: {
      'loop.coolantCap_K': 'ISS Moderate Temperature Loop runs at 17 °C (63 °F) [nasa-atcs]; +5 K rise across cold plates is an ASSUMPTION. Electronics run far below their limit.',
      'loop.hxApproach_K': 'Interface heat exchanger, water to ammonia; ammonia supply set at 2.8 °C (37 °F) [nasa-atcs]. 10 K approach is an ASSUMPTION.',
      'loop.rise_K': 'Radiator outlet goal −40 °F (233 K) [nasa-atcs]: 284 K inlet minus 51 K.',
      'loop.coolant': 'Single-phase anhydrous ammonia, nominally 2.62 MPa at 275 K [nasa-atcs].',
      'radiator.emissivity': 'Z-93 white paint, ε ≈ 0.92, α ≈ 0.17 at beginning of life [gilmore][nasa-radiator-2026].',
      'radiator.solarAbsorptance': 'Z-93 BOL α ≈ 0.17; rises as it degrades [gilmore].',
      'radiator.finEfficiency': '0.85: ASSUMPTION (aluminium honeycomb, 22 tubes per panel [nasa-radiator-2026]).',
      'radiator.arealDensity_kg_m2': 'Radiator ORU: 1,122.64 kg over 23.3 m × 3.4 m = 14.2 kg/m², including deployment mechanism [nasa-atcs].',
      'radiator.sizingMargin': 'CALIBRATED (1.80): makes this model reproduce the EATCS 70 kW rating on 6 radiator ORUs of 23.3 m × 3.4 m (475 m²) [nasa-atcs]. Lumps hot-case environment, coating degradation, flow distribution and reserve. See test/system.test.ts.',
      'radiator.loopSpecificMass_kg_per_kW': 'Pump Module 353.8 kg + rotary joint (TRRJ) 420.5 kg per 35 kW loop [nasa-atcs]. Excludes lines and heat exchangers.',
      'radiator.orientation': 'Radiators rotate edge-to-Sun in sunlight [nasa-atcs], so they see Earth edge-on.',
      'power.cellEfficiency': 'ISS silicon cells ≈ 14.5 %. SECONDARY.',
      'power.operatingFactor': 'CALIBRATED: 32,800 cells per wing deliver ~31 kW at BOL [nasa-eps], taking 8 × 8 cm cells (SECONDARY).',
      'power.packingFactor': 'Blanket area per cell area. ASSUMPTION.',
      'power.solarArrayArealDensity_kg_m2': 'ASSUMPTION: no primary figure found for solar array wing mass. Contributors: please replace.',
      'power.busVoltage_V': '160 V primary / 124 V secondary DC. SECONDARY.',
      'power.harnessLossFraction': 'Copper sized for 2 % I²R loss at the 124 V heritage bus. ASSUMPTION.',
      'power.battery.depthOfDischarge': '~5,600 cycles per year in LEO limits depth of discharge. ASSUMPTION.',
      'power.battery.specificEnergy_Wh_kg': 'Pack-level including enclosure (ISS Li-ion ORUs). ASSUMPTION.',
    },
  },
  starmind: {
    name: 'SpaceX Starmind (reported)',
    summary:
      'Reported AI1 numbers (150 kW peak, 110 m² liquid radiators, ~600 km) with an Earth-style lidded Rubin package and a single-phase pumped loop. Unpublished values are labelled ASSUMPTION.',
    heatSource: 'gpu-lidded',
    environment: 'leo-600',
    loop: { coolant: 'water', transportDrop_K: 1, transportLength_m: 20, hxApproach_K: 0, rise_K: 10, coolantCap_K: null },
    radiator: { orientation: 'edgeOn', emissivity: 0.9, solarAbsorptance: 0.2, finEfficiency: 0.9, arealDensity_kg_m2: 6, sizingMargin: 1.25, loopSpecificMass_kg_per_kW: 5 },
    power: {
      cellEfficiency: 0.22,
      packingFactor: 0.9,
      operatingFactor: 0.9,
      solarArrayArealDensity_kg_m2: 2.0,
      conversionEfficiency: 0.95,
      overheadFraction: 0.03,
      pumpFraction: 0.01,
      busVoltage_V: 800,
      harnessOneWayLength_m: 35,
      harnessLossFraction: 0.01,
      battery: { roundTripEfficiency: 0.92, depthOfDischarge: 0.3, specificEnergy_Wh_kg: 150 },
    },
    reported: { radiatorArea_m2: 110 },
    notes: {
      'reported.radiatorArea_m2': '"Liquid radiators of 110 m²" for 120 kW average / 150 kW peak [starmind-nbc]. Taken as two-sided panel planform area. SECONDARY.',
      'loop.hxApproach_K': '"Redundant pumped loops" reported [starmind-nbc]. Modelled as one loop with no intermediate heat exchanger: ASSUMPTION.',
      'loop.rise_K': '10 K coolant rise. ASSUMPTION.',
      'radiator.arealDensity_kg_m2': 'ASSUMPTION: modern deployable radiator, lighter than ISS.',
      'radiator.sizingMargin': 'ASSUMPTION.',
      'power.cellEfficiency': 'Silicon-class cells, as in McCalip\'s model (22 %) [mccalip]. ASSUMPTION: SpaceX has not published Starlink cell type, efficiency or power. Cross-check (model arithmetic): at these settings the 104.96 m² of solar array SpaceX filed for its F9-2 design, the Falcon 9 "V2 Mini" [spacex-fcc-2022], would deliver about 25 kW in sunlight. SpaceX says V3 arrays generate about twice the power of V2 [starlink-v3].',
      'power.solarArrayArealDensity_kg_m2': 'ASSUMPTION. SpaceX filed 800 kg and 2 × 12.8 m × 4.1 m of solar array for F9-2, and 2,000 kg with 256.94 m² for its Starship-launched design, as debris-model inputs [spacex-fcc-2022]; how that mass splits between solar array and the rest is not public.',
      'power.busVoltage_V': 'ASSUMPTION borrowed from terrestrial practice: AI data centers are moving to 800 V DC distribution [nvidia-800vdc]. Not space heritage: the ISS runs 160 V primary / 124 V secondary, and high-voltage solar arrays in low orbit risk arcing to the surrounding plasma unless designed for it [nasa-hdbk-4006a]. Starlink and Starmind bus voltages are not public. Here it sets the copper mass needed for the harness loss target, not the radiator.',
      'power.harnessLossFraction': 'Copper sized for 1 % I²R loss: a common design target. ASSUMPTION.',
    },
  },
  ideal: {
    name: 'Ideal engineering',
    summary:
      'Best plausible near-term engineering: direct-die two-phase cooling, a single isothermal loop, optical-solar-reflector coatings, multi-junction cells, light heat-pipe radiators.',
    heatSource: 'gpu-direct-die',
    environment: 'leo-600',
    loop: { coolant: 'twoPhaseAmmonia', transportDrop_K: 0.5, transportLength_m: 20, hxApproach_K: 0, rise_K: 0, coolantCap_K: null },
    radiator: { orientation: 'edgeOn', emissivity: 0.92, solarAbsorptance: 0.1, finEfficiency: 0.93, arealDensity_kg_m2: 3, sizingMargin: 1.15, loopSpecificMass_kg_per_kW: 3 },
    power: {
      cellEfficiency: 0.3,
      packingFactor: 0.9,
      operatingFactor: 0.9,
      solarArrayArealDensity_kg_m2: 1.0,
      conversionEfficiency: 0.97,
      overheadFraction: 0.02,
      pumpFraction: 0.005,
      busVoltage_V: 800,
      harnessOneWayLength_m: 35,
      harnessLossFraction: 0.01,
      battery: { roundTripEfficiency: 0.95, depthOfDischarge: 0.8, specificEnergy_Wh_kg: 250 },
    },
    notes: {
      'loop.rise_K': 'Two-phase: heat is carried as latent heat at constant temperature. ASSUMPTION.',
      'radiator.solarAbsorptance': 'Optical solar reflector class coatings, α ≈ 0.1 [gilmore].',
      'radiator.arealDensity_kg_m2': 'ASSUMPTION: heat-pipe or composite panels.',
      'power.cellEfficiency': 'Space multi-junction cells ≈ 30 % at BOL. ASSUMPTION.',
      'power.solarArrayArealDensity_kg_m2': 'ASSUMPTION: flexible roll-out solar array.',
    },
  },
  physics: {
    name: 'Limited by physics',
    summary:
      'Only physics binds: radiator at the source temperature, black surfaces, perfect fins, detailed-balance solar cells. Areal densities have no physical floor; the values here are placeholders.',
    heatSource: 'isothermal-limit',
    environment: 'leo-600',
    loop: { coolant: 'twoPhaseAmmonia', transportDrop_K: 0, transportLength_m: 20, hxApproach_K: 0, rise_K: 0, coolantCap_K: null },
    radiator: { orientation: 'edgeOn', emissivity: 1, solarAbsorptance: 0, finEfficiency: 1, arealDensity_kg_m2: 1, sizingMargin: 1, loopSpecificMass_kg_per_kW: 0.5 },
    power: {
      cellEfficiency: 0.687,
      packingFactor: 1,
      operatingFactor: 1,
      solarArrayArealDensity_kg_m2: 0.3,
      conversionEfficiency: 0.99,
      overheadFraction: 0,
      pumpFraction: 0,
      busVoltage_V: 800,
      harnessOneWayLength_m: 35,
      harnessLossFraction: 0.01,
      battery: { roundTripEfficiency: 1, depthOfDischarge: 1, specificEnergy_Wh_kg: 500 },
    },
    notes: {
      'power.cellEfficiency': 'Detailed-balance limit for infinitely many junctions in unconcentrated sunlight, 68.7 % [devos1980].',
      'radiator.arealDensity_kg_m2': 'No physical floor exists. Placeholder for gossamer structures.',
      'power.solarArrayArealDensity_kg_m2': 'No physical floor exists. Placeholder.',
      'power.battery.specificEnergy_Wh_kg': 'Placeholder.',
    },
  },
};

/** Compose a runnable scenario from a mode, optionally swapping heat source or environment. */
export function buildScenario(modeId: ModeId, choices: { heatSource?: string; environment?: string } = {}): Scenario {
  const mode = MODES[modeId];
  const hsId = choices.heatSource ?? mode.heatSource;
  const envId = choices.environment ?? mode.environment;
  const hs = HEAT_SOURCES[hsId];
  const env = ENVIRONMENTS[envId];
  if (!hs) throw new Error(`unknown heat source: ${hsId}`);
  if (!env) throw new Error(`unknown environment: ${envId}`);
  const loop = structuredClone(mode.loop);
  if (hsId !== mode.heatSource) loop.coolant = hs.loopCoolant;
  const ownCase = hsId === mode.heatSource && envId === mode.environment;
  return {
    mode: modeId,
    name: mode.name,
    summary: mode.summary,
    heatSourceId: hsId,
    environmentId: envId,
    heatSource: structuredClone(hs.heatSource),
    environment: structuredClone(env.environment),
    loop,
    radiator: structuredClone(mode.radiator),
    power: structuredClone(mode.power),
    reported: mode.reported && ownCase ? structuredClone(mode.reported) : null,
    notes: { ...hs.notes, ...env.notes, ...mode.notes },
  };
}

// ---------------------------------------------------------------------------------
// Tunable parameters: drive the sliders and the tornado chart
// ---------------------------------------------------------------------------------

/**
 * The model's parts (see assets/system-diagram.svg). 'shared' inputs feed more than one
 * part: the heat load (radiator and power supply) and the location (what the radiator
 * sees, and how much sunlight the solar array gets).
 */
export type Part = 'shared' | 'heatPath' | 'radiator' | 'power';

export interface Param {
  path: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Multiply the stored value for display (e.g. W → kW). */
  display?: number;
  /** Which part of the model the input belongs to; the page shows it beside that part's charts. */
  part: Part;
  group: string;
  /** Only shown when true. */
  when?: (s: Scenario) => boolean;
  /** ± step for the sensitivity chart, in stored units (or a fraction when `relative`). */
  tornadoStep?: number;
  relative?: boolean;
}

export const PARAMETERS: Param[] = [
  { part: 'shared', group: 'Load', path: 'heatSource.totalPower_W', label: 'Total heat load', unit: 'kW', display: 1e-3, min: 10e3, max: 2e6, step: 10e3 },
  { part: 'shared', group: 'Load', path: 'power.conversionEfficiency', label: 'Bus-to-payload conversion', unit: '', min: 0.7, max: 1, step: 0.005, tornadoStep: 0.02 },
  { part: 'shared', group: 'Location', path: 'environment.altitude_km', label: 'Altitude', unit: 'km', min: 100, max: 40000, step: 10, when: (s) => s.environment.kind === 'orbit' },
  { part: 'shared', group: 'Location', path: 'environment.beta_deg', label: 'Beta angle β', unit: '°', min: 0, max: 90, step: 1, when: (s) => s.environment.kind === 'orbit' },
  { part: 'shared', group: 'Location', path: 'environment.groundTemperature_K', label: 'Ground temperature', unit: 'K', min: 80, max: 400, step: 1, when: (s) => s.environment.kind === 'surface', tornadoStep: 20 },
  { part: 'shared', group: 'Location', path: 'environment.sunElevation_deg', label: 'Sun elevation', unit: '°', min: 0, max: 90, step: 1, when: (s) => s.environment.kind === 'surface' },
  { part: 'shared', group: 'Location', path: 'environment.sunlitFraction', label: 'Sunlit fraction', unit: '', min: 0.05, max: 1, step: 0.01, when: (s) => s.environment.kind !== 'orbit' },
  { part: 'heatPath', group: 'Heat source', path: 'heatSource.maxTemperature_K', label: 'Source temperature limit', unit: 'K', min: 300, max: 1000, step: 1, tornadoStep: 10 },
  { part: 'heatPath', group: 'Heat source', path: 'heatSource.unitPower_W', label: 'Power per package', unit: 'kW', display: 1e-3, min: 200, max: 5000, step: 50, tornadoStep: 0.2, relative: true, when: (s) => s.heatSource.stages.some((st) => st.kind !== 'deltaT') },
  { part: 'heatPath', group: 'Coolant loop', path: 'loop.transportDrop_K', label: 'Transport line drop', unit: 'K', min: 0, max: 10, step: 0.5 },
  { part: 'heatPath', group: 'Coolant loop', path: 'loop.hxApproach_K', label: 'Intermediate heat exchanger approach', unit: 'K', min: 0, max: 30, step: 1, tornadoStep: 5 },
  { part: 'heatPath', group: 'Coolant loop', path: 'loop.rise_K', label: 'Coolant rise / radiator glide', unit: 'K', min: 0, max: 80, step: 1, tornadoStep: 5 },
  { part: 'radiator', group: 'Radiator surface', path: 'radiator.emissivity', label: 'IR emissivity ε', unit: '', min: 0.05, max: 1, step: 0.01, tornadoStep: 0.05 },
  { part: 'radiator', group: 'Radiator surface', path: 'radiator.solarAbsorptance', label: 'Solar absorptance α', unit: '', min: 0, max: 0.6, step: 0.01, tornadoStep: 0.05 },
  { part: 'radiator', group: 'Radiator surface', path: 'radiator.finEfficiency', label: 'Fin efficiency η', unit: '', min: 0.5, max: 1, step: 0.01, tornadoStep: 0.05 },
  { part: 'radiator', group: 'Sizing and mass', path: 'radiator.sizingMargin', label: 'Sizing margin', unit: '×', min: 1, max: 2.5, step: 0.05, tornadoStep: 0.1 },
  { part: 'radiator', group: 'Sizing and mass', path: 'radiator.arealDensity_kg_m2', label: 'Radiator areal density', unit: 'kg/m²', min: 0.5, max: 25, step: 0.1, tornadoStep: 0.2, relative: true },
  { part: 'power', group: 'Solar array & bus', path: 'power.cellEfficiency', label: 'Cell efficiency', unit: '', min: 0.1, max: 0.7, step: 0.005, tornadoStep: 0.1, relative: true },
  { part: 'power', group: 'Solar array & bus', path: 'power.operatingFactor', label: 'Solar array operating factor', unit: '', min: 0.5, max: 1, step: 0.01 },
  { part: 'power', group: 'Solar array & bus', path: 'power.solarArrayArealDensity_kg_m2', label: 'Solar array areal density', unit: 'kg/m²', min: 0.2, max: 8, step: 0.1, tornadoStep: 0.2, relative: true },
  { part: 'power', group: 'Solar array & bus', path: 'power.busVoltage_V', label: 'Bus voltage', unit: 'V', min: 28, max: 3000, step: 1, tornadoStep: 0.5, relative: true },
  { part: 'power', group: 'Solar array & bus', path: 'power.harnessLossFraction', label: 'Harness loss target', unit: '', min: 0.002, max: 0.1, step: 0.001, tornadoStep: 0.5, relative: true },
  { part: 'power', group: 'Energy storage', path: 'power.battery.specificEnergy_Wh_kg', label: 'Battery specific energy', unit: 'Wh/kg', min: 50, max: 600, step: 10, tornadoStep: 0.2, relative: true },
  { part: 'power', group: 'Energy storage', path: 'power.battery.depthOfDischarge', label: 'Battery depth of discharge', unit: '', min: 0.1, max: 1, step: 0.05 },
];
