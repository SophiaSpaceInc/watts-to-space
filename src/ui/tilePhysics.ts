/**
 * The Tile cases use physics the pumped cases do not. This lays it out in words, with one
 * scenario's numbers, for the explorer's callout and the comparison tab alike.
 */
import type { Result } from '../model/system.ts';
import type { Scenario } from '../model/types.ts';

const nf = (d: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? nf(d).format(v).replace(/^-(?=[0.]+$)/, '') : '∞');
const fmtK = (T: number) => `${fmt(T)} K (${fmt(T - 273.15)} °C)`;
const fmtT = (kg: number) => (kg >= 1e5 ? `${fmt(kg / 1000)} t` : kg >= 1000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg)} kg`);

export function tilePhysicsHtml(scenario: Scenario, r: Result): string | null {
  const tile = scenario.tile;
  const x = r.tile;
  if (!tile || !x) return null;
  const rad = scenario.radiator;
  const penalties =
    tile.massPerTile_kg !== null
      ? `Each Tile is counted at one rolled-up mass of ${fmt(tile.massPerTile_kg, 1)} kg, covering its heat-pipe panel${tile.kind === 'integratedSolar' ? ', solar cells' : ''}, converters, networking and structure: ${fmtT(r.mass_kg.tiles)} for ${fmt(x.count)} Tiles. Compute modules are left out, as they are for the pumped case.`
      : `Counted against the Tiles and not against the pumped cases: ${fmt(tile.networkingMass_kg, 1)} kg of networking per Tile, ${fmt(tile.extraMassPerUnit_kg, 2)} kg of enclosure per compute module, converters at ${fmt(tile.converterSpecificMass_kg_per_kW, 1)} kg/kW, and support structure at ${fmt(100 * tile.supportStructureFraction)} % of what the Tiles carry${tile.supportStructureFraction === 0 ? ' (zero: the heat-pipe panel figure is taken to include it)' : ''}. Together ${fmtT(r.mass_kg.powerConversion + r.mass_kg.tileOverhead + r.mass_kg.tileStructure)}.`;
  const caveat = '<p class="callout-caveat">Added by Sophia Space in this fork. Every Tile value is an assumption unless the Assumptions table cites a source.</p>';
  if (tile.kind === 'sharedSolar') {
    return `<h3>How the two-sided Tiles are sized</h3>${caveat}
      <p>Each ${fmt(tile.area_m2, 1)} m² Tile is a passive heat-pipe panel with the compute modules mounted on it. The panel is the radiator, so there is no pumped loop, no pump power and no transport line. It is held edge-on to the Sun and radiates from both faces, exactly like the pumped cases' radiator, and it draws power from the same kind of solar array.</p>
      <div class="balance">per Tile, at peak:   2 faces × (η ε σ T⁴ − absorbed from Earth) / margin  =  ${fmt(r.netFlux_W_m2)} / ${fmt(rad.sizingMargin, 2)}  =  ${fmt(x.heatPeak_W)} W of heat
compute per Tile:    ${fmt(x.payloadPeak_W)} W  =  ${fmt(x.unitsPerTile, 1)} modules of ${fmt(scenario.heatSource.unitPower_W)} W
Tiles needed:        ${fmt(r.heatToReject_W / 1000)} kW  /  ${fmt(x.heatPeak_W)} W  =  ${fmt(x.count)}</div>
      <p>The panel runs at <b>${fmtK(x.radiator_K)}</b>: the source limit of ${fmtK(scenario.heatSource.maxTemperature_K)} less the ${fmt(r.chain.stackDrop_K)} K the heat spends getting from the chip into the heat pipes.</p>
      <p><b>Distribution.</b> Power reaches the Tiles at ${fmt(scenario.power.busVoltage_V)} V and is stepped down on each one. Copper for a fixed loss scales as 1/V²: the harness is ${fmtT(r.mass_kg.harness)} here and would be ${fmtT(r.mass_kg.harness * (scenario.power.busVoltage_V / 28) ** 2)} at 28 V.</p>
      <p>${penalties}</p>`;
  }
  const S = 1361;
  const cos = Math.max(0, Math.cos((tile.sunAngle_deg * Math.PI) / 180));
  const absorbed = tile.cellAbsorptance * S * cos;
  const e = r.solarArraySpecific_W_m2;
  const q = r.heatToReject_W / r.solarArrayArea_m2;
  const frac = x.radiatorAreaPerTile_m2 / tile.area_m2;
  const coupling =
    tile.radiatorCoupling === 'separate'
      ? `<p><b>Separate radiator.</b> A heat-pipe radiator smaller than the Tile sits behind the cells, insulated from them. It runs at <b>${fmtK(x.radiator_K)}</b>, the temperature the chip's heat path allows, and covers <b>${fmt(100 * frac)} %</b> of the Tile's back. The cells shed their own heat from the front and from the uncovered ${fmt(100 * (1 - frac))} % of their back, and settle at <b>${fmtK(x.cell_K ?? NaN)}</b>.</p>`
      : `<p><b>Bonded.</b> Cells and heat-pipe panel share one temperature, <b>${fmtK(x.radiator_K)}</b>, and both faces radiate everything. The chip then sits ${fmt(r.chain.stackDrop_K)} K above the Tile, at ${fmtK(x.junction_K)}${x.junction_K > scenario.heatSource.maxTemperature_K ? ', which is over its limit' : ''}.</p>`;
  return `<h3>How the Tiles with their own solar cells are sized</h3>${caveat}
    <p>The sunlit face of each ${fmt(tile.area_m2, 1)} m² Tile is solar cells, so the solar array area and the Tile area are one number, and there is no harness. The sunlight the cells do not convert is heat the Tile itself must radiate, and every watt of electricity returns as heat on the same Tile.</p>
    <div class="balance">per m² of Tile${tile.sunAngle_deg > 0 ? `, tilted ${fmt(tile.sunAngle_deg)}° from the Sun` : ', face-on to the Sun'}:
absorbed sunlight       α S            =  ${fmt(absorbed)} W
electricity taken out   e              =  ${fmt(e)} W   (cells sized for the average load)
heat left in the cells  α S − e        =  ${fmt(absorbed - e)} W
heat from electronics   q at peak      =  ${fmt(q)} W   (the peak above the average comes from the Tile's battery)</div>
    ${coupling}
    <p><b>Hot cells.</b> The same cells on a free-flying solar array radiate from both faces and run at ${fmtK(x.freeSolarArray_K ?? NaN)}. On a Tile they are ${fmt((x.cell_K ?? NaN) - (x.freeSolarArray_K ?? NaN))} K hotter, which costs ${fmt(100 * (1 - (x.cellDerate ?? 1)), 1)} % of their output at ${fmt(100 * tile.cellTemperatureCoefficient_per_K, 2)} %/K. Tilting the Tile away from the Sun cools it and needs more Tiles.</p>
    <p><b>Result.</b> ${fmt(x.count)} Tiles, each carrying ${fmt(x.payloadPeak_W)} W of compute at peak (${fmt(x.unitsPerTile, 1)} modules of ${fmt(scenario.heatSource.unitPower_W)} W). ${tile.peakDuration_h > 0 ? `Tile batteries hold the peak for ${fmt(tile.peakDuration_h, 1)} h.` : 'Battery mass for peaks is not counted, as for the pumped cases.'}</p>
    <p>${penalties}</p>`;
}

