// Suggestion lists for icon/vfx string refs. These live in eoweb (the icon
// manifest + vfx manifest); duplicated here for authoring convenience ONLY.
// Free entry is always allowed — a new value here must be vendored in eoweb
// before it renders in-game. Keep loosely in sync; drift is non-fatal.
// Source: eoweb src/render/skill-icon-manifest.ts (SKILL_ICONS) + src/render/vfx/vfx-manifest.ts (VFX keys).
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
export const VFX_SUGGESTIONS: string[] = ["buff-aura", "cast-burst", "fire-impact"];
