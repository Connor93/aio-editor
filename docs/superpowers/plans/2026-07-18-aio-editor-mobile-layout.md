# AIO Editor Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AIO editor usable on a phone by turning the Pubs browser's three-column grid into a one-panel-at-a-time drill-down below `lg`, with a sticky bottom action bar and a responsive header — while leaving the desktop layout pixel-identical.

**Architecture:** Below `lg` (1024px) the Pubs browser shows exactly one of its three existing panels (types → files → editor), chosen by a value *derived* from the `selection`/`selectedType` state already in `PubBrowser`. Two `lg:hidden` back buttons step up a level. The editor's action buttons are extracted into a reused `EditorActions` component and rendered both in the desktop top toolbar and in a mobile bottom action bar that lives in normal flow (not `fixed`), so content can never hide behind it. At `lg`+ everything reverts to today's `grid-cols-[14rem_20rem_1fr]`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite 8. No automated test framework exists in this project — the automated gate is `npm run typecheck` (tsc), and behavior is verified manually in a browser at phone and desktop widths.

## Global Constraints

- **Desktop unchanged:** at viewport width ≥ 1024px (`lg`) the Pubs browser must render identically to today — `grid-cols-[14rem_20rem_1fr]`, single-row editor toolbar, no bottom bar.
- **Breakpoints:** Pubs drill-down switches at Tailwind `lg` (1024px). The app header switches at Tailwind `sm` (640px).
- **No hidden content:** the mobile bottom action bar must be a normal-flow flex child placed *after* the scroll region — never `position: fixed`/`absolute`.
- **No new dependencies.** Tailwind utility classes only; no new npm packages.
- **Verification is manual + typecheck.** There is no test runner; do not add one. Each task ends with `npm run typecheck` passing and a manual browser check.
- **Commit style:** Conventional Commits (`feat(...)`, `refactor(...)`), and end every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Leave unrelated WIP alone:** `packages/backend/src/schemas/items.json` has uncommitted changes unrelated to this work — never stage or revert it. `git add` only the exact files each task names.

---

## File Structure

- `packages/frontend/src/pubs/form/EditorActions.tsx` — **new.** Presentational component: status/error text + the `Diff`/`Discard`/`Push to live`/`Save` buttons. No state of its own; everything via props. Rendered in two places (desktop toolbar, mobile bottom bar) so the button markup has one source of truth.
- `packages/frontend/src/pubs/PubBrowser.tsx` — **modify.** Responsive container + per-panel visibility, `activePanel` derivation, two back buttons, editor top-strip vs. bottom-bar split, render `EditorActions`, diff-modal phone padding.
- `packages/frontend/src/AppShell.tsx` — **modify.** Responsive header (wrap, scrollable nav, hide session text below `sm`).
- `packages/frontend/src/pubs/form/fields.tsx` — **modify (one line).** Picker-modal wrapper phone padding.

**Task order:** Task 1 (extract `EditorActions`, no visual change) must land before Task 2 (which reuses it in the mobile bottom bar). Tasks 3 and 4 are independent and may be done in any order after Task 1.

---

## Task 1: Extract `EditorActions` component (pure refactor, no visual change)

Pull the editor's status/error text and action buttons out of `PubBrowser` into a presentational component, and render it in the existing desktop toolbar. Desktop output must be byte-for-byte identical.

**Files:**
- Create: `packages/frontend/src/pubs/form/EditorActions.tsx`
- Modify: `packages/frontend/src/pubs/PubBrowser.tsx` (replace the inline status+actions block inside the editor toolbar, ~lines 679-717)

**Interfaces:**
- Produces: `EditorActions` React component with this exact prop contract (consumed by Task 2):
  ```ts
  interface EditorActionsProps {
    staged: boolean;
    dirty: boolean;
    saving: boolean;
    stagingBusy: boolean;
    diffLoading: boolean;
    statusMessage: string | null;
    error: string | null;
    onOpenDiff: () => void;
    onDiscard: () => void;
    onPushOne: () => void;
    onSave: () => void;
  }
  ```

