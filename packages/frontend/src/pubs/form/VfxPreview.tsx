import { useEffect, useRef, useState } from "react";

import {
  buildRegistry,
  drawEffectAt,
  effectDurationMs,
  FRAME_SIZE,
  type FrameGeometry,
  frameProgress,
  getSheetDef,
  type SheetDef,
  sheetDurationMs,
  type VfxDef,
} from "../../vfx-engine";

/** `buildRegistry()` allocates all 407 defs on every call — build it once
 *  at module scope (module singletons only re-evaluate on a hard reload)
 *  instead of inside the component, an effect, or the rAF loop. */
const VFX_REGISTRY: Record<string, VfxDef> = buildRegistry();

/** Decoded sprite sheets, keyed by filename. The browser caches the HTTP
 *  response, but not the decode — and a 55-frame 5500x100 strip is not cheap
 *  to re-decode every time the author clicks a different shape. */
const SHEET_IMAGES = new Map<string, HTMLImageElement>();

/** Sheet files whose image failed to load (missing PNG, 404, decode error).
 *  Module-scoped so a known-bad file is recognised immediately on every later
 *  mount — critical, because a failed `HTMLImageElement` reports
 *  `complete === true` with `naturalWidth === 0` forever after, and its `error`
 *  event already fired once and will never fire again. Without this, a second
 *  mount would take neither the ready path nor the listener path and sit on a
 *  blank canvas indefinitely. */
const SHEET_LOAD_FAILED = new Set<string>();

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

const STAND_IN_FILL = "#94a3b8"; // slate-400 — deliberately inert/grey, never mistaken for real art
const STAND_IN_SHADOW = "rgba(0, 0, 0, 0.35)";

/** Grey humanoid stand-in (body rect + head circle + soft ground shadow),
 *  feet planted at the def's GROUND POINT — `(outW / 2, outH * anchorY)`,
 *  the same anchor `drawEffectAt` uses for the effect itself (see
 *  `compositeFrame` below). For a square frame that's the canvas centre
 *  (anchorY 0.5, unchanged from before); for a tall frame it sits further
 *  down, leaving the headroom above free for whatever descends into it.
 *  Getting this wrong — e.g. leaving the stand-in fixed at the canvas
 *  centre while a tall effect's ground point moves — makes the depth split
 *  read wrongly for exactly the effects a tall frame exists for.
 *
 *  Sized off `outW`, not `outH`: a tall frame only grows `designH`
 *  (headroom above the target), never `designW`, so `outW` is the one
 *  dimension that stays 132 across every frame shape and keeps the
 *  stand-in's apparent size constant regardless of frame height.
 *
 *  Drawn between the `behind` and `tint` layers so the depth split is
 *  actually visible: without something at the anchor point to
 *  occlude/be-occluded, `behind` (paints under the character) and `front`
 *  (paints over it) look identical, and `tint` (blends onto it) has
 *  nothing to blend onto. Not real art — a small caption in the JSX below
 *  says so. */
