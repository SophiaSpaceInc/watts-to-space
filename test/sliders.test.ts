import { expect, test } from 'bun:test';
import { fromQuery, toQuery, type Slider } from '../src/ui/sliders.ts';

const SLIDERS: Slider<'T_C' | 'alt'>[] = [
  { key: 'T_C', label: 'T', unit: '°C', min: 0, max: 150, step: 1, hint: '' },
  { key: 'alt', label: 'h', unit: 'km', min: 200, max: 40000, step: 1, hint: '', log: true },
];

test('query values are read, clamped, and unknown or empty keys ignored', () => {
  expect(fromQuery(SLIDERS, '?T_C=84&alt=100&s=x')).toEqual({ T_C: 84, alt: 200 });
  expect(fromQuery(SLIDERS, '?T_C=&alt=abc')).toEqual({});
});

test('only values away from the defaults are written, and they read back', () => {
  const defaults = { T_C: 60, alt: 600 };
  expect(toQuery(SLIDERS, defaults, defaults)).toBe('');
  const q = toQuery(SLIDERS, { T_C: 150, alt: 35786.2 }, defaults);
  expect(q).toBe('?T_C=150&alt=35800');
  expect(fromQuery(SLIDERS, q)).toEqual({ T_C: 150, alt: 35800 });
});