- [ ] **Step 1: Create the `EditorActions` component**

Create `packages/frontend/src/pubs/form/EditorActions.tsx` with exactly:

```tsx
interface EditorActionsProps {
  staged: boolean;
  dirty: boolean;
  saving: boolean;
  stagingBusy: boolean;
  diffLoading: boolean;
  statusMessage: string | null;
  error: string | null;
  onOpenDiff: () => void;
  onDiscard: () => void;
  onPushOne: () => void;
  onSave: () => void;
}

/** Status/error text plus the Diff / Discard / Push / Save buttons for the pub
 *  editor. Presentational only — all state comes from PubBrowser via props.
 *  Rendered in two slots: the desktop top toolbar and the mobile bottom bar. */
export function EditorActions({
  staged,
  dirty,
  saving,
  stagingBusy,
  diffLoading,
  statusMessage,
  error,
  onOpenDiff,
  onDiscard,
  onPushOne,
  onSave,
}: EditorActionsProps) {
  return (
    <>
      {statusMessage && (
        <span className="text-xs text-emerald-400">{statusMessage}</span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
      {staged && (
        <>
          <button
            onClick={onOpenDiff}
            disabled={stagingBusy || diffLoading}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
            title="Show diff against live"
          >
            {diffLoading ? "…" : "Diff"}
          </button>
          <button
            onClick={onDiscard}
            disabled={stagingBusy}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
            title="Discard staged change; revert to live"
          >
            Discard
          </button>
          <button
            onClick={onPushOne}
            disabled={stagingBusy}
            className="rounded-md border border-amber-700/60 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
            title="Atomically copy staging → live"
          >
            Push to live
          </button>
        </>
      )}
      <button
        onClick={onSave}
        disabled={!dirty || saving}
        className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save to staging"}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Import `EditorActions` in `PubBrowser.tsx`**

Add this import alongside the other `./form/...` imports near the top of `packages/frontend/src/pubs/PubBrowser.tsx` (they sit around lines 13-17):

```tsx
import { EditorActions } from "./form/EditorActions";
```

- [ ] **Step 3: Replace the inline status + action buttons with `<EditorActions>`**

In `PubBrowser.tsx`, inside the editor toolbar, the right-hand group is:

```tsx
<div className="flex shrink-0 items-center gap-3">
  {schema && (
    <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
      {/* Form / JSON toggle buttons */}
    </div>
  )}
  {statusMessage && (
    <span className="text-xs text-emerald-400">{statusMessage}</span>
  )}
  {error && <span className="text-xs text-red-400">{error}</span>}
  {fileContent?.staged && (
    <>
      {/* Diff / Discard / Push buttons */}
    </>
  )}
  <button onClick={onSave} /* Save to staging */>…</button>
