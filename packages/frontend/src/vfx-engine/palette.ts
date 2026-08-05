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

export const ELEMENTS: Record<ElementKey, number> = {
  neutral: 0xfff8e1,
  fire: 0xfb923c,
  water: 0x60a5fa,
  earth: 0x84cc16,
  wind: 0xfacc15,
  light: 0xfde047,
  dark: 0xa855f7,
};
