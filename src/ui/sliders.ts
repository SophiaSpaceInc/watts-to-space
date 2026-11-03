/**
 * Slider rows for the companion pages: a label, an optional "i" link to the parameter's
 * explanation on the main page, a typed number, a range input (optionally log-scaled) and a hint.
 */
export interface Slider<K extends string> {
  key: K;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  /** Main-page URL of the parameter's explanation (an Assumptions row), if it has one. */
  explain?: string;
  /** Log-scaled range input (the number box still shows the plain value). */
  log?: boolean;
}

export function buildSliders<K extends string>(box: HTMLElement, sliders: Slider<K>[], state: Record<K, number>, onChange: () => void): void {
  box.replaceChildren();
  for (const s of sliders) {
    const id = `slider-${s.key}`;
    const row = document.createElement('div');
    row.className = 'param';
    const toRange = (v: number) => (s.log ? Math.log10(v) : v);
    const fromRange = (r: number) => (s.log ? 10 ** r : r);
    const [rmin, rmax] = [toRange(s.min), toRange(s.max)];
    row.innerHTML = `<div class="param-head">
        <label class="control-label" for="${id}">${s.label}</label>
        ${s.explain ? `<a class="info-anchor" href="${s.explain}" target="_blank" rel="noopener" title="What is ${s.label}? Opens its explanation in the full model" aria-label="What is ${s.label}? Opens the full model's explanation in a new tab">i</a>` : ''}
        <span class="param-value"><input id="${id}" type="number" inputmode="decimal" min="${s.min}" max="${s.max}" step="any"><span class="unit">${s.unit}</span></span>
      </div>
      <input type="range" min="${rmin}" max="${rmax}" step="${s.log ? (rmax - rmin) / 400 : s.step}" aria-label="${s.label}" tabindex="-1">
      <p class="param-hint">${s.hint}</p>`;
    const [num, range] = Array.from(row.querySelectorAll('input')) as [HTMLInputElement, HTMLInputElement];
    const sync = () => {
      const v = state[s.key];
      num.value = String(+v.toPrecision(s.log ? 3 : 4));
      range.value = String(toRange(v));
    };
    const set = (v: number) => {
      if (Number.isFinite(v)) state[s.key] = Math.min(s.max, Math.max(s.min, v));
      sync();
      onChange();
    };
    range.addEventListener('input', () => set(fromRange(Number(range.value))));
    num.addEventListener('change', () => set(Number(num.value)));
    sync();
    box.appendChild(row);
  }
}
