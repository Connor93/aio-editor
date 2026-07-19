# AIO Editor — mobile layout

Date: 2026-07-18
Status: Approved (pending spec review)

## Problem

The AIO editor is hardly usable on a phone. The Pubs browser
(`packages/frontend/src/pubs/PubBrowser.tsx`) renders a hard-coded three-column
grid — `grid-cols-[14rem_20rem_1fr]` (pub types → files → editor). On a narrow
screen all three columns are squeezed side by side, so the editor that opens on
the right when you select a file is too narrow to read or use. The app header
also overflows a phone-width row.

## Goals

- Below a breakpoint, the Pubs flow shows **one panel full-width at a time**
  (drill-down: types → files → editor) with back navigation.
- The desktop three-column layout is **pixel-identical** to today at and above
  the breakpoint.
- The app header stops overflowing on a phone.
- No page content is ever hidden behind the mobile action bar.

## Non-goals

- **Map Editor** (`maps/MapEditor.tsx`) — an iframe hosting the desktop
  eomap-js tile editor. A tile editor on a phone isn't practical; left untouched.
- **RollSimulator / MapUploader** — already responsive (`flex-wrap`,
  `md:grid-cols-2`, centered `max-w-xl`). Touched only if the once-over surfaces
  something obviously broken.
- **Form-field internals** — `fields.tsx` groups already collapse
  `md:grid-cols-2 → grid-cols-1` below `md`; stat/scaling cards likewise. No
  change needed.

## Approach

### Breakpoint

Switch at Tailwind `lg` (1024px):

- `≥ 1024px` → existing three-column grid, unchanged.
- `< 1024px` → drill-down, one panel at a time.

Rationale: the two side rails alone are 14rem + 20rem = 544px, so even at 768px
the editor would be a ~220px sliver. `lg` gives phones and small/portrait
tablets the drill-down; only genuine desktop / landscape-tablet width keeps the
columns.

### Derived active panel (no new architecture)

The visible mobile panel is derived from state that already exists — no new
navigation state, no per-callback rewrites:

```
activePanel = selection ? "editor" : selectedType ? "files" : "types"
```

Each of the three existing panels gets a visibility class:

```
<types panel>  className={`${active === "types"  ? "flex" : "hidden"} lg:flex ...`}
<files panel>  className={`${active === "files"  ? "flex" : "hidden"} lg:flex ...`}
<editor panel> className={`${active === "editor" ? "flex" : "hidden"} lg:flex ...`}
```

Below `lg`, exactly one panel is `flex` and the rest are `hidden`. At `lg`+,
`lg:flex` forces all three back into the grid. The container is
`lg:grid lg:grid-cols-[14rem_20rem_1fr]`; below `lg` it's a plain full-height
block so the single visible panel fills the width.

Every existing navigation path already sets this state, so each lands on the
right panel automatically:

- tap a pub type → sets `selectedType`, clears `selection` → **files**
- tap a file → sets `selection` → **editor**
- staging-panel `onSelect` → sets type + selection → **editor**
- "Used in" ref jump (`navigateToPub`) → sets type + selection → **editor**

## Detailed design

### 1. PubBrowser panel visibility

- Container: `flex h-full flex-col lg:grid lg:grid-cols-[14rem_20rem_1fr]`
  (keep the existing `border-t`).
- Apply the three `active`/`lg:flex` visibility classes above to the two
  `<aside>`s and the `<section>`.
- Compute `activePanel` once from `selection` / `selectedType`.

### 2. Back navigation (both `lg:hidden`)

- **Files header:** a `‹` button that clears `selectedType` (and `selection`)
  → returns to **types**.
- **Editor top strip:** a `‹` button that clears `selection` → returns to
  **files**.

### 3. Editor: top strip + bottom action bar

The current editor toolbar packs filename + badges + `Form|JSON` + status/error
+ `Diff`/`Discard`/`Push`/`Save` into one row — too much for a phone.

- **Top strip:**
  - mobile: `‹` back · truncated `type/filename` · `staged`/`unsaved` badges ·
    `Form|JSON` toggle.
  - the action-button group is `hidden lg:flex` (desktop keeps its single-row
    toolbar exactly as today).
