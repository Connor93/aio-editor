// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// The generative palette: builds the full name -> VfxDef map from four
// layers — a kind x element x size matrix, a curated set of two-kind combos,
// a handful of fixed "special" effects with hand-tuned params, and a set of
// element-parameterised, size-less "set piece" effects (bolt, smite,
// rockfall, ring-of-fire).

import { KINDS } from './kinds';
import { ELEMENTS, type ElementKey, type Ramp } from './palette';
import {
  type FrameGeometry,
  GROUND_FRAME,
  type ShapeKind,
  SQUARE_FRAME,
  TALL_FRAME,
  type VfxDef,
} from './types';

export type VfxLayer = 'matrix' | 'combo' | 'special' | 'setpiece';
export type SizeKey = 'sm' | 'base' | 'lg';

/** The kinds that participate in the kind x element x size matrix. Set pieces
 *  live in KINDS too (their draw functions are ordinary draw functions) but
 *  are DELIBERATELY excluded here — they are element-only and size-less, so
 *  iterating Object.keys(KINDS) would silently give each one 21 matrix names. */
const MATRIX_KINDS: readonly ShapeKind[] = [
  'ring',
  'disc',
  'spark-burst',
  'slash',
  'spiral',
  'sparkle',
  'nova',
  'shockwave',
  'beam-pop',
  'implode',
  'vortex',
  'rain',
  'chains',
  'orbit',
  'burst-lines',
];

// [UI key, NAME SUFFIX, sizeScale]. The suffix is '' at base size — the
// generated name is `nova-fire`, never `nova-fire-base`. Keep these distinct:
// 'base' is unusable as a name suffix and '' is unusable as a UI key.
const SIZES: ReadonlyArray<
  readonly [key: SizeKey, suffix: string, sizeScale: number]
> = [
  ['sm', 'sm', 0.6],
  ['base', '', 1.0],
  ['lg', 'lg', 1.5],
];

// Curated kind pairs composited as `kindA` (base) + `kindB` (combo layer).
const COMBOS: ReadonlyArray<readonly [ShapeKind, ShapeKind]> = [
  ['nova', 'sparkle'],
  ['ring', 'slash'],
  ['disc', 'spark-burst'],
  ['shockwave', 'sparkle'],
  ['spiral', 'sparkle'],
  ['implode', 'ring'],
  ['nova', 'burst-lines'],
  ['orbit', 'sparkle'],
];

type SetPieceName = 'bolt' | 'smite' | 'rockfall' | 'ring-of-fire' | 'cleave';

export type CycleKey = 1 | 2 | 3;

/** [name suffix, cycle count]. Bare (1 cycle) carries NO suffix, mirroring how
 *  base size does — so every existing set-piece name keeps working unchanged.
 *  Whether the count lands on `frames` or on `loops` is the shape's
 *  `cycleMode` (see SetPieceConfig). */
const CYCLES: ReadonlyArray<readonly [suffix: string, count: CycleKey]> = [
  ['', 1],
  ['x2', 2],
  ['x3', 3],
];

type CycleMode = 'loop' | 'frames';

interface SetPieceConfig {
  frame: FrameGeometry;
  frames: number;
  loops: number;
  frameMs: number;
  /** Descents only. `ring-of-fire` is inherently sustained — a one-cycle ring
   *  of fire is not a thing anyone wants — so it keeps its fixed `loops` and
   *  offers no axis, exactly as combos offer no size. */
  hasCycles: boolean;
  /** How the `cycles` axis is applied.
   *  'loop'   — multiply `loops`; the same rasterised cycle repeats. No extra
   *             textures. Correct whenever every cycle looks identical.
   *  'frames' — multiply `frames`, keeping `loops: 1`, so every cycle is
   *             rasterised separately and CAN differ. Costs textures linearly
   *             in the cycle count; only use it where cycles must differ.
   *  Inert for shapes with `hasCycles: false`, exactly as `size` is inert for
   *  set pieces — they still declare it, for uniformity. */
  cycleMode: CycleMode;
}

