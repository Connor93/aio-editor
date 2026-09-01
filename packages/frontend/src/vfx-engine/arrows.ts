// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Procedurally-drawn arrow projectiles, shared by eoweb (which wraps the
// returned canvas in a Pixi texture) and the AIO editor (which previews it
// with drawImage). Deliberately ABSENT from buildRegistry() — these are not
// skill effects and must not pollute that registry. Lives here, rather than in
// eoweb's render layer, purely so ONE source feeds both apps, exactly like
// sheets.ts.
//
// Framework-agnostic: no Pixi, no imports outside this directory.

import { ELEMENTS, type ElementKey, type Ramp } from './palette';

/** Canvas edge. Roomier than the arrow needs so geometry can be nudged
 *  without hunting a clipped tip; the sprite is centre-anchored, so surplus
 *  transparent padding costs nothing. */
export const ARROW_CANVAS_SIZE = 36;

// Base geometry in design px, before a shape's scalars are applied.
const LENGTH = 22;
const HEAD = 4;
const HEAD_LEN = 7;
const SHAFT_WIDTH = 2;
const FLETCH_NOTCH = 2.5;
const FLETCH_LEN = 6;
const FLETCH_SPREAD = 3.5;
const FLETCH_OVERHANG = 1.5;
const SHAFT_HEAD_OVERLAP = 1;
const OUTLINE = 1;

/** Outline colour. Deliberately a FIXED near-black rather than an element ramp
 *  stop: its job is separating the arrow from an arbitrary map background —
 *  grass, stone, water, cave floor — not carrying element identity, which the
 *  head already does. Derived from a ramp it would go pale on the light
 *  elements and stop separating anything. */
const OUTLINE_COLOR = '#1c1917';

// Ramp stops by ROLE, chosen for maximum VALUE separation so the three parts
// stay legible at ~20px. The ramp is [shadow, mid, base, hot]; on the neutral
// ramp those are roughly 35% / 66% / 96% / 100% lightness, so `base` and `hot`
// are nearly the same colour and using both makes the arrow read as one white
// shape. Spread across shadow -> mid -> base instead, with the tip on `base`,
// which the palette defines as the element's signature colour.
const SHAFT_STOP = 0;
const FLETCH_STOP = 1;
const HEAD_STOP = 2;

/** How a shape's head is drawn. The shaft and fletching are common to every
 *  shape; the head is what makes a bolt read as a bolt. */
export type ArrowHeadKind = 'triangle' | 'diamond' | 'barbed' | 'leaf';

export interface ArrowShapeDef {
  id: string;
  /** Used when the firing weapon carries no rolled element. */
  defaultElement: ElementKey;
  head: ArrowHeadKind;
  /** Multipliers on the base geometry. 1 = unchanged. */
  lengthScale: number;
  headScale: number;
  shaftScale: number;
}

/** The unauthored default shape, pulled out to a standalone const rather than
 *  read back off `ARROW_SHAPES.plain`: a dotted access on a
 *  `Record<string, T>` still goes through the index signature and stays
 *  `T | undefined` under a consumer's `noUncheckedIndexedAccess` (aio-editor
 *  sets it; eoweb does not — the vendored engine must compile under the
 *  STRICTEST consumer's tsconfig, and eoweb's own gates cannot prove that). A
 *  standalone `ArrowShapeDef`-typed const has no index signature to go
 *  through, so it is provably defined with no non-null assertion needed. */
const PLAIN_ARROW_SHAPE: ArrowShapeDef = {
  id: 'plain',
  defaultElement: 'neutral',
  head: 'triangle',
  lengthScale: 1,
  headScale: 1,
  shaftScale: 1,
};

/** The catalog. Task 3 adds the rest; `plain` is the unauthored default and
 *  must always exist. */
export const ARROW_SHAPES: Record<string, ArrowShapeDef> = {
  plain: PLAIN_ARROW_SHAPE,
  flame: {
    id: 'flame',
    defaultElement: 'fire',
    head: 'barbed',
    lengthScale: 1,
    headScale: 1.15,
    shaftScale: 1,
  },
  frost: {
    id: 'frost',
    defaultElement: 'water',
    head: 'diamond',
    lengthScale: 1,
    headScale: 1.1,
    shaftScale: 1,
  },
  bolt: {
    id: 'bolt',
    defaultElement: 'neutral',
    head: 'triangle',
    // Short and thick: a crossbow bolt, not an arrow.
    lengthScale: 0.78,
    headScale: 0.95,
    shaftScale: 1.5,
  },
  bone: {
    id: 'bone',
    defaultElement: 'earth',
    head: 'barbed',
    lengthScale: 1.05,
    headScale: 1,
    shaftScale: 1.25,
  },
  spirit: {
    id: 'spirit',
    defaultElement: 'dark',
    head: 'leaf',
    lengthScale: 0.95,
    headScale: 1.2,
    shaftScale: 0.8,
  },
};

