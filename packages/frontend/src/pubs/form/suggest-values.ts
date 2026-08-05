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
// list cannot drift from what actually renders. 'cast-burst' and
// 'fire-impact' are pre-existing sheet-based effect names (not part of the
// generated registry) kept for backward compatibility with authored pubs.
import { buildRegistry } from "../../vfx-engine";

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
  "cast-burst",
  "fire-impact",
].sort();
