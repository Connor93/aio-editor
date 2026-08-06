// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Element color palette shared by every generated effect name. Values are
// verified against `src/combat-overlay/element-colors.ts` (see plan controller
// pre-flight notes) but this file must stand alone — no import from outside
// vfx-engine.

export type ElementKey =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'earth'
  | 'wind'
  | 'light'
  | 'dark';

/** shadow -> mid -> base -> hot. Index 2 (`base`) MUST stay the combat-element
 *  colour from src/combat-overlay/element-colors.ts — the engine mirrors that
 *  palette, and the ramp extends it rather than replacing it.
 *
 *  Authored by eye, NOT computed from the base: a mechanical darken/lighten
 *  gives muddy shadows on the warm elements and washed-out highlights on the
 *  cool ones. 7 x 4 values; this is art, not maths. */
export type Ramp = readonly [
  shadow: number,
  mid: number,
  base: number,
  hot: number,
];

export const RAMP_BASE = 2;

export const ELEMENTS: Record<ElementKey, Ramp> = {
  neutral: [0x57534e, 0xa8a29e, 0xfff8e1, 0xffffff],
  fire: [0x7c2d12, 0xea580c, 0xfb923c, 0xfed7aa],
  water: [0x1e3a8a, 0x2563eb, 0x60a5fa, 0xbfdbfe],
  earth: [0x365314, 0x4d7c0f, 0x84cc16, 0xd9f99d],
  wind: [0x854d0e, 0xca8a04, 0xfacc15, 0xfef08a],
  light: [0xa16207, 0xeab308, 0xfde047, 0xfefce8],
  dark: [0x3b0764, 0x7c3aed, 0xa855f7, 0xddd6fe],
};