export const DEFAULT_ARROW_SHAPE = 'plain';

// Membership set, NOT `Object.hasOwn` (unavailable — tsconfig lib is ES2020;
// see registry.ts's KIND_KEYS note), NOT `Object.prototype.hasOwnProperty.call`
// (flagged by lint/suspicious/noPrototypeBuiltins, which recommends the
// unavailable Object.hasOwn), and NOT `id in ARROW_SHAPES` or a truthiness/`??`
// check (ARROW_SHAPES is a plain object literal, so 'constructor'/'toString'/
// '__proto__' would read as members — this exact trap has already broken the
// AIO editor form once). Object.keys only returns OWN enumerable keys, so this
// Set can only ever contain real shape ids.
const ARROW_SHAPE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(ARROW_SHAPES),
);

/** True if `id` names a real entry in ARROW_SHAPES. `shapeId` is authored pub
 *  text with no validation; see the note on ARROW_SHAPE_KEYS for why this
 *  can't be a prototype-touching check. */
export function isArrowShapeId(id: string): boolean {
  return ARROW_SHAPE_KEYS.has(id);
}

/** The four iso diagonals in SCREEN space, in the order arrowFacingIndex
 *  buckets them: down-right, down-left, up-right, up-left.
 *
 *  These MUST carry the tile's 2:1 slope, not a 45-degree unit diagonal.
 *  isoToScreen is `sx = (x - y) * halfTileW, sy = (x + y) * halfTileH`, so one
 *  tile of travel moves the sprite by (+/-32, +/-16) — 26.57 degrees from
 *  horizontal, not 45. Drawing on a 45-degree diagonal points the arrow 18.4
 *  degrees off the line it actually flies. Tile size is a PARAMETER because
 *  this module may not import the consumer's constants. */
export function arrowFacings(
  halfTileW: number,
  halfTileH: number,
): ReadonlyArray<{ dx: number; dy: number }> {
  return [
    { dx: halfTileW, dy: halfTileH },
    { dx: -halfTileW, dy: halfTileH },
    { dx: halfTileW, dy: -halfTileH },
    { dx: -halfTileW, dy: -halfTileH },
  ];
}

export function arrowFacingIndex(dx: number, dy: number): number {
  const right = dx >= 0;
  const down = dy >= 0;
  if (right && down) return 0;
  if (!right && down) return 1;
  if (right && !down) return 2;
  return 3;
}

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Head outline path for one head kind. `t` is the tip, `u` the unit travel
 *  vector, `p` its perpendicular, `len`/`half` the scaled head dimensions. */
function headPath(
  ctx: CanvasRenderingContext2D,
  kind: ArrowHeadKind,
  tx: number,
  ty: number,
  ux: number,
  uy: number,
  px: number,
  py: number,
  len: number,
  half: number,
): void {
  const bx = tx - ux * len;
  const by = ty - uy * len;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  switch (kind) {
    case 'triangle':
      ctx.lineTo(bx + px * half, by + py * half);
      ctx.lineTo(bx - px * half, by - py * half);
      break;
    case 'diamond':
      // Widest at the midpoint, tapering back to the shaft — a crystalline
      // point rather than a flat-based blade.
      ctx.lineTo(
        tx - ux * (len / 2) + px * half,
        ty - uy * (len / 2) + py * half,
      );
      ctx.lineTo(bx, by);
      ctx.lineTo(
        tx - ux * (len / 2) - px * half,
        ty - uy * (len / 2) - py * half,
      );
      break;
    case 'barbed': {
      // Rear corners swept BACK past the base into points, so the head reads
      // as hooked rather than a plain wedge.
      const sx = bx - ux * (len * 0.35);
      const sy = by - uy * (len * 0.35);
      ctx.lineTo(sx + px * half, sy + py * half);
      ctx.lineTo(bx, by);
      ctx.lineTo(sx - px * half, sy - py * half);
      break;
    }
    case 'leaf':
      // Rounded, no hard corners — a soft mote rather than a blade.
      ctx.quadraticCurveTo(
        tx - ux * (len / 2) + px * half * 1.3,
        ty - uy * (len / 2) + py * half * 1.3,
        bx,
        by,
      );
      ctx.quadraticCurveTo(
        tx - ux * (len / 2) - px * half * 1.3,
        ty - uy * (len / 2) - py * half * 1.3,
        tx,
        ty,
      );
      break;
  }
  ctx.closePath();
}

/** Draw one arrow and return its canvas. The caller owns wrapping it —
 *  eoweb into a Pixi texture, the editor via drawImage. */
