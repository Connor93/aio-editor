// Suggestion lists for icon/vfx string refs.
//
// ICON_SUGGESTIONS: eoweb's icon manifest (src/render/skill-icon-manifest.ts,
// SKILL_ICONS) duplicated here for authoring convenience ONLY. Free entry is
// always allowed — a new value here must be vendored in eoweb before it
// renders in-game. Keep loosely in sync; drift is non-fatal.
//
// VFX_SUGGESTIONS: generated from the real effect palette, not hand-duplicated.
// `../../vfx-engine` is synced verbatim from eoweb's src/vfx-engine (see
// eoweb/scripts/sync-vfx-engine.sh — DO NOT hand-edit that directory) and
// `buildRegistry()` is the single source of truth eoweb itself uses, so this
// list cannot drift from what actually renders. SHEET_NAMES covers the curated
// sprite-sheet effects, which are deliberately NOT in the generated registry.
//
// SHEET_NAMES is now re-exported straight from the synced engine (`sheets.ts`)
// rather than hand-listed here: eoweb's vfx-manifest DERIVES its sheet table
// from that same file, so there is exactly one declaration of these names and
// their frame geometry, and `pnpm vfx:parity` guards it like any other engine
// file. Re-exported (rather than importing `SHEET_NAMES` at each call site) so
// this module stays the one place the form layer looks up suggestion data.
import { buildRegistry, SHEET_NAMES } from "../../vfx-engine";

export { SHEET_NAMES };

export const ICON_SUGGESTIONS: string[] = [
  "armor-vest",
  "bleeding-wound",
  "bloody-sword",
  "broken-shield",
  "drop-weapon",
  "enrage",
  "fist",
  "foot-trip",
  "health-normal",
  "mace-head",
  "poison-bottle",
  "shield-echoes",
  "sword-brandish",
];
export const VFX_SUGGESTIONS: string[] = [
  ...Object.keys(buildRegistry()),
  ...SHEET_NAMES,
].sort();
