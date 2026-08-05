// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// The generative palette: builds the full name -> VfxDef map from three
// layers — a kind x element x size matrix, a curated set of two-kind combos,
// and a handful of fixed "special" effects with hand-tuned params.

import { KINDS } from './kinds';
import { ELEMENTS, type ElementKey } from './palette';
import type { ShapeKind, VfxDef } from './types';

const SIZES: ReadonlyArray<readonly [label: string, sizeScale: number]> = [
  ['sm', 0.6],
  ['', 1.0],
  ['lg', 1.5],
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

// Fixed, hand-tuned effects that don't fit the element matrix (heals,
// buffs, crits, ...).
const SPECIALS: Record<string, VfxDef> = {
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
      for (const [sizeLabel, sizeScale] of SIZES) {
        const name = `${kind}-${element}${sizeLabel ? `-${sizeLabel}` : ''}`;
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
