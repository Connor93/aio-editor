// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// The curated CC0 sprite-sheet effects.
//
// These are NOT generated and are deliberately ABSENT from `buildRegistry()` —
// they're hand-curated horizontal strips (one row of frames) shipped as PNGs in
// each app's `/vfx/` asset directory. They live here, rather than in eoweb's
// render layer, purely so both apps read ONE source for their frame geometry:
// eoweb slices them into Pixi textures, the AIO editor previews them with
// Canvas2D `drawImage`. Pure data — no framework, no DOM — so the engine stays
// vendorable.
//
// Because a sheet name is not in the generated registry, every consumer must
// resolve sheet names FIRST and only then fall through to `buildRegistry()`.
// eoweb's `vfx-loader` and the editor's `VfxPreview`/`VfxField` all do this.
//
// Adding a sheet means: drop the PNG in eoweb/public/vfx/, add an entry here,
// credit it in eoweb/public/vfx/ATTRIBUTION.md, then run
// `scripts/sync-vfx-engine.sh` (which copies both this file and the PNGs).

export interface SheetDef {
  /** Filename within the app's `/vfx/` asset directory. */
  file: string;
  /** One frame's dimensions; frames are laid out left-to-right in a single row. */
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  additive: boolean;
  /** Used only if the PNG fails to load and the consumer falls back to a
   *  procedurally-drawn placeholder — never for the real sheet render, whose
   *  duration is derived from frames/fps by `sheetDurationMs`. */
  fallbackTint: number;
  fallbackDurationMs: number;
}

export const SHEET_DEFS: Record<string, SheetDef> = {
  'cast-burst': {
    file: 'ring-burst.png',
    frameWidth: 100,
    frameHeight: 100,
    frames: 55,
    fps: 60,
    additive: true,
    fallbackTint: 0x88ccff,
    fallbackDurationMs: 450,
  },
  'fire-impact': {
    file: 'fire-flicker.png',
    frameWidth: 64,
    frameHeight: 64,
    frames: 10,
    fps: 25,
    additive: true,
    fallbackTint: 0xff8844,
    fallbackDurationMs: 400,
  },
};

/** Sheet names, for consumers that need the "is this a sheet?" test before
 *  falling through to the generated registry. */
export const SHEET_NAMES: string[] = Object.keys(SHEET_DEFS);

/** Prototype-safe lookup. `SHEET_DEFS` is a plain object literal, so a bare
 *  `SHEET_DEFS[name]` would return truthy inherited members for `'constructor'`,
 *  `'toString'`, `'__proto__'` and friends — and effect names are free-form,
 *  server-authored strings. Always go through this. */
export function getSheetDef(name: string): SheetDef | undefined {
  return SHEET_NAMES.includes(name) ? SHEET_DEFS[name] : undefined;
}

/** A sheet's true playback duration. The `fallback*` fields do NOT apply here. */
export function sheetDurationMs(def: SheetDef): number {
  return (def.frames / def.fps) * 1000;
}
