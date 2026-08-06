# VFX asset attribution

All sprite sheets in this directory are CC0 (public domain, no attribution
required). Credits are listed anyway as good practice.

## ring-burst.png

- **Source:** [Ring Explosion](https://opengameart.org/content/ring-explosion) by BenHickling, OpenGameArt.org
- **License:** CC0 1.0 Universal
- **Original file:** `explosion2_4.png` (1000x600, 10x6 grid of 100x100 cells, 56 authored frames)
- **Modification:** re-tiled from the original 10x6 grid into a single-row
  horizontal strip (55 frames, 100x100 each, 5500x100 total) to match this
  project's sprite-sheet loader, which slices a single row. The leading and
  trailing fully-transparent grid cells were dropped; no pixel content was
  altered otherwise.
- **Used for:** `cast-burst`

## fire-flicker.png

- **Source:** [Animated Fire](https://opengameart.org/content/animated-fire) by BenHickling, OpenGameArt.org
- **License:** CC0 1.0 Universal
- **Original file:** `fire1_64.png` (640x384, 10x6 grid of 64x64 cells, 60 frames)
- **Modification:** cropped to the top row only (10 frames, 64x64 each,
  640x64 total), which is already a clean horizontal strip in the source
  file. No pixel content was altered.
- **Used for:** `fire-impact`

## buff-aura

No curated sheet vendored yet — falls back to the procedural tinted-ring
placeholder in `vfx-loader.ts`.