- **Bottom action bar (`lg:hidden`):** holds `EditorActions` — `Save` (primary)
  + staged actions (`Diff`/`Discard`/`Push to live`) + status/error text.

**No-hidden-content guarantee.** The bottom bar is a normal-flow flex child, not
a `fixed`/absolute overlay. The editor `<section>` is already
`flex min-h-0 flex-col` with the content region as `flex-1 overflow-y-auto`.
Order of flex children in the editor column:

1. top strip (non-scrolling)
2. content region (`flex-1 overflow-y-auto`)
3. validation-errors panel (optional, existing `border-t`)
4. bottom action bar (`lg:hidden`, non-scrolling)

Because the bar participates in normal flow, the scroll region shrinks to sit
*above* it. Content therefore cannot render behind the bar — this holds with the
validation panel present and with the on-screen keyboard open.

**`EditorActions` extraction.** Pull the action buttons + status/error out of
`PubBrowser` into a small `EditorActions` component (props: the handlers and
disabled/busy flags it needs, `staged`, `dirty`, `saving`, `stagingBusy`,
`diffLoading`, `statusMessage`, `error`). Render it in two places:

- desktop top toolbar wrapper: `hidden lg:flex`
- mobile bottom bar wrapper: `lg:hidden`

Single source of truth for the buttons; also trims the 854-line `PubBrowser`.

### 4. Staging panel

`StagingPanel` already sits at the top of the left (types) rail. On mobile that
puts it on the **types "home" screen**, reachable whenever no file is open, with
`Push all` intact. No move required.

### 5. App header (`AppShell.tsx`)

The header row (title + 4 nav tabs + "session ends …" + Sign out) overflows a
phone.

- Keep title + `Sign out` on the top row.
- **Nav tabs:** a horizontally-scrollable row (`overflow-x-auto`, no wrap) on
  small screens; inline as today on desktop. Wrap the header contents so the nav
  can drop to its own line below `sm`.
- **"session ends …"** text: `hidden sm:inline` (non-essential; Sign out stays).

### 6. Modal width pass (light)

- Picker modal (`fields.tsx`, `max-w-5xl`) and Diff modal
  (`PubBrowser.tsx`, `max-w-4xl`): confirm each panel is `w-full` with small-screen
  padding so it doesn't overflow a phone. Add `w-full` / adjust outer padding
  only if missing. No redesign.

## Files touched

- `packages/frontend/src/pubs/PubBrowser.tsx` — container + panel visibility
  classes, `activePanel` derivation, two back buttons, top-strip vs. bottom-bar
  split, render `EditorActions`, Diff-modal width check.
- `packages/frontend/src/pubs/form/EditorActions.tsx` — **new** small component
  (extracted action buttons + status/error).
- `packages/frontend/src/AppShell.tsx` — responsive header.
- `packages/frontend/src/pubs/form/fields.tsx` — picker-modal width check only.

## Verification

No automated tests in this project. Verify by running the frontend
(`npm run dev:frontend`) and exercising, at a phone width (~375–414px) and at
desktop width:

- Desktop (≥1024px): three-column layout visually unchanged; toolbar single row.
- Mobile (<1024px):
  - types → files → editor drill-down; both back buttons step up correctly.
  - staging `onSelect` and a "Used in" ref jump both land on the editor.
  - bottom action bar visible; scroll the editor to the very bottom and confirm
    the last field is fully visible above the bar (test with and without staged
    actions, and with the validation-errors panel showing).
  - header does not overflow; nav tabs scroll horizontally; Sign out reachable.
  - open the item icon picker and a diff — neither modal overflows the viewport.

## Risks

- **Tailwind can't express "visible only below `lg` when active."** Handled by
  combining a runtime `flex`/`hidden` class (from `activePanel`) with a static
  `lg:flex`. Verify all three panels reappear together at `lg`.
- **Duplicated action markup drifting.** Mitigated by the single `EditorActions`
  component rendered in both slots.
- **Keyboard covering the bottom bar / last field.** Normal-flow (non-fixed) bar
  avoids the classic fixed-footer-under-keyboard bug; still worth confirming on a
  real device.