export function drawArrowCanvas(
  shapeId: string,
  element: ElementKey,
  dx: number,
  dy: number,
): HTMLCanvasElement {
  // isArrowShapeId, NOT `ARROW_SHAPES[id] ?? default`. shapeId is authored
  // text with no validation, and a plain object literal inherits Object's
  // prototype — so `ARROW_SHAPES['constructor']` returns a truthy FUNCTION,
  // sails past a `??` fallback, and is then read as a shape (NaN geometry or
  // a crash). Same for 'toString', 'valueOf', '__proto__'. This exact trap
  // has already broken the AIO editor form once. See ARROW_SHAPE_KEYS for why
  // this can't be Object.hasOwn or Object.prototype.hasOwnProperty.call.
  //
  // The explicit `: undefined` (rather than falling through to
  // `ARROW_SHAPES[DEFAULT_ARROW_SHAPE]`) is what lets the `??` below narrow
  // `shape` to a definite ArrowShapeDef with NO non-null assertion: under
  // noUncheckedIndexedAccess, `ARROW_SHAPES[shapeId]` is always
  // `ArrowShapeDef | undefined` no matter how it's guarded, because the guard
  // is a runtime check TS can't fold into the index-signature type. Only a
  // `??` against a standalone-typed const (PLAIN_ARROW_SHAPE) removes the
  // `undefined` for real.
  const shape =
    (isArrowShapeId(shapeId) ? ARROW_SHAPES[shapeId] : undefined) ??
    PLAIN_ARROW_SHAPE;
  // No `??` here: `element` is the closed ElementKey union, so the lookup is
  // always defined and a fallback would be dead code.
  const ramp: Ramp = ELEMENTS[element];

  const canvas = document.createElement('canvas');
  canvas.width = ARROW_CANVAS_SIZE;
  canvas.height = ARROW_CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  const length = LENGTH * shape.lengthScale;
  const headLen = HEAD_LEN * shape.headScale;
  const headHalf = HEAD * shape.headScale;
  const shaftW = SHAFT_WIDTH * shape.shaftScale;

  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const c = ARROW_CANVAS_SIZE / 2;
  const tipX = c + ux * (length / 2);
  const tipY = c + uy * (length / 2);
  const tailX = c - ux * (length / 2);
  const tailY = c - uy * (length / 2);
  const px = -uy;
  const py = ux;

  // The shaft STOPS where the head begins rather than running on to the tip,
  // or the head reads as pasted over the shaft instead of fitted to its end.
  // SHAFT_HEAD_OVERLAP keeps a hair of overlap so antialiasing leaves no seam.
  const shaftEndX = tipX - ux * (headLen - SHAFT_HEAD_OVERLAP);
  const shaftEndY = tipY - uy * (headLen - SHAFT_HEAD_OVERLAP);

  // The fletching is a SOLID swallowtail at the nock, not two vanes: as lines
  // splaying from a point up the shaft, the shaft stayed visible between them
  // — three prongs reading as a tripod. Filling it covers that stretch. The
  // rear edge is NOTCHED so it cannot be mistaken for a backwards arrowhead.
  const apexX = tailX + ux * FLETCH_LEN;
  const apexY = tailY + uy * FLETCH_LEN;
  const backX = tailX - ux * FLETCH_OVERHANG;
  const backY = tailY - uy * FLETCH_OVERHANG;
  const notchX = tailX + ux * FLETCH_NOTCH;
  const notchY = tailY + uy * FLETCH_NOTCH;

  // Path builders shared by both passes, so outline and fill are identical by
  // construction and cannot drift apart.
  const shaftPath = () => {
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(shaftEndX, shaftEndY);
  };
  const fletchingPath = () => {
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(backX + px * FLETCH_SPREAD, backY + py * FLETCH_SPREAD);
    ctx.lineTo(notchX, notchY);
    ctx.lineTo(backX - px * FLETCH_SPREAD, backY - py * FLETCH_SPREAD);
    ctx.closePath();
  };
  const head = () =>
    headPath(ctx, shape.head, tipX, tipY, ux, uy, px, py, headLen, headHalf);

  // Pass 1: EVERY part outlined before ANY part is filled. Outlining each part
  // just before filling it lets a later part's outline cut a dark notch into
  // an earlier part's fill — most visibly where the head meets the shaft.
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = shaftW + OUTLINE * 2;
  shaftPath();
  ctx.stroke();
  ctx.lineWidth = OUTLINE * 2;
  fletchingPath();
  ctx.stroke();
  ctx.lineWidth = OUTLINE * 2;
  head();
  ctx.stroke();

  // Pass 2: ORDER MATTERS. The shaft is filled FIRST so the fletching covers
  // the stretch of it running through the tail; fill the fletching first and
  // the shaft draws back over it, restoring the tripod.
  ctx.lineCap = 'butt';
  ctx.strokeStyle = hex(ramp[SHAFT_STOP]);
  ctx.lineWidth = shaftW;
  shaftPath();
  ctx.stroke();

  ctx.fillStyle = hex(ramp[FLETCH_STOP]);
  fletchingPath();
  ctx.fill();

  ctx.fillStyle = hex(ramp[HEAD_STOP]);
  head();
  ctx.fill();

  return canvas;
}