/** Element-parameterised, size-less. Descents are FAST (400ms per cycle) on
 *  purpose: skills have no cast time, so damage and impact_vfx resolve
 *  together and a slow descent would land its impact after the damage
 *  number had already popped — capping a single cycle at 4 * 100ms keeps the
 *  FIRST cycle's landing frame in sync no matter how many cycles the
 *  `cycles` axis repeats it for (see composeVfxName's `-x2`/`-x3` suffixes).
 *  `ring-of-fire` is a sustained ground effect, so it keeps the square
 *  DIMENSIONS and loops — but uses GROUND_FRAME, not SQUARE_FRAME, so it
 *  burns on the floor instead of inheriting the body-blob lift (see
 *  GROUND_FRAME's doc comment in types.ts). */
const SET_PIECES: Record<SetPieceName, SetPieceConfig> = {
  bolt: {
    frame: TALL_FRAME,
    frames: 4,
    loops: 1,
    frameMs: 100,
    hasCycles: true,
    cycleMode: 'loop',
  },
  smite: {
    frame: TALL_FRAME,
    frames: 4,
    loops: 1,
    frameMs: 100,
    hasCycles: true,
    cycleMode: 'loop',
  },
  rockfall: {
    frame: TALL_FRAME,
    frames: 4,
    loops: 1,
    frameMs: 100,
    hasCycles: true,
    cycleMode: 'loop',
  },
  'ring-of-fire': {
    frame: GROUND_FRAME,
    frames: 4,
    loops: 3,
    frameMs: 100,
    hasCycles: false,
    cycleMode: 'loop',
  },
  // SQUARE_FRAME, so it carries the body lift and lands on the target's body
  // like the effects it accompanies — it is a swing, not a ground effect.
  // cycleMode 'frames': -x2 mirrors into an X, -x3 adds a steeper third, so
  // the cycles cannot be a repeat. Costs textures (12 frames x 3 layers at
  // -x3), paid lazily per name actually cast.
  cleave: {
    frame: SQUARE_FRAME,
    frames: 4,
    loops: 1,
    frameMs: 100,
    hasCycles: true,
    cycleMode: 'frames',
  },
};

// Keys mirror SPECIALS below. A literal union (not `Record<string, Ramp>`)
// so `SPECIAL_RAMPS['heal-glow']` types as `Ramp`, never `Ramp | undefined`
// — aio-editor's stricter tsconfig (`noUncheckedIndexedAccess`, which this
// repo doesn't set) only widens generic string-index-signature lookups, not
// property access through a finite literal key union.
type SpecialName =
  | 'heal-glow'
  | 'buff-aura'
  | 'debuff-sink'
  | 'shield-flash'
  | 'cast-arcane'
  | 'level-up'
  | 'crit-flash'
  | 'stun-stars';

// Hardcoded ramps for the specials below — they sit outside the element
// table, so they carry their own shadow/mid/base/hot rungs rather than
// looking one up from `ELEMENTS`.
const SPECIAL_RAMPS: Record<SpecialName, Ramp> = {
  'heal-glow': [0x14532d, 0x16a34a, 0x86efac, 0xdcfce7],
  'buff-aura': [0x78350f, 0xd97706, 0xffcc44, 0xfef3c7],
  'debuff-sink': [0x3b0764, 0x7c3aed, 0xa855f7, 0xddd6fe],
  'shield-flash': [0x1e3a8a, 0x3b82f6, 0x93c5fd, 0xdbeafe],
  'cast-arcane': [0x4c1d95, 0x8b5cf6, 0xc4b5fd, 0xede9fe],
  'level-up': [0xa16207, 0xeab308, 0xfde047, 0xfefce8],
  // Pure white has nowhere to ramp UP, so it ramps toward a warm off-white
  // instead of staying flat — otherwise quantisation collapses it to one rung.
  'crit-flash': [0x78716c, 0xd6d3d1, 0xffffff, 0xffffff],
  'stun-stars': [0xa16207, 0xeab308, 0xfde047, 0xfefce8],
};

