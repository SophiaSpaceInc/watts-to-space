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
import type { CoolantId, Environment, HeatSource, Loop, ModeId, Power, Radiator, Scenario, Stage, Tile } from './types.ts';

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
  'spacex-starmind': {
    title: 'SpaceX, Starmind (AI1) page: "Up to 250 kW peak / 175 kW average", Solar Array 210 kW at 250 W/m², 160 m² deployable liquid radiator, 75 kW / ton (values since 2026-08-04)',
    url: 'https://www.spacex.com/spacexsi/starmind',
  },
  'spacex-starmind-2026-08-03': {
    title: 'SpaceX Starmind page as archived 2026-08-03 (earlier sheet: 150 kW peak / 120 kW average, 150 kW array, 110 m² radiator, 70 kW / ton)',
    url: 'https://web.archive.org/web/20260803190611/https://www.spacex.com/spacexai/starmind',
  },
  'spacex-fcc-2026-09': {
    title: 'SpaceX ex parte letter to the FCC, 2026-09-16 (SAT-LOA-20260108-00016): Starmind enveloping dimensions and orbits',
    url: 'https://api-prod.fcc.gov/icfs-attachment/exp/api/v1/a81df57a93db4f10ac9c39bfa8373c08',
  },
  'spacex-s1': {
    title: 'SpaceX Form S-1, 2026-05-20 ("approximately 100 kW of compute power per ton"; dawn-dusk sun-synchronous constellation)',
    url: 'https://www.sec.gov/Archives/edgar/data/1181412/000162828026036936/spaceexplorationtechnologi.htm',
  },
  'spacex-0608': {
    title: 'SpaceX AI-satellite technical update on X, 2026-06-08, with Elon Musk and Ian Dahl. Musk, about 16:53–17:26: 250 W/m² solar array; about 1,400 W/m² from double-sided radiators oriented knife-edge to the Sun',
    url: 'https://x.com/SpaceX/status/2064099405758906727',
  },
  'mach33-250kw': {
    title: 'Mach33, "The Engineering Paths Behind StarMind\'s 250 kW Target" (interactive, October 6, 2026 model pack): about 327 m² of radiator holds 105 °C GPU logic and 95 °C HBM at 250 kW; at 200 m² they reach about 134 °C and 132 °C',
    url: 'https://research.33fg.com/analysis/the-engineering-paths-behind-starmind-s-250-kw-target-117a100b-5f3b-4429-8042-916a5516cd2c',
  },
  'musk-1102': {
    title: 'Elon Musk on X, 2026-11-03: "~1300 W/m^2 is easily achievable for an aluminum radiator pointed away from the Sun"',
    url: 'https://x.com/elonmusk/status/2117462581371719779',
  },
  'musk-0715': {
    title: 'Elon Musk on X, 2026-07-15: AI Sat V1 peak power "raised to ~250kW (battery-assisted), with average power of ~160kW"',
    url: 'https://x.com/elonmusk/status/2077626509615829213',
  },
  'musk-1001b': {
    title: 'Elon Musk on X, 2026-10-01: hopes to run the SpaceX VR72 "at close to 250kW average power, meaning peak power would be ~10% higher"',
    url: 'https://x.com/elonmusk/status/2105749349166661848',
  },
  'musk-1001': {
    title: 'Elon Musk on X, 2026-10-01: each Starmind spacecraft "will have over 250kW of solar power" (the Starmind page says 210 kW)',
    url: 'https://x.com/elonmusk/status/2105718806769512812',
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
  'thor-tdg': {
    title: 'NVIDIA, Jetson Thor Series Modules Thermal Design Guide, TDG-12271-001 v1.2 (March 2026): T5000 130 W in MaxN mode, recommended SoC temperature 90 °C (maximum 115 °C), θjp 0.180 °C/W (balanced) / 0.231 °C/W (unbalanced), 62.5 × 81.4 mm contact area. Distributed through the Jetson Download Center.',
    url: 'https://developer.nvidia.com/embedded/downloads',
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

/**
 * Jetson Thor (T5000) module as NVIDIA ships it: SoC to the module's thermal transfer
 * plate (TTP), then a thermal interface to a heat-pipe panel, then the panel's evaporator.
 */
const THOR_TTP_STAGES: Stage[] = [
  { id: 'module', label: 'Thor SoC to transfer plate (θjp)', kind: 'resistance', resistance_K_W: 0.18, lengthScale_m: 5e-3 },
  { id: 'tim', label: 'Interface, plate to heat-pipe panel', kind: 'interface', arealResistance_Km2_W: 0.2e-4, area_m2: 62.5e-3 * 81.4e-3, lengthScale_m: 0.1e-3 },
  { id: 'evaporator', label: 'Heat-pipe evaporator', kind: 'convection', h_W_m2K: 20000, area_m2: 62.5e-3 * 81.4e-3, lengthScale_m: 2e-3 },
];

/** The same module with the transfer plate removed and the SoC lid bonded to the heat-pipe panel. */
const THOR_DIRECT_STAGES: Stage[] = [
  { id: 'die', label: 'Silicon die', kind: 'conduction', thickness_m: 0.5e-3, conductivity_W_mK: SILICON_K_360K_W_MK, area_m2: 4.5e-4, factor: 1.5, lengthScale_m: 0.5e-3 },
  { id: 'tim', label: 'Interface, SoC to heat-pipe panel', kind: 'interface', arealResistance_Km2_W: 0.1e-4, area_m2: 4.5e-4, lengthScale_m: 0.1e-3 },
  { id: 'evaporator', label: 'Heat-pipe evaporator', kind: 'convection', h_W_m2K: 20000, area_m2: 4.5e-4, lengthScale_m: 2e-3 },
];

const THOR_NOTES: Record<string, string> = {
  'heatSource.maxTemperature_K': 'ASSUMPTION (Sophia Space): 100 °C, close to the 373 K limit of the Rubin-class cases so the architectures compare on equal terms. NVIDIA recommends 90 °C for the Thor SoC (reliability rated for 95 % of life there), allows operation to 115 °C and shuts down at 118 °C [thor-tdg].',
  'heatSource.unitPower_W': 'Jetson T5000 total module power in MaxN mode, 130 W [thor-tdg].',
  'heatSource.totalPower_W': 'Same payload as the Starmind case, 250 kW peak [spacex-starmind], so the cases compare architecture, not payload. ASSUMPTION for a Tile system.',
  'heatSource.averageFraction': 'Same 0.7 as the Starmind case [spacex-starmind]. ASSUMPTION for a Tile system.',
};

const GPU_NOTES: Record<string, string> = {
  'heatSource.unitPower_W': 'Rubin "Max Q" GPU ≈ 1.8 kW; "Max P" ≈ 2.3 kW [rubin-ctee]. SECONDARY (pre-launch reporting).',
  'heatSource.totalPower_W': 'AI1 compute payload "Up to 250 kW peak / 175 kW average" [spacex-starmind], up from 150 / 120 kW before 2026-08-04 [spacex-starmind-2026-08-03]. Used for every mode so modes compare technology, not payload.',
  'heatSource.averageFraction': '175 kW average / 250 kW peak = 0.7 [spacex-starmind]; the earlier sheet gave 120 / 150 = 0.8 [spacex-starmind-2026-08-03]. Musk calls the peak "battery-assisted" with an average of ~160 kW [musk-0715], and has since hoped for "close to 250kW average", the peak ~10 % higher [musk-1001b]. The published average is moving; the page value is used.',
  'heatSource.maxTemperature_K': '373 K (100 °C) junction: the premise that the chips run reliably this hot. ASSUMPTION. HBM memory may set a lower limit: Mach33\'s independent model compares against 105 °C for GPU logic and 95 °C for HBM [mach33-250kw] (SECONDARY).',
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
    heatSource: { name: 'Rubin-class GPU (lidded)', maxTemperature_K: 373, unitPower_W: 1800, totalPower_W: 250e3, averageFraction: 0.7, stages: GPU_LIDDED_STAGES },
    notes: GPU_NOTES,
  },
  'gpu-direct-die': {
    label: 'AI accelerator, direct-die two-phase',
    loopCoolant: 'twoPhaseAmmonia',
    heatSource: { name: 'Rubin-class GPU (direct-die)', maxTemperature_K: 373, unitPower_W: 1800, totalPower_W: 250e3, averageFraction: 0.7, stages: GPU_DIRECT_DIE_STAGES },
    notes: {
      ...GPU_NOTES,
      'heatSource.stages': 'Die thinned to 0.3 mm with ×1.5 peaking; no lid, no TIMs; flow boiling h_eff 150 kW/m²K on the die footprint. ASSUMPTION (aggressive, not flight-proven at this power).',
    },
  },
  'thor-ttp': {
    label: 'Jetson Thor module on its transfer plate, on a heat-pipe panel',
    loopCoolant: 'passiveHeatPipe',
    heatSource: { name: 'Jetson Thor (transfer plate)', maxTemperature_K: 373.15, unitPower_W: 130, totalPower_W: 250e3, averageFraction: 0.7, stages: THOR_TTP_STAGES },
    notes: {
      ...THOR_NOTES,
      'heatSource.stages': 'SoC to transfer plate θjp = 0.180 °C/W for a balanced workload (0.231 unbalanced) over the 62.5 × 81.4 mm contact area [thor-tdg]: 23 K at 130 W. The guide also limits the plate to 80 °C; at a 100 °C junction this stack leaves the plate near 77 °C. Interface 0.2 K·cm²/W and evaporator h 20 kW/m²K over that area: ASSUMPTION.',
    },
  },
  'thor-direct': {
    label: 'Jetson Thor SoC bonded directly to a heat-pipe panel',
    loopCoolant: 'passiveHeatPipe',
    heatSource: { name: 'Jetson Thor (direct to heat pipe)', maxTemperature_K: 373.15, unitPower_W: 130, totalPower_W: 250e3, averageFraction: 0.7, stages: THOR_DIRECT_STAGES },
    notes: {
      ...THOR_NOTES,
      'heatSource.stages': 'ASSUMPTION throughout: transfer plate removed (NVIDIA does not support this [thor-tdg]); all 130 W taken through a 15 × 30 mm SoC lid (conservative: memory and regulators dissipate part of it elsewhere); 0.5 mm silicon ×1.5 peaking; interface 0.1 K·cm²/W; heat-pipe evaporator h 20 kW/m²K on the lid footprint, which dominates the drop.',
    },
  },
  'isothermal-limit': {
    label: 'Physics limit: no interface drops (radiator at source temperature)',
    loopCoolant: 'twoPhaseAmmonia',
    heatSource: { name: 'Isothermal source', maxTemperature_K: 373, unitPower_W: 1800, totalPower_W: 250e3, averageFraction: 0.7, stages: [] },
    notes: { ...GPU_NOTES, 'heatSource.stages': 'No stages: the radiator runs at the source temperature. A bound, not a design.' },
  },
  'process-600K': {
    label: 'Industrial process waste heat at 600 K (e.g. refining, power conversion)',
    loopCoolant: 'nak78',
    heatSource: {
      name: 'Process heat, 600 K',
      maxTemperature_K: 600,
      unitPower_W: 150e3,
      totalPower_W: 250e3,
      averageFraction: 1,
      stages: [{ id: 'processHx', label: 'Process to coolant heat exchanger', kind: 'deltaT', deltaT_K: 20, lengthScale_m: 0.05 }],
    },
    notes: {
      'heatSource.maxTemperature_K': 'Generic mid-temperature process. Radiator flux grows as T⁴, so hot waste heat is cheap to reject. ASSUMPTION.',
      'heatSource.stages': '20 K approach in the process heat exchanger. ASSUMPTION.',
      'heatSource.totalPower_W': 'Same 250 kW as the compute cases, for comparison. ASSUMPTION.',
      'heatSource.averageFraction': 'A continuous process runs at its peak: average = peak. ASSUMPTION.',
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
      'environment.altitude_km': 'AI1 reported at ~600 km [starmind-nbc] (SECONDARY). SpaceX\'s FCC letter describes sun-synchronous dawn-dusk or dusk-dawn shells within 500–1,002 km, plus 30° shells at 550–568 km [spacex-fcc-2026-09].',
      'environment.beta_deg': 'SpaceX describes a dawn-dusk sun-synchronous constellation "that delivers near-constant solar exposure" [spacex-s1]. β = 70° (eclipse-free at 600 km, little albedo) stands in for that orbit; the seasonal drift of β is not modelled. ASSUMPTION.',
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
  tile?: Tile;
  reported?: NonNullable<Scenario["reported"]>;
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
      'SpaceX\'s published AI1 figures (250 kW peak / 175 kW average compute, 160 m² liquid radiator, 250 W/m² solar array, 75 kW per ton) in a dawn-dusk orbit at ~600 km, with an Earth-style lidded Rubin package and a single-phase pumped loop. Values SpaceX has not published are labelled ASSUMPTION. It is a reference case because SpaceX has shared more of its design than anyone else.',
    heatSource: 'gpu-lidded',
    environment: 'leo-600',
    loop: { coolant: 'water', transportDrop_K: 1, transportLength_m: 20, hxApproach_K: 0, rise_K: 10, coolantCap_K: null },
    radiator: { orientation: 'edgeOn', emissivity: 0.9, solarAbsorptance: 0.2, finEfficiency: 0.9, arealDensity_kg_m2: 6, sizingMargin: 1.25, loopSpecificMass_kg_per_kW: 5 },
    power: {
      cellEfficiency: 0.22,
      packingFactor: 0.9,
      operatingFactor: 0.928,
      solarArrayArealDensity_kg_m2: 2.0,
      conversionEfficiency: 0.95,
      overheadFraction: 0.03,
      pumpFraction: 0.01,
      busVoltage_V: 800,
      harnessOneWayLength_m: 35,
      harnessLossFraction: 0.01,
      battery: { roundTripEfficiency: 0.92, depthOfDischarge: 0.3, specificEnergy_Wh_kg: 150 },
    },
    reported: { radiatorArea_m2: 160, vehicleSpecificPower_kW_per_t: 75, radiatorFlux_W_m2: 1400, solarArrayArea_m2: 840 },
    notes: {
      'reported.radiatorArea_m2': 'Deployable liquid radiator, 160 m² [spacex-starmind] (110 m² before 2026-08-04 [spacex-starmind-2026-08-03]); FCC envelope under 200 m² [spacex-fcc-2026-09]. Taken as two-sided panel planform: in SpaceX\'s June 8 update Musk gave about 1,400 W/m² from double-sided radiators oriented knife-edge to the Sun [spacex-0608], and later ~1,300 W/m² for an aluminum radiator [musk-1102]. 160 m² × 1,400 W/m² = 224 kW, below the 250 kW peak; Musk calls the peak battery-assisted [musk-0715]. If the average reaches 250 kW as he has hoped [musk-1001b], 1,300 W/m² needs about 192 m², still inside the FCC envelope. The raw ratio is 250 kW / 160 m² = 1,562 W/m²; the model also counts conversion losses and overhead. Mach33\'s independent model needs about 327 m² to hold 105 °C logic and 95 °C HBM at 250 kW [mach33-250kw] (SECONDARY).',
      'reported.vehicleSpecificPower_kW_per_t': '"75 kW / ton" vehicle efficiency [spacex-starmind] (70 before 2026-08-04 [spacex-starmind-2026-08-03]). Read on peak compute: 150 / 70 = 2.14 t matches outside estimates of about 2.1 t for the earlier sheet, so 250 / 75 ≈ 3.3 t. The S-1 targets about 100 kW of compute per ton [spacex-s1]. The FCC letter\'s 4,000 kg is a ceiling used in the debris analysis, not a design mass [spacex-fcc-2026-09].',
      'reported.radiatorFlux_W_m2': 'About 1,400 W/m² from double-sided radiators oriented knife-edge to the Sun, Musk in SpaceX\'s June 8 update [spacex-0608]; later ~1,300 W/m² for an aluminum radiator [musk-1102]. The temperature it is quoted at is not published.',
      'reported.solarArrayArea_m2': '210 kW solar array [spacex-starmind] at 250 W/m² [spacex-starmind][spacex-0608] = 840 m², inside the FCC envelope of under 1,500 m² [spacex-fcc-2026-09].',
      'loop.hxApproach_K': '"Redundant pumping loops" [spacex-starmind]. Modelled as one loop with no intermediate heat exchanger: ASSUMPTION.',
      'loop.rise_K': '10 K coolant rise. ASSUMPTION.',
      'radiator.loopSpecificMass_kg_per_kW': 'ASSUMPTION: pumps, accumulators, valves and joints for a modern single-phase loop, about a quarter of the ISS heritage figure (22.1 kg/kW). SpaceX has not published it.',
      'radiator.arealDensity_kg_m2': 'ASSUMPTION: modern deployable radiator, lighter than ISS. Musk describes the radiator as aluminum [musk-1102]; SpaceX has not published its mass.',
      'radiator.sizingMargin': 'ASSUMPTION.',
      'power.operatingFactor': 'CALIBRATED (0.928): with the assumed 22 % cells and 0.9 packing, reproduces SpaceX\'s stated solar power density of 250 W/m² [spacex-starmind][spacex-0608]. SpaceX gives "Solar Array 210 kW", which is 840 m² at 250 W/m² [spacex-starmind]; Musk has said "over 250kW of solar power" [musk-1001]; the FCC envelope is under 1,500 m² [spacex-fcc-2026-09].',
      'power.cellEfficiency': 'Silicon-class cells, as in McCalip\'s model (22 %) [mccalip]. ASSUMPTION: SpaceX has not published Starlink cell type, efficiency or power. Cross-check (model arithmetic): at these settings the 104.96 m² of solar array SpaceX filed for its F9-2 design, the Falcon 9 "V2 Mini" [spacex-fcc-2022], would deliver about 25 kW in sunlight. SpaceX says V3 arrays generate about twice the power of V2 [starlink-v3].',
      'power.solarArrayArealDensity_kg_m2': 'ASSUMPTION. SpaceX filed 800 kg and 2 × 12.8 m × 4.1 m of solar array for F9-2, and 2,000 kg with 256.94 m² for its Starship-launched design, as debris-model inputs [spacex-fcc-2022]; how that mass splits between solar array and the rest is not public.',
      'power.busVoltage_V': 'ASSUMPTION borrowed from terrestrial practice: AI data centers are moving to 800 V DC distribution [nvidia-800vdc]. Not space heritage: the ISS runs 160 V primary / 124 V secondary, and high-voltage solar arrays in low orbit risk arcing to the surrounding plasma unless designed for it [nasa-hdbk-4006a]. Starlink and Starmind bus voltages are not public. Here it sets the copper mass needed for the harness loss target, not the radiator.',
      'power.harnessLossFraction': 'Copper sized for 1 % I²R loss: a common design target. ASSUMPTION.',
    },
  },
  tileShared: {
    name: 'Tiles, two-sided, shared solar',
    summary:
      'Distributed compute: Jetson Thor modules mounted on 1 m² oscillating-heat-pipe panels that radiate from both faces, edge-on to the Sun. No pumped loop. Power comes from the same solar array, cells and battery assumptions as the Starmind case, distributed at 400 V and stepped down on each Tile.',
    heatSource: 'thor-direct',
    environment: 'leo-600',
    loop: { coolant: 'passiveHeatPipe', transportDrop_K: 0, transportLength_m: 0.5, hxApproach_K: 0, rise_K: 0, coolantCap_K: null },
    radiator: { orientation: 'edgeOn', emissivity: 0.9, solarAbsorptance: 0.2, finEfficiency: 0.9, arealDensity_kg_m2: 5, sizingMargin: 1.25, loopSpecificMass_kg_per_kW: 0 },
    power: {
      cellEfficiency: 0.22,
      packingFactor: 0.9,
      operatingFactor: 0.928,
      solarArrayArealDensity_kg_m2: 2.0,
      conversionEfficiency: 0.92,
      overheadFraction: 0.03,
      pumpFraction: 0,
      busVoltage_V: 400,
      harnessOneWayLength_m: 35,
      harnessLossFraction: 0.01,
      battery: { roundTripEfficiency: 0.92, depthOfDischarge: 0.3, specificEnergy_Wh_kg: 150 },
    },
    tile: {
      kind: 'sharedSolar',
      area_m2: 1,
      networkingMass_kg: 1,
      extraMassPerUnit_kg: 0,
      supportStructureFraction: 0,
      converterSpecificMass_kg_per_kW: 1,
      peakDuration_h: 0,
      radiatorCoupling: 'bonded',
      sunAngle_deg: 0,
      cellAbsorptance: 0.9,
      cellEmissivity: 0.85,
      cellBackEmissivity: 0.85,
      cellLayerArealDensity_kg_m2: 1.5,
      cellTemperatureCoefficient_per_K: -0.003,
    },
    notes: {
      'radiator.arealDensity_kg_m2': 'ASSUMPTION (Sophia Space): oscillating-heat-pipe panel, 2.5 to 7.5 kg/m²; the midpoint is used.',
      'radiator.finEfficiency': 'ASSUMPTION: spreading across the heat-pipe panel, taken equal to the Starmind case.',
      'radiator.emissivity': 'Same coating as the Starmind case. ASSUMPTION.',
      'radiator.sizingMargin': 'Same 1.25 as the Starmind case. ASSUMPTION.',
      'radiator.loopSpecificMass_kg_per_kW': 'ASSUMPTION: no pumped loop; the heat pipes are in the panel mass.',
      'loop.rise_K': 'A heat-pipe panel is close to isothermal; its spreading loss is in the fin efficiency. ASSUMPTION.',
      'power.pumpFraction': 'ASSUMPTION: passive heat pipes, no pumps.',
      'power.conversionEfficiency': 'ASSUMPTION: the Starmind case\'s 0.95 times 0.97 for one more step-down stage on each Tile (400 V to the Tile\'s low-voltage rail).',
      'power.busVoltage_V': 'ASSUMPTION (Sophia Space): 400 V distribution. At 28 V the copper for the same loss would be about 200 times heavier (mass ∝ 1/V²). High-voltage solar arrays in low orbit risk arcing unless designed for it [nasa-hdbk-4006a].',
      'power.harnessOneWayLength_m': 'Same 35 m as the Starmind case. ASSUMPTION: a field of a few hundred Tiles is about 17 m on a side.',
      'power.harnessLossFraction': 'Copper sized for 1 % I²R loss, as in the Starmind case. ASSUMPTION.',
      'power.cellEfficiency': 'ASSUMPTION: same solar array as the Starmind case, by design of the comparison.',
      'power.operatingFactor': 'Same solar array as the Starmind case (CALIBRATED there to 250 W/m²).',
      'power.solarArrayArealDensity_kg_m2': 'Same solar array as the Starmind case. ASSUMPTION.',
      'tile.area_m2': 'ASSUMPTION (Sophia Space): a Tile is about 1 m × 1 m.',
      'tile.networkingMass_kg': 'ASSUMPTION (Sophia Space): 1 kg of networking hardware on every Tile, which a centralized payload would not need.',
      'tile.extraMassPerUnit_kg': 'ASSUMPTION (Sophia Space): zero for now. Set it to charge an enclosure and mounting mass per Thor module, so the penalty scales with compute. Payload mass itself is out of scope here, as for every case.',
      'tile.supportStructureFraction': 'ASSUMPTION (Sophia Space): zero, because the 2.5 to 7.5 kg/m² heat-pipe panel figure is taken to include hinges and support structure, as the pumped cases\' areal densities do. Set it to charge structure on everything mounted on the Tiles.',
      'tile.converterSpecificMass_kg_per_kW': 'ASSUMPTION: 1 kg/kW for an isolated 400 V step-down converter with filtering and packaging on each Tile. The pumped cases carry no converter mass (it is counted as payload there), so this is a deliberate penalty.',
    },
  },
  tileSolar: {
    name: 'Tiles with integrated solar',
    summary:
      'Distributed compute on Sun-facing 1 m² Tiles: solar cells cover the sunlit face, Jetson Thor modules sit on an oscillating-heat-pipe radiator behind them. Each Tile powers itself and carries its own battery; there is no central solar array, harness or pumped loop. The cells are 22 % by default (set power.cellEfficiency to 0.28 for the second case).',
    heatSource: 'thor-direct',
    environment: 'leo-600',
    loop: { coolant: 'passiveHeatPipe', transportDrop_K: 0, transportLength_m: 0.5, hxApproach_K: 0, rise_K: 0, coolantCap_K: null },
    radiator: { orientation: 'edgeOn', emissivity: 0.9, solarAbsorptance: 0.2, finEfficiency: 0.9, arealDensity_kg_m2: 5, sizingMargin: 1.25, loopSpecificMass_kg_per_kW: 0 },
    power: {
      cellEfficiency: 0.22,
      packingFactor: 0.9,
      operatingFactor: 0.928,
      solarArrayArealDensity_kg_m2: 2.0,
      conversionEfficiency: 0.95,
      overheadFraction: 0.03,
      pumpFraction: 0,
      busVoltage_V: 28,
      harnessOneWayLength_m: 0,
      harnessLossFraction: 0.01,
      battery: { roundTripEfficiency: 0.92, depthOfDischarge: 0.3, specificEnergy_Wh_kg: 150 },
    },
    tile: {
      kind: 'integratedSolar',
      area_m2: 1,
      networkingMass_kg: 1,
      extraMassPerUnit_kg: 0,
      supportStructureFraction: 0,
      converterSpecificMass_kg_per_kW: 1,
      peakDuration_h: 0,
      radiatorCoupling: 'separate',
      sunAngle_deg: 0,
      cellAbsorptance: 0.9,
      cellEmissivity: 0.85,
      cellBackEmissivity: 0.85,
      cellLayerArealDensity_kg_m2: 1.5,
      cellTemperatureCoefficient_per_K: -0.003,
    },
    notes: {
      'radiator.orientation': 'ASSUMPTION, fixed by the Tile: the radiator rides on the back of a Sun-facing Tile, so in a dawn-dusk orbit both Tile faces are edge-on to Earth (tile.ts). Changing this field has no effect.',
      'radiator.arealDensity_kg_m2': 'ASSUMPTION (Sophia Space): oscillating-heat-pipe panel, 2.5 to 7.5 kg/m²; the midpoint is used.',
      'radiator.finEfficiency': 'ASSUMPTION: spreading across the heat-pipe panel, taken equal to the Starmind case.',
      'radiator.emissivity': 'Same coating as the Starmind case. ASSUMPTION.',
      'radiator.sizingMargin': 'Same 1.25 as the Starmind case. ASSUMPTION.',
      'radiator.loopSpecificMass_kg_per_kW': 'ASSUMPTION: no pumped loop; the heat pipes are in the panel mass.',
      'loop.rise_K': 'A heat-pipe panel is close to isothermal; its spreading loss is in the fin efficiency. ASSUMPTION.',
      'power.pumpFraction': 'ASSUMPTION: passive heat pipes, no pumps.',
      'power.cellEfficiency': 'Same 22 % cells as the Starmind case by default; 28 % is the second case to run. ASSUMPTION.',
      'power.operatingFactor': 'Same 0.928 as the Starmind case (CALIBRATED there), read as the factor for a free-flying solar array; the hotter cells of a Tile are derated on top of it. ASSUMPTION.',
      'power.solarArrayArealDensity_kg_m2': 'ASSUMPTION: not used; the cells ride on the Tile (see tile.cellLayerArealDensity_kg_m2).',
      'power.busVoltage_V': 'ASSUMPTION: not used; each Tile consumes its own power, so there is no harness to size.',
      'power.harnessOneWayLength_m': 'ASSUMPTION: no harness from a central solar array.',
      'power.conversionEfficiency': 'Same 0.95 as the Starmind case. ASSUMPTION.',
      'tile.area_m2': 'ASSUMPTION (Sophia Space): a Tile is about 1 m × 1 m, its sunlit face fully covered in cells.',
      'tile.networkingMass_kg': 'ASSUMPTION (Sophia Space): 1 kg of networking hardware on every Tile, which a centralized payload would not need.',
      'tile.extraMassPerUnit_kg': 'ASSUMPTION (Sophia Space): zero for now. Set it to charge an enclosure and mounting mass per Thor module, so the penalty scales with compute. Payload mass itself is out of scope here, as for every case.',
      'tile.supportStructureFraction': 'ASSUMPTION (Sophia Space): zero, because the 2.5 to 7.5 kg/m² heat-pipe panel figure is taken to include hinges and support structure, as the pumped cases\' areal densities do. Set it to charge structure on everything mounted on the Tiles.',
      'tile.converterSpecificMass_kg_per_kW': 'ASSUMPTION: 1 kg/kW for cell regulation and battery charge electronics on each Tile.',
      'tile.peakDuration_h': 'Zero by default, to match the other cases, which do not count battery energy for peaks above the average in sunlight (APPROACH.md, limitation 1). Set it to size the Tile batteries for a peak of that length. ASSUMPTION.',
      'tile.radiatorCoupling': 'ASSUMPTION: a heat-pipe radiator smaller than the Tile, insulated from the cells and sized for the compute heat. "bonded" ties cells and radiator to one temperature instead.',
      'tile.sunAngle_deg': 'ASSUMPTION: face-on to the Sun. Tilting away lowers both the power and the heat each Tile takes in, so the Tile runs cooler and more Tiles are needed.',
      'tile.cellAbsorptance': 'ASSUMPTION: cover-glassed cells absorb about 0.9 of sunlight [gilmore].',
      'tile.cellEmissivity': 'ASSUMPTION: cover glass emissivity about 0.85 [gilmore].',
      'tile.cellBackEmissivity': 'ASSUMPTION: painted or bare composite back of the cell panel.',
      'tile.cellLayerArealDensity_kg_m2': 'ASSUMPTION: cells, cover glass, wiring and the substrate they need where no heat-pipe panel backs them.',
      'tile.cellTemperatureCoefficient_per_K': 'ASSUMPTION: −0.3 %/K, typical of silicon; multi-junction cells are nearer −0.2 %/K.',
    },
  },
  ideal: {
    name: 'Aggressive engineering',
    summary:
      'Aggressive near-term engineering: direct-die two-phase cooling, a single isothermal loop, optical-solar-reflector coatings, multi-junction cells, light heat-pipe radiators.',
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
    name: 'Idealized thermal bound',
    summary:
      'An idealized bound where only physics binds: radiator at the source temperature, black surfaces, perfect fins, detailed-balance solar cells. Areal densities have no physical floor; the values here are placeholders.',
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
    ...(mode.tile ? { tile: structuredClone(mode.tile) } : {}),
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
  { part: 'shared', group: 'Load', path: 'heatSource.totalPower_W', label: 'Peak heat load', unit: 'kW', display: 1e-3, min: 10e3, max: 2e6, step: 10e3 },
  { part: 'shared', group: 'Load', path: 'heatSource.averageFraction', label: 'Average load, share of peak', unit: '', min: 0.1, max: 1, step: 0.01, tornadoStep: 0.1 },
  { part: 'shared', group: 'Load', path: 'power.conversionEfficiency', label: 'Bus-to-payload conversion', unit: '', min: 0.7, max: 1, step: 0.005, tornadoStep: 0.02 },
  { part: 'shared', group: 'Location', path: 'environment.altitude_km', label: 'Altitude', unit: 'km', min: 100, max: 40000, step: 10, when: (s) => s.environment.kind === 'orbit' },
  { part: 'shared', group: 'Location', path: 'environment.beta_deg', label: 'Beta angle β', unit: '°', min: 0, max: 90, step: 1, when: (s) => s.environment.kind === 'orbit' },
  { part: 'shared', group: 'Location', path: 'environment.groundTemperature_K', label: 'Ground temperature', unit: 'K', min: 80, max: 400, step: 1, when: (s) => s.environment.kind === 'surface', tornadoStep: 20 },
  { part: 'shared', group: 'Location', path: 'environment.sunElevation_deg', label: 'Sun elevation', unit: '°', min: 0, max: 90, step: 1, when: (s) => s.environment.kind === 'surface' },
  { part: 'shared', group: 'Location', path: 'environment.sunlitFraction', label: 'Sunlit fraction', unit: '', min: 0.05, max: 1, step: 0.01, when: (s) => s.environment.kind !== 'orbit' },
  { part: 'heatPath', group: 'Heat source', path: 'heatSource.maxTemperature_K', label: 'Source temperature limit', unit: 'K', min: 300, max: 1000, step: 1, tornadoStep: 10 },
  { part: 'heatPath', group: 'Heat source', path: 'heatSource.unitPower_W', label: 'Power per package', unit: 'kW', display: 1e-3, min: 50, max: 5000, step: 10, tornadoStep: 0.2, relative: true, when: (s) => s.heatSource.stages.some((st) => st.kind !== 'deltaT') },
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
  { part: 'radiator', group: 'Tiles', path: 'tile.networkingMass_kg', label: 'Networking per Tile', unit: 'kg', min: 0, max: 10, step: 0.1, when: (s) => !!s.tile, tornadoStep: 0.5 },
  { part: 'radiator', group: 'Tiles', path: 'tile.extraMassPerUnit_kg', label: 'Enclosure per compute module', unit: 'kg', min: 0, max: 5, step: 0.05, when: (s) => !!s.tile, tornadoStep: 0.25 },
  { part: 'radiator', group: 'Tiles', path: 'tile.supportStructureFraction', label: 'Support structure, share of Tile mass', unit: '', min: 0, max: 0.5, step: 0.01, when: (s) => !!s.tile, tornadoStep: 0.05 },
  { part: 'power', group: 'Tiles', path: 'tile.converterSpecificMass_kg_per_kW', label: 'Converters on the Tiles', unit: 'kg/kW', min: 0, max: 5, step: 0.1, when: (s) => !!s.tile, tornadoStep: 0.5 },
  { part: 'power', group: 'Tiles', path: 'tile.cellLayerArealDensity_kg_m2', label: 'Cell layer areal density', unit: 'kg/m²', min: 0.2, max: 5, step: 0.1, when: (s) => s.tile?.kind === 'integratedSolar', tornadoStep: 0.5 },
  { part: 'power', group: 'Tiles', path: 'tile.sunAngle_deg', label: 'Tile tilt away from the Sun', unit: '°', min: 0, max: 80, step: 1, when: (s) => s.tile?.kind === 'integratedSolar' },
  { part: 'power', group: 'Tiles', path: 'tile.peakDuration_h', label: 'Peak held by Tile batteries', unit: 'h', min: 0, max: 6, step: 0.1, when: (s) => s.tile?.kind === 'integratedSolar' },
  { part: 'power', group: 'Tiles', path: 'tile.cellTemperatureCoefficient_per_K', label: 'Cell output per kelvin', unit: '/K', min: -0.006, max: 0, step: 0.0005, when: (s) => s.tile?.kind === 'integratedSolar' },
  { part: 'power', group: 'Energy storage', path: 'power.battery.specificEnergy_Wh_kg', label: 'Battery specific energy', unit: 'Wh/kg', min: 50, max: 600, step: 10, tornadoStep: 0.2, relative: true },
  { part: 'power', group: 'Energy storage', path: 'power.battery.depthOfDischarge', label: 'Battery depth of discharge', unit: '', min: 0.1, max: 1, step: 0.05 },
];
