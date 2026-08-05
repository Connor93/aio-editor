import { useEffect, useRef, useState } from "react";

import { buildRegistry, drawEffectAt, FRAME_SIZE, type VfxDef } from "../../vfx-engine";

/** `buildRegistry()` allocates all ~379 defs on every call — build it once
 *  at module scope (module singletons only re-evaluate on a hard reload)
 *  instead of inside the component, an effect, or the rAF loop. */
const VFX_REGISTRY: Record<string, VfxDef> = buildRegistry();

/** Dark checker so `additive: true` effects (drawn with `globalCompositeOperation:
 *  'lighter'`) stay visible instead of washing out against a flat background. */
const CHECKER_BACKGROUND = {
  backgroundColor: "#0f172a",
  backgroundImage:
    "linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
} as const;

/** Live Canvas2D preview of a `cast_vfx`/`impact_vfx` name, rendered with the
 *  same `vfx-engine` the game client uses. Not every datalist entry has a
 *  procedural def — sheet-backed names (`cast-burst`, `fire-impact`), typos,
 *  and an empty field all fall back to a muted "no preview" state rather
 *  than an error or a blank canvas. */
export function VfxPreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const def = VFX_REGISTRY[value];

  useEffect(() => {
    if (!def) return; // sheet name / typo / empty — nothing to animate
    const canvas = canvasRef.current;
    if (!canvas) return; // not mounted yet (e.g. muted state on the prior render)
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const half = FRAME_SIZE / 2;

    if (!playing) {
      // Paint one static frame so a paused preview still shows the effect
      // instead of going blank; no rAF loop to cancel.
      drawEffectAt(ctx, def, 0, half, half);
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = ((now - start) / def.durationMs) % 1;
      drawEffectAt(ctx, def, progress, half, half);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // Cancels on unmount, on pause (`playing` flips), and whenever `value`
    // resolves to a different def — React tears down this effect before the
    // next one runs, so a stale loop never draws into a newer value's canvas.
    return () => cancelAnimationFrame(rafId);
  }, [def, playing]);

  return (
    <div className="mt-1 flex items-center gap-2">
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700"
        style={{ width: FRAME_SIZE, height: FRAME_SIZE, ...CHECKER_BACKGROUND }}
      >
        {def ? (
          <canvas ref={canvasRef} width={FRAME_SIZE} height={FRAME_SIZE} className="block" />
        ) : (
          <span className="px-3 text-center text-[10px] leading-tight text-slate-500">
            no preview
            <br />
            (sheet/unknown)
          </span>
        )}
      </div>
      {def && (
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