// Fixed, hand-tuned effects that don't fit the element matrix (heals,
// buffs, crits, ...).
// Cadence: every special inherits its underlying kind's default cadence
// (impact-role kinds -> IMPACT_TIMING, sustained-role kinds -> FLOW_TIMING —
// see the grouping in kinds.ts) UNLESS commented otherwise below. Two
// specials override AGAINST their kind's default role (heal-glow/buff-aura
// sit on impact-role kinds `disc`/`ring` but read better lingering), and
// crit-flash is intentionally faster than a stock nova.
const SPECIALS: Record<string, VfxDef> = {
  // Overridden to sustained (loops: 3) — `disc` is impact-role by default,
  // but a heal should read as a lingering glow, not a punchy hit.
  'heal-glow': {
    kind: 'disc',
    ramp: SPECIAL_RAMPS['heal-glow'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 3,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
  // Overridden to sustained (loops: 3) — `ring` is impact-role by default,
  // but an aura buff should read as ongoing, not a one-shot flourish.
  'buff-aura': {
    kind: 'ring',
    ramp: SPECIAL_RAMPS['buff-aura'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 3,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
  // `implode` default (impact-role): 4 * 1 * 100ms = 400ms.
  'debuff-sink': {
    kind: 'implode',
    ramp: SPECIAL_RAMPS['debuff-sink'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 1,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
  // `shockwave` default (impact-role): 4 * 1 * 100ms = 400ms.
  'shield-flash': {
    kind: 'shockwave',
    ramp: SPECIAL_RAMPS['shield-flash'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 1,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
  // `spiral` default (sustained-role): 4 * 3 * 100ms = 1200ms.
  'cast-arcane': {
    kind: 'spiral',
    ramp: SPECIAL_RAMPS['cast-arcane'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 3,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
  // `beam-pop` default (sustained-role): 4 * 3 * 100ms = 1200ms.
  'level-up': {
    kind: 'beam-pop',
    ramp: SPECIAL_RAMPS['level-up'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 3,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
  // Overridden: a single fast pop, quicker than a stock nova (frameMs 60
  // instead of 100) — 4 * 1 * 60ms = 240ms.
  'crit-flash': {
    kind: 'nova',
    ramp: SPECIAL_RAMPS['crit-flash'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 1,
    frameMs: 60,
    frame: SQUARE_FRAME,
  },
  // `orbit` default (sustained-role): 4 * 3 * 100ms = 1200ms.
  'stun-stars': {
    kind: 'orbit',
    ramp: SPECIAL_RAMPS['stun-stars'],
    sizeScale: 1,
    additive: true,
    frames: 4,
    loops: 3,
    frameMs: 100,
    frame: SQUARE_FRAME,
  },
};

export function buildRegistry(): Record<string, VfxDef> {
  // Object.create(null), NOT {} — effect names are free-form, server-authored
  // strings looked up directly as keys, so a plain object literal would make
  // `registry['constructor']`, `['toString']`, `['valueOf']`, `['__proto__']`
  // and friends return truthy inherited values that pass an `if (!def)`
  // guard and then blow up on `KINDS[def.kind]`. A null-prototype map has no
  // inherited keys, so every unknown name — typo, empty string, or a
  // prototype key — misses cleanly and degrades to "no effect".
  const registry: Record<string, VfxDef> = Object.create(null);

  // Matrix: every kind x every element x every size. MATRIX_KINDS, NOT
  // Object.keys(KINDS) — see MATRIX_KINDS's doc comment above.
  for (const kind of MATRIX_KINDS) {
    const config = KINDS[kind];
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      for (const [, suffix, sizeScale] of SIZES) {
        const name = `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
        registry[name] = {
          kind,
          ramp: ELEMENTS[element],
          sizeScale,
          additive: config.additive,
          frames: config.frames,
          loops: config.loops,
          frameMs: config.frameMs,
          frame: SQUARE_FRAME,
        };
      }
    }
  }

  // Combos: curated kind pairs x every element, base size only.
  for (const [kindA, kindB] of COMBOS) {
    const config = KINDS[kindA];
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      const name = `${kindA}-${kindB}-${element}`;
      registry[name] = {
        kind: kindA,
        ramp: ELEMENTS[element],
        sizeScale: 1,
        additive: config.additive,
        frames: config.frames,
        loops: config.loops,
        frameMs: config.frameMs,
        combo: kindB,
        frame: SQUARE_FRAME,
      };
    }
  }

  // Specials: fixed, hand-tuned effects.
  for (const [name, def] of Object.entries(SPECIALS)) {
    registry[name] = def;
  }

  // Set pieces: each x every element, base size only. Descents (`hasCycles`)
  // additionally fan out over CYCLES; ring-of-fire emits its one fixed-loop
  // name, exactly as a combo emits its one base-size name.
  for (const [name, cfg] of Object.entries(SET_PIECES) as [
    SetPieceName,
    SetPieceConfig,
  ][]) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      const variants: ReadonlyArray<readonly [string, number]> = cfg.hasCycles
        ? CYCLES
        : [['', cfg.loops]];
      for (const [suffix, count] of variants) {
        // 'frames' mode expands the frame count and pins loops to 1 so each
        // cycle is its own texture and can differ; 'loop' mode leaves the
        // frame count alone and repeats. Both yield the same total duration
        // (frames * loops * frameMs), which is why the registry assertions —
        // not the type checker — are what catch a mis-wiring here.
        const frameMode = cfg.cycleMode === 'frames';
        registry[`${name}-${element}${suffix ? `-${suffix}` : ''}`] = {
          kind: name,
          ramp: ELEMENTS[element],
          sizeScale: 1,
          additive: true,
          frames: frameMode ? cfg.frames * count : cfg.frames,
          loops: frameMode ? 1 : count,
          frameMs: cfg.frameMs,
          frame: cfg.frame,
        };
      }
    }
  }

  return registry;
}

// Membership sets, NOT `key in obj`. KINDS/ELEMENTS/SPECIALS/SET_PIECES are
// plain object literals, so `'constructor' in ELEMENTS` is true and would let
// a prototype key compose a bogus name. (Object.hasOwn is unavailable —
// tsconfig is ES2020.)
//
// KIND_KEYS is built from MATRIX_KINDS, NOT Object.keys(KINDS) — KINDS also
// contains the 4 set-piece kinds, and validating the `kind:` shapeId prefix
// against the full set would let composeVfxName('kind:bolt', 'fire', 'lg')
// compose `bolt-fire-lg`, a name buildRegistry() never generates.
const KIND_KEYS: ReadonlySet<string> = new Set(MATRIX_KINDS);
const ELEMENT_KEYS: ReadonlySet<string> = new Set(Object.keys(ELEMENTS));
const SPECIAL_KEYS: ReadonlySet<string> = new Set(Object.keys(SPECIALS));
const SET_PIECE_KEYS: ReadonlySet<string> = new Set(Object.keys(SET_PIECES));
// Which set pieces carry the cycles axis (descents), NOT `SET_PIECES[name]`
// — see the "Record<string, T> is a cross-repo hazard" note atop this file:
// indexing SET_PIECES with a plain `name: string` (as composeVfxName has,
// having only proven membership via SET_PIECE_KEYS.has) widens to
// `SetPieceConfig | undefined` under aio-editor's noUncheckedIndexedAccess. A
// Set built from the already-typed `Object.entries(...) as [...][]` cast
// (same pattern buildRegistry/buildIndex/buildShapes use) sidesteps it.
const SET_PIECE_CYCLE_KEYS: ReadonlySet<string> = new Set(
  (Object.entries(SET_PIECES) as [SetPieceName, SetPieceConfig][])
    .filter(([, cfg]) => cfg.hasCycles)
    .map(([name]) => name),
);

const KIND_PREFIX = 'kind:';
const COMBO_PREFIX = 'combo:';
const SPECIAL_PREFIX = 'special:';
const SETPIECE_PREFIX = 'setpiece:';

function kindShapeId(kind: ShapeKind): string {
  return `${KIND_PREFIX}${kind}`;
}
function comboShapeId(a: ShapeKind, b: ShapeKind): string {
  return `${COMBO_PREFIX}${a}+${b}`;
}
function specialShapeId(name: string): string {
  return `${SPECIAL_PREFIX}${name}`;
}
function setPieceShapeId(name: SetPieceName): string {
  return `${SETPIECE_PREFIX}${name}`;
}

/** 'spark-burst' -> 'Spark Burst'. Used for picker labels only. */
function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface VfxAxes {
  layer: VfxLayer;
  kind: ShapeKind;
  combo?: ShapeKind;
  element?: ElementKey;
  size?: SizeKey;
  cycles?: CycleKey;
  shapeId: string;
}

export interface VfxShape {
  id: string;
  label: string;
  layer: VfxLayer;
  hasElement: boolean;
  hasSize: boolean;
  hasCycles: boolean;
}

/** name -> the axes that produced it, for every key in buildRegistry().
 *  Lets a consumer decompose a stored name WITHOUT parsing it — kinds contain
 *  dashes (`spark-burst`, `beam-pop`, `burst-lines`), so `disc-spark-burst-fire`
 *  is a combo while `spark-burst-fire-lg` is a matrix entry, and a split on '-'
 *  cannot tell them apart. */
export function buildIndex(): Record<string, VfxAxes> {
  const index: Record<string, VfxAxes> = Object.create(null);

  for (const kind of MATRIX_KINDS) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      for (const [sizeKey, suffix] of SIZES) {
        const name = `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
        index[name] = {
          layer: 'matrix',
          kind,
          element,
          size: sizeKey,
          shapeId: kindShapeId(kind),
        };
      }
    }
  }

  for (const [kindA, kindB] of COMBOS) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      index[`${kindA}-${kindB}-${element}`] = {
        layer: 'combo',
        kind: kindA,
        combo: kindB,
        element,
        shapeId: comboShapeId(kindA, kindB),
      };
    }
  }

  for (const [name, def] of Object.entries(SPECIALS)) {
    index[name] = {
      layer: 'special',
      kind: def.kind,
      shapeId: specialShapeId(name),
    };
  }

  for (const [name, cfg] of Object.entries(SET_PIECES) as [
    SetPieceName,
    SetPieceConfig,
  ][]) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      // The `1` in the no-cycles fallback tuple is a dead payload, not a
      // real cycle count: it exists only to satisfy the `CycleKey` slot of
      // the tuple type below (`variants` must be homogeneous with `CYCLES`,
      // whose tuples carry a real loop count), and is immediately discarded
      // by `cfg.hasCycles ? cycles : undefined` on the next line — this
      // branch only runs when `cfg.hasCycles` is false. Any valid `CycleKey`
      // value would do here.
      const variants: ReadonlyArray<readonly [string, CycleKey]> = cfg.hasCycles
        ? CYCLES
        : [['', 1]];
      for (const [suffix, cycles] of variants) {
        index[`${name}-${element}${suffix ? `-${suffix}` : ''}`] = {
          layer: 'setpiece',
          kind: name,
          element,
          cycles: cfg.hasCycles ? cycles : undefined,
          shapeId: setPieceShapeId(name),
        };
      }
    }
  }

  return index;
}

/** One entry per selectable Shape, in display order: kinds, then combos,
 *  specials, then set pieces. 15 + 8 + 8 + 4 = 35. */
export function buildShapes(): VfxShape[] {
  const shapes: VfxShape[] = [];

  for (const kind of MATRIX_KINDS) {
    shapes.push({
      id: kindShapeId(kind),
      label: titleCase(kind),
      layer: 'matrix',
      hasElement: true,
      hasSize: true,
      hasCycles: false,
    });
  }

  for (const [kindA, kindB] of COMBOS) {
    shapes.push({
      id: comboShapeId(kindA, kindB),
      label: `${titleCase(kindA)} + ${titleCase(kindB)}`,
      layer: 'combo',
      hasElement: true,
      // Combos are generated at base size only — the registry has no
      // `nova-sparkle-fire-lg`, so the picker must not offer a size.
      hasSize: false,
      hasCycles: false,
    });
  }

  for (const name of Object.keys(SPECIALS)) {
    shapes.push({
      id: specialShapeId(name),
      label: titleCase(name),
      layer: 'special',
      hasElement: false,
      hasSize: false,
      hasCycles: false,
    });
  }

  for (const [name, cfg] of Object.entries(SET_PIECES) as [
    SetPieceName,
    SetPieceConfig,
  ][]) {
    shapes.push({
      id: setPieceShapeId(name),
      label: titleCase(name),
      layer: 'setpiece',
      hasElement: true,
      hasSize: false,
      hasCycles: cfg.hasCycles,
    });
  }

  return shapes;
}

/** axes -> generated name, or null if that combination isn't generated.
 *  Never throws: `shapeId`, `element`, `size` and `cycles` may come from
 *  persisted UI state. */
export function composeVfxName(
  shapeId: string,
  element?: ElementKey,
  size?: SizeKey,
  cycles?: CycleKey,
): string | null {
  if (shapeId.startsWith(SPECIAL_PREFIX)) {
    const name = shapeId.slice(SPECIAL_PREFIX.length);
    return SPECIAL_KEYS.has(name) ? name : null;
  }

  if (shapeId.startsWith(SETPIECE_PREFIX)) {
    const name = shapeId.slice(SETPIECE_PREFIX.length);
    if (!SET_PIECE_KEYS.has(name)) return null;
    if (!element || !ELEMENT_KEYS.has(element)) return null;
    // `size` is deliberately ignored — set pieces are size-less, exactly as
    // the combo branch below ignores it.
    if (!SET_PIECE_CYCLE_KEYS.has(name)) {
      // No cycles axis (ring-of-fire): `cycles` is ignored entirely, exactly
      // as `size` is ignored for every set piece above.
      return `${name}-${element}`;
    }
    const entry = CYCLES.find(([, loops]) => loops === (cycles ?? 1));
    if (!entry) return null; // unknown cycle value: null, never a silent 1
    const [suffix] = entry;
    return `${name}-${element}${suffix ? `-${suffix}` : ''}`;
  }

  if (shapeId.startsWith(COMBO_PREFIX)) {
    if (!element || !ELEMENT_KEYS.has(element)) return null;
    const parts = shapeId.slice(COMBO_PREFIX.length).split('+');
    if (parts.length !== 2) return null;
    const [kindA, kindB] = parts;
    const known = COMBOS.some(([a, b]) => a === kindA && b === kindB);
    return known ? `${kindA}-${kindB}-${element}` : null;
  }

  if (shapeId.startsWith(KIND_PREFIX)) {
    const kind = shapeId.slice(KIND_PREFIX.length);
    if (!KIND_KEYS.has(kind)) return null;
    if (!element || !ELEMENT_KEYS.has(element)) return null;
    const entry = SIZES.find(([key]) => key === (size ?? 'base'));
    if (!entry) return null;
    const suffix = entry[1];
    return `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
  }

  return null;
}
