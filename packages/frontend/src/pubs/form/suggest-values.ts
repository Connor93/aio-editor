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
// list cannot drift from what actually renders. SHEET_NAMES are pre-existing
// sheet-based effect names (not part of the generated registry) kept for
// backward compatibility with authored pubs.
import { buildRegistry } from "../../vfx-engine";

// Mirrors eoweb's src/render/vfx/vfx-manifest.ts `SHEETS` keys. That file
// lives outside the synced src/vfx-engine/ directory, so `pnpm vfx:parity`
// structurally cannot guard this list — a third sheet added there needs a
// manual update here too. Exported so VfxField.tsx can reuse it instead of
// redeclaring (was a third copy; see the sync-vfx-engine.sh header comment
// for why the eoweb<->editor pair is irreducible).
export const SHEET_NAMES: string[] = ["cast-burst", "fire-impact"];

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