</div>
```

Delete everything from the `{statusMessage && (` line through the closing `</button>` of the Save button (i.e. the status span, the error span, the `{fileContent?.staged && (…)}` block, and the Save button — all of it), and replace it with a single `<EditorActions>` so the group becomes:

```tsx
<div className="flex shrink-0 items-center gap-3">
  {schema && (
    <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
      <button
        onClick={() => setEditorMode("form")}
        className={`px-3 py-1 transition-colors ${
          editorMode === "form"
            ? "bg-slate-100 text-slate-900"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        Form
      </button>
      <button
        onClick={() => setEditorMode("json")}
        className={`px-3 py-1 transition-colors ${
          editorMode === "json"
            ? "bg-slate-100 text-slate-900"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        JSON
      </button>
    </div>
  )}
  <EditorActions
    staged={!!fileContent?.staged}
    dirty={dirty}
    saving={saving}
    stagingBusy={stagingBusy}
    diffLoading={diffLoading}
    statusMessage={statusMessage}
    error={error}
    onOpenDiff={onOpenDiff}
    onDiscard={onDiscard}
    onPushOne={onPushOne}
    onSave={onSave}
  />
</div>
```

(The Form/JSON toggle is intentionally left inline — Task 2 keeps it in the top strip on mobile.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace packages/frontend`
Expected: no errors. (If `EditorActionsProps` and the passed props disagree, tsc fails here — fix the mismatch.)

- [ ] **Step 5: Manual check — desktop unchanged**

Start the frontend if it isn't running: `npm run dev:frontend` (Vite serves at http://localhost:5173). With the browser at full desktop width, open Pubs, select a type and a file. Confirm the editor toolbar looks exactly as before: Form/JSON toggle, then (when the file is staged) Diff / Discard / Push to live, then Save to staging; saving and status/error still behave.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/pubs/form/EditorActions.tsx packages/frontend/src/pubs/PubBrowser.tsx
git commit -m "refactor(pubs): extract EditorActions from PubBrowser toolbar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Responsive Pubs drill-down + mobile bottom action bar

Make the Pubs browser show one panel at a time below `lg`, add back buttons, and render `EditorActions` in a normal-flow bottom bar on mobile.

**Files:**
- Modify: `packages/frontend/src/pubs/PubBrowser.tsx`

**Interfaces:**
- Consumes: `EditorActions` from Task 1 (same prop set passed in Step 3 of Task 1).
- Produces: no new exported symbols. Adds a local `activePanel` derivation used only within `PubBrowser`.

- [ ] **Step 1: Derive the active mobile panel**

In `PubBrowser.tsx`, immediately before the top-level `return (` of the component (just after the `onSave` function, before `return (`), add:

```tsx
  // Which single panel fills the screen below `lg`. Derived from existing
  // selection state so every navigation path (tap type/file, staging jump,
  // "Used in" ref jump) lands on the right panel with no extra wiring.
  const activePanel: "types" | "files" | "editor" = selection
    ? "editor"
    : selectedType
      ? "files"
      : "types";
```

- [ ] **Step 2: Make the container responsive**

Replace the outer container opening tag:

```tsx
<div className="grid h-full grid-cols-[14rem_20rem_1fr] gap-0 border-t border-slate-800">
```

with:

```tsx
<div className="flex h-full flex-col border-t border-slate-800 lg:grid lg:grid-cols-[14rem_20rem_1fr] lg:gap-0">
```

- [ ] **Step 3: Gate the three panels by `activePanel` (with `lg:flex` to restore the desktop grid)**

Replace the **types** `<aside>` opening tag:

```tsx
<aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950/40">
```

with:

```tsx
<aside
  className={`${activePanel === "types" ? "flex" : "hidden"} min-h-0 flex-1 flex-col border-r border-slate-800 bg-slate-950/40 lg:flex lg:flex-none`}
>
```

Replace the **files** `<aside>` opening tag:

```tsx
<aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950/20">
```

with:

```tsx
<aside
  className={`${activePanel === "files" ? "flex" : "hidden"} min-h-0 flex-1 flex-col border-r border-slate-800 bg-slate-950/20 lg:flex lg:flex-none`}
>
```

Replace the **editor** `<section>` opening tag:

```tsx
<section className="flex min-h-0 flex-col bg-slate-950/0">
```

with:

```tsx
<section
  className={`${activePanel === "editor" ? "flex" : "hidden"} min-h-0 flex-1 flex-col bg-slate-950/0 lg:flex lg:flex-none`}
>
```

(Below `lg`, the unprefixed `flex`/`hidden` shows exactly one panel and `flex-1` makes it fill height. At `lg`+, `lg:flex` overrides `hidden` so all three return as grid cells; `flex-grow` is ignored on grid items so `flex-1` has no desktop effect.)

- [ ] **Step 4: Add the "back to types" button in the files header**

The files-panel header is currently:

```tsx
<div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-2">
  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
    Files{" "}
    {files &&
      (visibleFiles && visibleFiles.length !== files.length
        ? `(${visibleFiles.length}/${files.length})`
        : `(${files.length})`)}
  </h2>
  {canCreateNew && (
    /* + new button */
  )}
</div>
```

Wrap the back button and the `<h2>` in a left group so the `+ new` button stays right-aligned and desktop is unchanged (button is `lg:hidden`):

```tsx
<div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-2">
  <div className="flex items-center gap-1.5">
    <button
      type="button"
      onClick={() => {
        setSelectedType(null);
        setSelection(null);
      }}
      className="-ml-1 rounded px-1 text-lg leading-none text-slate-400 hover:bg-slate-800 hover:text-slate-200 lg:hidden"
      title="Back to pub types"
      aria-label="Back to pub types"
    >
      ‹
    </button>
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      Files{" "}
      {files &&
        (visibleFiles && visibleFiles.length !== files.length
          ? `(${visibleFiles.length}/${files.length})`
          : `(${files.length})`)}
    </h2>
  </div>
  {canCreateNew && (
    <button
      onClick={onCreateNew}
      disabled={creating}
      className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      title={`Create a new ${selectedType} entry`}
    >
      {creating ? "…" : "+ new"}
    </button>
  )}
</div>
```

- [ ] **Step 5: Add the "back to files" button + split the editor toolbar for mobile**

In the editor toolbar, the left group is currently:

```tsx
<div className="flex min-w-0 items-center gap-2">
  <span className="truncate font-mono text-slate-200">
    {selection.type}/{selection.filename}
  </span>
  {fileContent?.staged && ( /* staged badge */ )}
  {dirty && ( /* unsaved badge */ )}
</div>
```

Add a `lg:hidden` back button as the first child:

```tsx
<div className="flex min-w-0 items-center gap-2">
  <button
    type="button"
    onClick={() => setSelection(null)}
    className="-ml-1 rounded px-1 text-lg leading-none text-slate-400 hover:bg-slate-800 hover:text-slate-200 lg:hidden"
    title="Back to files"
    aria-label="Back to files"
  >
    ‹
  </button>
  <span className="truncate font-mono text-slate-200">
    {selection.type}/{selection.filename}
  </span>
  {fileContent?.staged && (
    <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
      staged
    </span>
  )}
  {dirty && (
    <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-300">
      unsaved
    </span>
  )}
</div>
```

Then, in the right group of the same toolbar, wrap the `<EditorActions>` (added in Task 1) in a `hidden lg:flex` container so the action buttons leave the top strip on mobile but stay in the desktop toolbar. The right group becomes:

```tsx
<div className="flex shrink-0 items-center gap-3">
  {schema && (
    <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
      <button
        onClick={() => setEditorMode("form")}
        className={`px-3 py-1 transition-colors ${
          editorMode === "form"
            ? "bg-slate-100 text-slate-900"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        Form
      </button>
      <button
        onClick={() => setEditorMode("json")}
        className={`px-3 py-1 transition-colors ${
          editorMode === "json"
            ? "bg-slate-100 text-slate-900"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        JSON
      </button>
    </div>
  )}
  <div className="hidden items-center gap-3 lg:flex">
    <EditorActions
      staged={!!fileContent?.staged}
      dirty={dirty}
      saving={saving}
      stagingBusy={stagingBusy}
      diffLoading={diffLoading}
      statusMessage={statusMessage}
      error={error}
      onOpenDiff={onOpenDiff}
      onDiscard={onDiscard}
      onPushOne={onPushOne}
      onSave={onSave}
    />
  </div>
</div>
```

- [ ] **Step 6: Add the mobile bottom action bar**

Inside the editor `<section>`, the `selection !== null` branch renders a fragment `<>` containing the toolbar, the scrollable content `<div>`, and the optional validation-errors `<div>`. Add the bottom bar as the **last child of that fragment**, immediately after the `{validationErrors.length > 0 && ( … )}` block and before the closing `</>`:

```tsx
{/* Mobile-only action bar. Normal-flow flex child placed AFTER the scroll
    region, so the editor content can never be hidden behind it. Desktop keeps
    its actions in the top toolbar (this is lg:hidden). */}
<div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 bg-slate-950/40 px-4 py-2 lg:hidden">
  <EditorActions
    staged={!!fileContent?.staged}
    dirty={dirty}
    saving={saving}
    stagingBusy={stagingBusy}
    diffLoading={diffLoading}
    statusMessage={statusMessage}
    error={error}
    onOpenDiff={onOpenDiff}
    onDiscard={onDiscard}
    onPushOne={onPushOne}
    onSave={onSave}
  />
</div>
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck --workspace packages/frontend`
Expected: no errors.

- [ ] **Step 8: Manual check — desktop still identical**

Browser at ≥1024px: Pubs shows all three columns; editor toolbar is a single row with the actions; there is **no** bottom bar. Select a type, a file; save/stage/push/discard/diff all behave as before.

- [ ] **Step 9: Manual check — mobile drill-down**

Narrow the window below 1024px (or use devtools responsive mode at ~390px). Verify:
- Only the **types** list shows at first (with the Staging panel on top).
- Tap a type → only the **files** list shows, with a `‹` back button; tap `‹` → back to types.
- Tap a file → only the **editor** shows, with a `‹` back button; tap `‹` → back to files.
- The **bottom action bar** is visible with Save (and Diff/Discard/Push when staged).
- Scroll the editor to the very bottom: the last form field is fully visible **above** the bar — nothing is hidden behind it. Re-check with a staged file (4 buttons) and with the validation-errors panel showing (save an intentionally invalid value).
- Staging-panel select and an item's "Used in" link both jump straight to the editor.

- [ ] **Step 10: Commit**

```bash
git add packages/frontend/src/pubs/PubBrowser.tsx
git commit -m "feat(pubs): mobile drill-down layout with sticky bottom action bar

Below lg, show one panel at a time (types -> files -> editor) with back
buttons; move editor actions into a normal-flow bottom bar so content is
never hidden. Desktop 3-column layout unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Responsive app header

Stop the header overflowing on a phone: title + Sign out on the top row, nav tabs on a scrollable second row, session text hidden below `sm`.

**Files:**
- Modify: `packages/frontend/src/AppShell.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: nothing new. Pure markup/classes change.

- [ ] **Step 1: Replace the header markup**

In `AppShell.tsx`, replace the entire `<header> … </header>` block:

```tsx
<header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3">
  <div className="flex items-baseline gap-6">
    <h1 className="text-lg font-semibold">AIO Editor</h1>
    <nav className="flex gap-1 text-sm">
      {/* four NavTab buttons */}
    </nav>
  </div>
  <div className="flex items-center gap-4 text-sm">
    {expiresAt && (
      <span className="text-slate-400">
        session ends {new Date(expiresAt).toLocaleString()}
      </span>
    )}
    <button
      onClick={onLogout}
      className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
    >
      Sign out
    </button>
  </div>
</header>
```

with (flex-wrap + `order-*` so DOM order works for both layouts; nav is `w-full` below `sm` to force its own row, `sm:w-auto` inline on desktop):

```tsx
<header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-6">
  <h1 className="order-1 text-lg font-semibold">AIO Editor</h1>
  <div className="order-2 ml-auto flex items-center gap-4 text-sm sm:order-3">
    {expiresAt && (
      <span className="hidden text-slate-400 sm:inline">
        session ends {new Date(expiresAt).toLocaleString()}
      </span>
    )}
    <button
      onClick={onLogout}
      className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
    >
      Sign out
    </button>
  </div>
  <nav className="order-3 w-full overflow-x-auto pb-0.5 text-sm sm:order-2 sm:w-auto sm:overflow-visible">
    <div className="flex w-max gap-1">
      <NavTab
        active={view === "pubs"}
        onClick={() => setView("pubs")}
        label="Pubs"
      />
      <NavTab
        active={view === "rolls"}
        onClick={() => setView("rolls")}
        label="Roll simulator"
      />
      <NavTab
        active={view === "maps"}
        onClick={() => setView("maps")}
        label="Maps"
      />
      <NavTab
        active={view === "mapeditor"}
        onClick={() => setView("mapeditor")}
        label="Map Editor"
      />
    </div>
  </nav>
</header>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace packages/frontend`
Expected: no errors.

- [ ] **Step 3: Manual check — desktop header unchanged**

Browser at ≥640px: header is one row — `AIO Editor`, the four tabs, then (right-aligned) the `session ends …` text and `Sign out`. Tabs switch views as before.

- [ ] **Step 4: Manual check — mobile header**

Browser below 640px (~390px): row 1 is `AIO Editor` on the left and `Sign out` on the right (session text hidden); row 2 is the tab strip, which **scrolls horizontally** and shows all four tabs without overflowing or wrapping into a jumble.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/AppShell.tsx
git commit -m "feat(shell): responsive header with scrollable nav on mobile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Modal phone padding

Give the two full-screen modals breathing room on a phone by shrinking the overlay padding below `sm`. Both already use `w-full max-w-*`, so this is a one-class change each.

**Files:**
- Modify: `packages/frontend/src/pubs/form/fields.tsx` (graphic-picker modal overlay)
- Modify: `packages/frontend/src/pubs/PubBrowser.tsx` (diff modal overlay)

**Interfaces:**
- Consumes/Produces: nothing. Class-only change.

- [ ] **Step 1: Picker modal overlay padding**

In `fields.tsx`, the graphic-picker overlay wrapper is:

```tsx
className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur"
```

Change `p-6` to `p-3 sm:p-6`:

```tsx
className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur sm:p-6"
```

- [ ] **Step 2: Diff modal overlay padding**

In `PubBrowser.tsx`, the diff-modal overlay wrapper is:

```tsx
className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur"
```

Change `p-6` to `p-3 sm:p-6`:

```tsx
className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur sm:p-6"
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace packages/frontend`
Expected: no errors.

- [ ] **Step 4: Manual check — modals on a phone**

Below 640px: open an item's icon/worn-graphic picker (a `spec1`/gfx field in the item form) and confirm the modal fits the viewport with a small margin. Stage a change and open **Diff**; confirm that modal fits too. Both close on the backdrop/close button as before.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pubs/form/fields.tsx packages/frontend/src/pubs/PubBrowser.tsx
git commit -m "fix(pubs): tighten modal padding on small screens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm run typecheck --workspace packages/frontend` passes.
- [ ] `npm run build --workspace packages/frontend` succeeds (catches anything typecheck misses).
- [ ] Desktop (≥1024px): Pubs three-column layout and header are visually identical to before this branch.
- [ ] Mobile (~390px): full loop works — pick type → pick file → edit → Save/Push → back → back; bottom bar never hides content; header nav scrolls; picker and diff modals fit.
- [ ] `git status` shows only the four intended files committed; `packages/backend/src/schemas/items.json` remains modified-but-unstaged (untouched).

## Notes for the implementer

- **No test runner exists here on purpose.** Do not scaffold Vitest/Testing-Library. The gates are `npm run typecheck`, `npm run build`, and the manual browser checks in each task.
- **Full manual verification needs the stack running** (aio backend + reoserv for auth/data/usage). If only the frontend is available, you can still verify the login screen, the header responsiveness, and the Pubs empty states; the drill-down and modals need real pub data.
- **The `‹` glyph** is U+2039 (single left-pointing angle quotation mark). Keep it as a literal in the JSX.
- **Why the bottom bar isn't `fixed`:** a `position: fixed` footer would overlap the scrollable form and, worse, sit under the mobile keyboard. As the last normal-flow flex child after the `flex-1 overflow-y-auto` region, it shrinks the scroll area instead — content is structurally guaranteed to stay above it.
