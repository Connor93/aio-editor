import { useEffect, useRef, useState } from "react";

import {
  buildRegistry,
  drawEffectAt,
  FRAME_SIZE,
  getSheetDef,
  type SheetDef,
  sheetDurationMs,
  type VfxDef,
} from "../../vfx-engine";

/** `buildRegistry()` allocates all ~379 defs on every call — build it once
 *  at module scope (module singletons only re-evaluate on a hard reload)
 *  instead of inside the component, an effect, or the rAF loop. */
const VFX_REGISTRY: Record<string, VfxDef> = buildRegistry();

/** Decoded sprite sheets, keyed by filename. The browser caches the HTTP
 *  response, but not the decode — and a 55-frame 5500x100 strip is not cheap
 *  to re-decode every time the author clicks a different shape. */
const SHEET_IMAGES = new Map<string, HTMLImageElement>();

/** Resolves (and on first use, starts loading) the decoded image for a sheet.
 *  The PNGs are vendored into `public/vfx/` by eoweb's sync-vfx-engine.sh, so
 *  they're served from this app's own origin at `/vfx/<file>`. */
function loadSheetImage(file: string): HTMLImageElement {
  const cached = SHEET_IMAGES.get(file);
  if (cached) return cached;
  const img = new Image();
  img.src = `/vfx/${file}`;
  SHEET_IMAGES.set(file, img);
  return img;
}

/** Dark checker so `additive: true` effects (drawn with `globalCompositeOperation:
 *  'lighter'`) stay visible instead of washing out against a flat background. */
const CHECKER_BACKGROUND = {
  backgroundColor: "#0f172a",
  backgroundImage:
    "linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
} as const;

/** Live preview of a `cast_vfx`/`impact_vfx` name.
 *
 *  Two kinds of effect render here, and they resolve in this order — the same
 *  order eoweb's `vfx-loader` uses, so the editor and the game can never
 *  disagree about what a name means:
 *    1. a curated sprite SHEET (`cast-burst`, `fire-impact`) — a horizontal
 *       PNG strip, stepped frame by frame with `drawImage`;
 *    2. a GENERATED effect from the vfx-engine registry, drawn procedurally.
 *  A typo or an empty field matches neither and falls back to a muted "no
 *  preview" state rather than an error or a blank canvas. */
export function VfxPreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  /** Progress of the most recently painted frame, so pausing can re-paint
   *  THAT frame. Drawing a fixed `0` instead would blank the canvas for the
   *  7 kinds whose progress-0 geometry is degenerate (`ring`, `disc`,
   *  `spark-burst`, `shockwave`, `burst-lines`, `beam-pop`, `chains` all
   *  have zero radius/length/height there) — the exact opposite of what a
   *  pause button is for. A ref, not state: the rAF tick writes it every
   *  frame and must not re-render the component to do so. */
  const progressRef = useRef(0);

  // Sheets are NOT in the generated registry, so they must be resolved first.
  const sheet: SheetDef | undefined = getSheetDef(value);
  const def: VfxDef | undefined = sheet ? undefined : VFX_REGISTRY[value];
  const hasPreview = Boolean(sheet || def);

  // --- Procedural (vfx-engine registry) ---
  useEffect(() => {
    if (!def) return; // sheet / typo / empty — handled elsewhere or not at all
    const canvas = canvasRef.current;
    if (!canvas) return; // not mounted yet (e.g. muted state on the prior render)
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const half = FRAME_SIZE / 2;

    if (!playing) {
      // Freeze on the last frame the loop actually rendered; no rAF to cancel.
      drawEffectAt(ctx, def, progressRef.current, half, half);
      return;
    }

    let rafId = 0;
    // Back-date the clock by the frozen progress so ▶ RESUMES from where ⏸
    // stopped instead of snapping back to the start of the effect.
    const start = performance.now() - progressRef.current * def.durationMs;
    const tick = (now: number) => {
      const progress = ((now - start) / def.durationMs) % 1;
      progressRef.current = progress;
      drawEffectAt(ctx, def, progress, half, half);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // Cancels on unmount, on pause (`playing` flips), and whenever `value`
    // resolves to a different def — React tears down this effect before the
    // next one runs, so a stale loop never draws into a newer value's canvas.
    return () => cancelAnimationFrame(rafId);
  }, [def, playing]);

  // --- Sprite sheet ---
  useEffect(() => {
    if (!sheet) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const durationMs = sheetDurationMs(sheet);
    const img = loadSheetImage(sheet.file);
    /** Image decode is async, unlike the procedural path. If `value` changes
     *  (or the component unmounts) while we're waiting, this flag stops a
     *  late `onload` from painting a stale effect into a canvas that now
     *  belongs to a different selection. */
    let cancelled = false;
    let rafId = 0;

    const paint = (progress: number) => {
      // Frames run left-to-right in one row. Clamp: progress can reach exactly
      // 1 on the paused path, which would index one frame past the end.
      const frame = Math.min(sheet.frames - 1, Math.floor(progress * sheet.frames));
      ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
      ctx.save();
      ctx.globalCompositeOperation = sheet.additive ? "lighter" : "source-over";
      ctx.drawImage(
        img,
        frame * sheet.frameWidth,
        0,
        sheet.frameWidth,
        sheet.frameHeight,
        (FRAME_SIZE - sheet.frameWidth) / 2,
        (FRAME_SIZE - sheet.frameHeight) / 2,
        sheet.frameWidth,
        sheet.frameHeight,
      );
      ctx.restore();
    };

    const begin = () => {
      if (cancelled) return;
      if (!playing) {
        paint(progressRef.current);
        return;
      }
      const start = performance.now() - progressRef.current * durationMs;
      const tick = (now: number) => {
        const progress = ((now - start) / durationMs) % 1;
        progressRef.current = progress;
        paint(progress);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    if (img.complete && img.naturalWidth > 0) {
      begin();
    } else {
      img.addEventListener("load", begin, { once: true });
    }

    return () => {
      cancelled = true;
      img.removeEventListener("load", begin);
      cancelAnimationFrame(rafId);
    };
  }, [sheet, playing]);

  return (
    <div className="mt-1 flex items-center gap-2">
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700"
        style={{ width: FRAME_SIZE, height: FRAME_SIZE, ...CHECKER_BACKGROUND }}
      >
        {hasPreview ? (
          <canvas ref={canvasRef} width={FRAME_SIZE} height={FRAME_SIZE} className="block" />
        ) : (
          <span className="px-3 text-center text-[10px] leading-tight text-slate-500">
            no preview
            <br />
            (unknown effect)
          </span>
        )}
      </div>
      {hasPreview && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800/60"
          title={playing ? "Pause preview" : "Play preview"}
        >
          {playing ? "⏸" : "▶"}
        </button>
      )}
    </div>
  );
}
