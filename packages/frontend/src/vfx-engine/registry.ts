// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// The generative palette: builds the full name -> VfxDef map from three
// layers — a kind x element x size matrix, a curated set of two-kind combos,
// and a handful of fixed "special" effects with hand-tuned params.

import { KINDS } from './kinds';
import { ELEMENTS, type ElementKey } from './palette';
import type { ShapeKind, VfxDef } from './types';

export type VfxLayer = 'matrix' | 'combo' | 'special';
export type SizeKey = 'sm' | 'base' | 'lg';

// [UI key, NAME SUFFIX, sizeScale]. The suffix is '' at base size — the
// generated name is `nova-fire`, never `nova-fire-base`. Keep these distinct:
// 'base' is unusable as a name suffix and '' is unusable as a UI key.
export const SIZES: ReadonlyArray<
  readonly [key: SizeKey, suffix: string, sizeScale: number]
> = [
  ['sm', 'sm', 0.6],
  ['base', '', 1.0],
  ['lg', 'lg', 1.5],
];

// Curated kind pairs composited as `kindA` (base) + `kindB` (combo layer).
export const COMBOS: ReadonlyArray<readonly [ShapeKind, ShapeKind]> = [
  ['nova', 'sparkle'],
  ['ring', 'slash'],
  ['disc', 'spark-burst'],
  ['shockwave', 'sparkle'],
  ['spiral', 'sparkle'],
  ['implode', 'ring'],
  ['nova', 'burst-lines'],
  ['orbit', 'sparkle'],
];

// Fixed, hand-tuned effects that don't fit the element matrix (heals,
// buffs, crits, ...).
export const SPECIALS: Record<string, VfxDef> = {
  'heal-glow': {
    kind: 'disc',
    color: 0x86efac,
    sizeScale: 1,
    durationMs: 900,
    additive: true,
    frames: 18,
  },
  'buff-aura': {
    kind: 'ring',
    color: 0xffcc44,
    sizeScale: 1,
    durationMs: 700,
    additive: true,
    frames: 14,
  },
  'debuff-sink': {
    kind: 'implode',
    color: 0xa855f7,
    sizeScale: 1,
    durationMs: 350,
    additive: true,
    frames: 12,
  },
  'shield-flash': {
    kind: 'shockwave',
    color: 0x93c5fd,
    sizeScale: 1,
    durationMs: 350,
    additive: true,
    frames: 12,
  },
  'cast-arcane': {
    kind: 'spiral',
    color: 0xc4b5fd,
    sizeScale: 1,
    durationMs: 500,
    additive: true,
    frames: 14,
  },
  'level-up': {
    kind: 'beam-pop',
    color: 0xfde047,
    sizeScale: 1,
    durationMs: 500,
    additive: true,
    frames: 14,
  },
  'crit-flash': {
    kind: 'nova',
    color: 0xffffff,
    sizeScale: 1,
    durationMs: 180,
    additive: true,
    frames: 8,
  },
  'stun-stars': {
    kind: 'orbit',
    color: 0xfde047,
    sizeScale: 1,
    durationMs: 500,
    additive: true,
    frames: 14,
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

  // Matrix: every kind x every element x every size.
  for (const kind of Object.keys(KINDS) as ShapeKind[]) {
    const config = KINDS[kind];
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      for (const [, suffix, sizeScale] of SIZES) {
        const name = `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
        registry[name] = {
          kind,
          color: ELEMENTS[element],
          sizeScale,
          durationMs: config.durationMs,
          additive: config.additive,
          frames: config.frames,
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
        color: ELEMENTS[element],
        sizeScale: 1,
        durationMs: config.durationMs,
        additive: config.additive,
        frames: config.frames,
        combo: kindB,
      };
    }
  }

  // Specials: fixed, hand-tuned effects.
  for (const [name, def] of Object.entries(SPECIALS)) {
    registry[name] = def;
  }

  return registry;
}

// Membership sets, NOT `key in obj`. KINDS/ELEMENTS/SPECIALS are plain object
// literals, so `'constructor' in ELEMENTS` is true and would let a prototype
// key compose a bogus name. (Object.hasOwn is unavailable — tsconfig is ES2020.)
const KIND_KEYS: ReadonlySet<string> = new Set(Object.keys(KINDS));
const ELEMENT_KEYS: ReadonlySet<string> = new Set(Object.keys(ELEMENTS));
const SPECIAL_KEYS: ReadonlySet<string> = new Set(Object.keys(SPECIALS));

const KIND_PREFIX = 'kind:';
const COMBO_PREFIX = 'combo:';
const SPECIAL_PREFIX = 'special:';

function kindShapeId(kind: ShapeKind): string {
  return `${KIND_PREFIX}${kind}`;
}
function comboShapeId(a: ShapeKind, b: ShapeKind): string {
  return `${COMBO_PREFIX}${a}+${b}`;
}
function specialShapeId(name: string): string {
  return `${SPECIAL_PREFIX}${name}`;
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
  shapeId: string;
}

export interface VfxShape {
  id: string;
  label: string;
  layer: VfxLayer;
  hasElement: boolean;
  hasSize: boolean;
}

/** name -> the axes that produced it, for every key in buildRegistry().
 *  Lets a consumer decompose a stored name WITHOUT parsing it — kinds contain
 *  dashes (`spark-burst`, `beam-pop`, `burst-lines`), so `disc-spark-burst-fire`
 *  is a combo while `spark-burst-fire-lg` is a matrix entry, and a split on '-'
 *  cannot tell them apart. */
export function buildIndex(): Record<string, VfxAxes> {
  const index: Record<string, VfxAxes> = Object.create(null);

  for (const kind of Object.keys(KINDS) as ShapeKind[]) {
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

  return index;
}

/** One entry per selectable Shape, in display order: kinds, then combos, then
 *  specials. 15 + 8 + 8 = 31. */
export function buildShapes(): VfxShape[] {
  const shapes: VfxShape[] = [];

  for (const kind of Object.keys(KINDS) as ShapeKind[]) {
    shapes.push({
      id: kindShapeId(kind),
      label: titleCase(kind),
      layer: 'matrix',
      hasElement: true,
      hasSize: true,
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
    });
  }

  for (const name of Object.keys(SPECIALS)) {
    shapes.push({
      id: specialShapeId(name),
      label: titleCase(name),
      layer: 'special',
      hasElement: false,
      hasSize: false,
    });
  }

  return shapes;
}

/** axes -> generated name, or null if that combination isn't generated.
 *  Never throws: `shapeId` and `element` may come from persisted UI state. */
export function composeVfxName(
  shapeId: string,
  element?: ElementKey,
  size?: SizeKey,
): string | null {
  if (shapeId.startsWith(SPECIAL_PREFIX)) {
    const name = shapeId.slice(SPECIAL_PREFIX.length);
    return SPECIAL_KEYS.has(name) ? name : null;
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
