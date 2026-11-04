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

/** Slider values from a query string such as `?T_C=150&emissivity=0.8`, clamped to each slider's range. Other keys are ignored. */
export function fromQuery<K extends string>(sliders: Slider<K>[], search: string): Partial<Record<K, number>> {
  const q = new URLSearchParams(search);
  const out: Partial<Record<K, number>> = {};
  for (const s of sliders) {
    const raw = q.get(s.key)?.trim();
    const v = raw ? Number(raw) : NaN;
    if (Number.isFinite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, v));
  }
  return out;
}

/** The query string for the sliders away from their defaults, at the precision the number box shows; '' when none are. */
export function toQuery<K extends string>(sliders: Slider<K>[], state: Record<K, number>, defaults: Record<K, number>): string {
  const q = new URLSearchParams();
  for (const s of sliders) if (state[s.key] !== defaults[s.key]) q.set(s.key, String(+state[s.key].toPrecision(s.log ? 3 : 4)));
  const text = q.toString();
  return text ? `?${text}` : '';
}

/**
 * Sliders plus a Reset button that restores the page's defaults. The page opens with any values
 * given in the address (see fromQuery), and the address follows the sliders, so copying it shares
 * the setting. Reset is disabled while every slider is at its default.
 */
export function sliderPanel<K extends string>(box: HTMLElement, reset: HTMLButtonElement, sliders: Slider<K>[], state: Record<K, number>, render: () => void): void {
  const defaults = { ...state };
  Object.assign(state, fromQuery(sliders, location.search));
  const changed = () => {
    reset.disabled = sliders.every((s) => state[s.key] === defaults[s.key]);
    try {
      history.replaceState(history.state, '', `${location.pathname}${toQuery(sliders, state, defaults)}${location.hash}`);
    } catch {
      // Some file:// contexts refuse history; the page still works.
    }
    render();
  };
  const build = () => buildSliders(box, sliders, state, changed);
  reset.addEventListener('click', () => {
    Object.assign(state, defaults);
    build();
    changed();
  });
  build();
  changed();
}