function drawCharacterStandIn(
  ctx: CanvasRenderingContext2D,
  frame: FrameGeometry,
): void {
  const cx = frame.outW / 2;
  const feetY = frame.outH * frame.anchorY;
  const bodyWidth = frame.outW * 0.16;
  const bodyHeight = frame.outW * 0.34;
  const headRadius = frame.outW * 0.075;
  const bodyTop = feetY - bodyHeight;

  ctx.fillStyle = STAND_IN_SHADOW;
  ctx.beginPath();
  ctx.ellipse(cx, feetY, bodyWidth * 1.2, bodyWidth * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = STAND_IN_FILL;
  ctx.fillRect(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  ctx.beginPath();
  ctx.arc(cx, bodyTop - headRadius, headRadius, 0, Math.PI * 2);
  ctx.fill();
}

/** Composites one already-frame-quantised `progress` onto `ctx` in depth
 *  order: `behind` -> character stand-in -> `tint` -> `front`, mirroring
 *  eoweb's 3-sprite `SkillBurst` (behind under the target, tint blended onto
 *  it, front over it), one `drawEffectAt` call per layer.
 *
 *  `layerCanvas`/`layerCtx` is a reused scratch tile, NOT `ctx` itself:
 *  `drawEffectAt` unconditionally `clearRect`s its own working region before
 *  painting (see vfx-engine/render.ts) so a caller can reuse a persistent
 *  context frame-to-frame without ghosting — but that means three direct
 *  calls onto the SAME `ctx` would each wipe out the layer(s) drawn just
 *  before it, leaving only `front` visible. Routing each layer through its
 *  own scratch tile first and compositing that onto `ctx` is what actually
 *  lets `behind`/the stand-in/`tint` survive underneath what's drawn next.
 *
 *  Two independent axes, don't conflate them: WHERE each layer draws
 *  relative to the stand-in (occlusion order — behind/stand-in/tint/front,
 *  fixed by the call order below) vs. HOW each layer's pixels combine with
 *  what's already on `ctx` (blend mode — plain `drawImage` is `source-over`
 *  for `behind`/`front`, but `tint` needs `lighter`, see below). */
function compositeFrame(
  ctx: CanvasRenderingContext2D,
  layerCanvas: HTMLCanvasElement,
  layerCtx: CanvasRenderingContext2D,
  def: VfxDef,
  progress: number,
): void {
  // Per-def frame geometry, NOT the global FRAME_SIZE — `layerCanvas` is
  // already sized to `def.frame.outW x outH` by the caller (see the
  // layer-canvas setup in the component below), and `ctx` (the visible
  // canvas) is sized to match via its `width`/`height` attributes in the
  // JSX. The ground point is `(outW / 2, outH * anchorY)`, the exact pair
  // `drawEffectAt` expects (see its doc comment in vfx-engine/render.ts) —
  // for a square frame (anchorY 0.5) that reduces to the old `(half, half)`.
  const { outW, outH, anchorY } = def.frame;
  const groundX = outW / 2;
  const groundY = outH * anchorY;

  // `drawEffectAt` sets `imageSmoothingEnabled = false` on the context IT
  // draws into (`layerCtx`, below) and never restores it — it does NOT touch
  // `ctx`. Set it here explicitly rather than relying on that as a side
  // effect: the stand-in (plain fillRect/arc calls) and every `drawImage`
  // composite below should deliberately stay nearest-neighbour/pixel-art,
  // not inherit whatever the canvas element's smoothing default happens to
  // be at the time.
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, outW, outH);

  layerCtx.clearRect(0, 0, outW, outH);
  drawEffectAt(layerCtx, def, progress, groundX, groundY, "behind");
  ctx.drawImage(layerCanvas, 0, 0);

  // Stand-in goes BEFORE tint (occlusion order — a separate axis from the
  // tint's blend mode below, not the same concern): drawing it AFTER tint
  // would put the stand-in's own opaque pixels on top of the tint instead of
  // under it, hiding the exact thing this whole rework flagged as visually
  // risky — whether the tint reads as a glow on the character or an ugly
  // blob. The tint's blend mode (below) controls how its pixels combine
  // with what's already there; this ordering controls what's underneath it
  // in the first place. Both have to be right for the preview to predict
  // the game.
  drawCharacterStandIn(ctx, def.frame);

  // `tint` is composited with `lighter` (Canvas2D's additive mode), NOT the
  // `source-over` every other layer here uses — load-bearing, not cosmetic.
  // The quantiser (vfx-engine/render.ts's quantizeToRamp) writes every
  // painted pixel at FULL alpha, so a `source-over` draw would REPLACE the
  // stand-in's pixels under the tint with an opaque, flat-coloured patch.
  // eoweb's SkillBurst pins the exact same layer to Pixi's `blendMode =
  // 'add'` for the exact same reason (see skill-burst.ts) — `lighter` is
  // Canvas2D's equivalent, and the two are visually identical for a fully-
  // opaque source, which every quantised pixel is. Mismatching this is what
  // makes the editor preview lie about "glow vs ugly blob," the one call
  // this whole rework flagged as visually risky for a human to judge.
  layerCtx.clearRect(0, 0, outW, outH);
  drawEffectAt(layerCtx, def, progress, groundX, groundY, "tint");
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(layerCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";

  layerCtx.clearRect(0, 0, outW, outH);
  drawEffectAt(layerCtx, def, progress, groundX, groundY, "front");
  ctx.drawImage(layerCanvas, 0, 0);
}

/** Live preview of a `cast_vfx`/`impact_vfx` name.
 *
 *  Two kinds of effect render here, and they resolve in this order — the same
 *  order eoweb's `vfx-loader` uses, so the editor and the game can never
 *  disagree about what a name means:
 *    1. a curated sprite SHEET (`cast-burst`, `fire-impact`) — a horizontal
 *       PNG strip, stepped frame by frame with `drawImage`;
 *    2. a GENERATED effect from the vfx-engine registry, drawn procedurally
 *       across three composited depth layers (see `compositeFrame`).
 *  A typo or an empty field matches neither and falls back to a muted "no
 *  preview" state rather than an error or a blank canvas. */
export function VfxPreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Reused scratch tile for compositing one depth layer at a time — see
   *  `compositeFrame`'s doc comment for why this can't just be `ctx` itself.
   *  Created lazily (first procedural paint), not at module scope: unlike
   *  `VFX_REGISTRY`, this needs `document` and must not run in a headless
   *  import context. Reused across frames AND across defs, since it's just a
   *  transient scratch buffer cleared before every use. */
  const layerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  /** Progress of the most recently painted frame, as a fraction (0..1) of
   *  the effect's total playback time (`effectDurationMs(def)`), so pausing
   *  can re-paint THAT exact frame and resuming can pick up from it rather
   *  than snapping back to the start. A ref, not state: the rAF tick writes
   *  it every frame and must not re-render the component to do so. */
  const progressRef = useRef(0);

  /** Bumped when a sheet image fails, so the failure (recorded in a module-level
   *  Set, not in state) re-renders this component into its fallback. */
  const [, bumpLoadFailure] = useState(0);

  // Sheets are NOT in the generated registry, so they must be resolved first.
  const sheet: SheetDef | undefined = getSheetDef(value);
  const def: VfxDef | undefined = sheet ? undefined : VFX_REGISTRY[value];
  const sheetFailed = sheet ? SHEET_LOAD_FAILED.has(sheet.file) : false;
  const hasPreview = Boolean((sheet && !sheetFailed) || def);

  // The box a procedural def paints into grows with `def.frame` — a tall
  // def (Task 1) is 132x264, twice the height of the square 132x132 box
  // every def used before it. Sheets are always square (see sheets.ts) and
  // the "no preview"/"sheet failed" fallback text has no frame at all, so
  // both fall back to the global FRAME_SIZE, matching today's fixed box
  // exactly. The box GROWS to fit a tall def rather than the canvas being
  // scaled down to a fixed box: this engine's whole point is pixel-exact
  // nearest-neighbour output, and scaling it to fit would defeat that for
  // the one case (a descending set piece) a human most needs to judge
  // accurately.
  const boxW = def ? def.frame.outW : FRAME_SIZE;
  const boxH = def ? def.frame.outH : FRAME_SIZE;

  // --- Procedural (vfx-engine registry) ---
  useEffect(() => {
    if (!def) return; // sheet / typo / empty — handled elsewhere or not at all
    const canvas = canvasRef.current;
    if (!canvas) return; // not mounted yet (e.g. muted state on the prior render)
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!layerCanvasRef.current) {
      layerCanvasRef.current = document.createElement("canvas");
    }
    const layerCanvas = layerCanvasRef.current;
    // Resize the scratch tile ONLY when `def.frame`'s dimensions actually
    // differ from what's currently allocated — this effect re-runs on every
    // `def`/`playing` change (e.g. play/pause, or switching between two
    // same-sized defs), which is already far less often than the rAF tick
    // inside `tick` below, but assigning `.width`/`.height` unconditionally
    // would still reset (clear) the canvas and is worth avoiding on a tile
    // that's reused across defs and frames precisely to avoid churn.
    if (
      layerCanvas.width !== def.frame.outW ||
      layerCanvas.height !== def.frame.outH
    ) {
      layerCanvas.width = def.frame.outW;
      layerCanvas.height = def.frame.outH;
    }
    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) return;

    // Cadence is `frames * loops * frameMs`: the engine rasterises ONE cycle
    // and repeating it is the consumer's job (see effectDurationMs's doc
    // comment). eoweb's SkillBurst advances as
    // `floor(elapsedMs / frameMs) % frames` across `frames * loops` steps —
    // this mirrors that exactly (frameProgress internally wraps the index by
    // `def.frames`, same as SkillBurst's `% layer.frames.length`), so a
    // 4-frame/loops:3 effect visibly plays 4 discrete frames three times
    // over `effectDurationMs(def)`, not one smooth pass. The whole preview
    // then loops by wrapping `elapsed` itself, since (unlike a one-shot
    // combat burst) there's no "finished" state here — it must keep playing.
    const totalMs = effectDurationMs(def);

    const paint = (fraction: number) => {
      const elapsedMs = fraction * totalMs;
      const frameIndex = Math.floor(elapsedMs / def.frameMs);
      const progress = frameProgress(def, frameIndex);
      compositeFrame(ctx, layerCanvas, layerCtx, def, progress);
    };

    if (!playing) {
      // Freeze on the last frame the loop actually rendered; no rAF to cancel.
      paint(progressRef.current);
      return;
    }

    let rafId = 0;
    // Back-date the clock by the frozen progress so ▶ RESUMES from where ⏸
    // stopped instead of snapping back to the start of the effect.
    const start = performance.now() - progressRef.current * totalMs;
    const tick = (now: number) => {
      const elapsedMs = (now - start) % totalMs;
      progressRef.current = elapsedMs / totalMs;
      paint(progressRef.current);
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
    if (!sheet || SHEET_LOAD_FAILED.has(sheet.file)) return;
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

    const markFailed = () => {
      if (cancelled) return;
      SHEET_LOAD_FAILED.add(sheet.file);
      // Re-render so `hasPreview` goes false and the muted fallback replaces
      // the canvas — otherwise the user stares at an empty box with a live
      // ▶/⏸ button and no clue anything went wrong.
      bumpLoadFailure((n) => n + 1);
    };

    if (img.complete) {
      // `complete` is also true for an image that already FAILED, and in that
      // case its `error` event fired long ago and will never fire again — so
      // this must branch on naturalWidth, not just complete.
      if (img.naturalWidth > 0) begin();
      else markFailed();
    } else {
      img.addEventListener("load", begin, { once: true });
      img.addEventListener("error", markFailed, { once: true });
    }

    return () => {
      cancelled = true;
      img.removeEventListener("load", begin);
      img.removeEventListener("error", markFailed);
      cancelAnimationFrame(rafId);
    };
  }, [sheet, playing]);

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2">
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700"
          style={{ width: boxW, height: boxH, ...CHECKER_BACKGROUND }}
        >
          {hasPreview ? (
            <canvas ref={canvasRef} width={boxW} height={boxH} className="block" />
          ) : sheetFailed ? (
            <span className="px-2 text-center text-[10px] leading-tight text-amber-500/90">
              sheet image
              <br />
              failed to load
              <br />
              <span className="text-slate-500">re-run sync-vfx-engine.sh</span>
            </span>
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
      {def && (
        <p className="text-[10px] leading-tight text-slate-500">
          grey figure = stand-in for scale, not final art
        </p>
      )}
    </div>
  );
}
