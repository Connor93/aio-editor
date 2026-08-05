# Skills & Statuses Form Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AIO editor schema-driven forms for the `skills/` and `statuses/` pub types (today raw-JSON-only), including a reusable editor for the tagged-union fields (`actions`, `scaling`, `modifiers`, `triggers`, `ticks`, effect `when`).

**Architecture:** Two hand-authored backend JSON schemas (`skills.json`, `statuses.json`) registered in `validation.ts`, mirroring the reoserv structs. One new reusable frontend `OneOfField` renders JSON-Schema `oneOf` unions via a variant selector (tagged by a discriminator hint, or untagged/type-distinguished). One small `SuggestField` gives free-entry-with-suggestions for icon/vfx refs. Everything else auto-wires: `listPubTypes` already lists the dirs, so once a schema is registered the form appears.

**Tech Stack:** TypeScript, Preact, ajv (draft-07), tsx (test scripts). Companion spec: `docs/superpowers/specs/2026-08-05-skills-statuses-form-editor-design.md` — read it for the full reoserv type reference (every union branch + enum value).

## Global Constraints

- **No reoserv changes.** The schemas copy the reoserv structs; the source of truth is the spec's type tables.
- **`Element` is PascalCase**: `None, Fire, Water, Earth, Wind, Light, Dark`. A lowercased element silently drops the pub in reoserv — the `x-aio-options` values must be PascalCase.
- **`StatusTarget::SelfCaster` serializes as `"self"`** (not `self_caster`); the other value is `"target"`.
- **Two distinct `ScalingSource` unions** — the skill one (`ScalingTerm`, discriminator `source`, values `attack_power/stat/level/spell_power/healing_power`) and the effects one (inside `EffectValue.Scaling`, discriminator `type`, values `rep_in_zone/self_hp_missing/self_hp_current/self_tp_missing/self_tp_current/player_level`). Keep them separate.
- **Enums are authored as `x-aio-options`** (`[{value,label,description?}]`), never bare JSON-Schema `enum` — matches all 12 existing schemas and is what `SelectField` renders.
- **Discriminated-union branches** use standard ajv keywords: each branch `required`s its tag property and pins it with `const`. A sibling **`discriminator: {propertyName}`** hint drives the frontend selector; ajv (`strict:false`) ignores it.
- **Schemas are draft-07**: local defs under `definitions`, referenced by `$ref: "#/definitions/..."` (NOT `$defs`).
- **Status refs are free**: `x-aio-ref: {type:"statuses", by:"filename-stem"}` + the existing `StringReferenceField` resolve a status picker (status filename stem == its `id`). No `RefsContext` change.
- **Gates:** `tsc -p tsconfig.json --noEmit` in the changed package. **No biome** (none configured). Automated tests are standalone **`tsx`** scripts; component rendering is a documented manual pass.
- **Backend build** copies `src/schemas → dist/schemas` automatically; new schema JSON needs only the `import ... with {type:"json"}` + `rawSchemas` key in `validation.ts`.
- Frontend never blocks save; backend ajv is authoritative for validation.

---

## File Structure

**Frontend (`packages/frontend/src/pubs/form/`):**
- `schema.ts` — add `oneOf`/`discriminator`/`const`/`x-aio-suggest` to `JsonSchema`; add `oneOf` handling to `makeDefault`.
- `fields.tsx` — add `OneOfField` + `SuggestField`; add their dispatch to `SchemaField`.

**Backend (`packages/backend/src/`):**
- `schemas/skills.json` — new.
- `schemas/statuses.json` — new.
- `pubs/validation.ts` — register both (imports + `rawSchemas` keys).
- `scripts/validate-pubs.ts` — new tsx validation script; wired as an npm script.

**Deliverable order:** Task 1 (union engine) → Task 2 (suggest field) → Task 3 (skills schema + script) → Task 4 (statuses schema) → Task 5 (integration + skeleton-valid + manual pass). Tasks 3/4 depend on 1 for the form to render unions, but the schema JSON + backend validation are independently testable before the frontend lands.

---

### Task 1: Frontend union engine — `oneOf` in `schema.ts` + `OneOfField`

**Files:**
- Modify: `packages/frontend/src/pubs/form/schema.ts` (JsonSchema type ~line 17; makeDefault ~line 119)
- Modify: `packages/frontend/src/pubs/form/fields.tsx` (SchemaField ~line 30; add OneOfField)

**Interfaces:**
- Produces: `OneOfField` component (CommonProps) + `JsonSchema.oneOf?: JsonSchema[]`, `JsonSchema.discriminator?: {propertyName: string}`, `JsonSchema.const?: unknown`.
- Consumes: existing `SchemaField`, `ObjectField`, `makeDefault`, `resolveRef`, `CommonProps`.

- [ ] **Step 1: Extend the `JsonSchema` type.** In `schema.ts`, add to the `JsonSchema` interface:

```ts
  /** Discriminated / untagged union. Rendered by OneOfField. */
  oneOf?: JsonSchema[];
  /** Frontend hint: the property whose value selects the oneOf branch.
   *  Absent → untagged union (branches distinguished by JSON type). */
  discriminator?: { propertyName: string };
  /** Single allowed value (used to pin a union branch's tag). */
  const?: unknown;
```

- [ ] **Step 2: Handle `const` and `oneOf` in `makeDefault`.** In `schema.ts` `makeDefault`, immediately after `const resolved = resolveRef(schema, rootSchema);` add:

```ts
  // A `const` node (a pinned union tag) skeletons to its fixed value.
  if (Object.prototype.hasOwnProperty.call(resolved, "const")) {
    return resolved.const;
  }
  if (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0) {
    // Default a union to its first branch's skeleton.
    return makeDefault(resolved.oneOf[0], rootSchema);
  }
```

Why `const` matters: a union branch pins its tag with e.g. `"action": { "const": "deal_damage" }`, and that tag property is `required`, so `makeDefault`'s object loop recurses into it. Without this, `{const:"deal_damage"}` (no `type`/`default`) hits the `default: return null` arm → a skeleton `{action: null, ...}` that fails ajv (Task 5 Step 2 would catch it, but fix it here at the source).

- [ ] **Step 3: Write the failing skeleton test.** Create `packages/frontend/src/pubs/form/__oneof_check.ts` (a temporary tsx-run assertion; deleted in Step 8 after folding into the backend script, OR keep as a committed check — see Task 5). Content:

```ts
import { makeDefault, type JsonSchema } from "./schema";

const tagged: JsonSchema = {
  oneOf: [
    { type: "object", title: "Deal Damage", required: ["action"],
      properties: { action: { const: "deal_damage" }, min: { type: "integer", default: 0 } } },
    { type: "object", title: "Heal", required: ["action"],
      properties: { action: { const: "heal" }, hp: { type: "integer", default: 0 } } },
  ],
  discriminator: { propertyName: "action" },
};
const d = makeDefault(tagged, tagged) as Record<string, unknown>;
if (d.action !== "deal_damage") throw new Error(`tagged default tag = ${d.action}`);

const untagged: JsonSchema = { oneOf: [{ type: "number", default: 0 }, { type: "object", properties: {} }] };
if (makeDefault(untagged, untagged) !== 0) throw new Error("untagged default should be 0");
console.log("oneof makeDefault OK");
```

- [ ] **Step 4: Run it — expect FAIL** (OneOfField not needed yet; this tests makeDefault only). Run: `cd packages/frontend && npx tsx src/pubs/form/__oneof_check.ts`. Expected before Step 2: throws / wrong tag. After Step 2: prints `oneof makeDefault OK`. (If you did Steps 1–2 first, it passes now — that is fine; the point is the assertion exists and passes.)

- [ ] **Step 5: Add `OneOfField` to `fields.tsx`.** Place it near `ObjectField`. It renders a variant `<select>` + the selected branch (an `ObjectField` for object branches, or the raw child field for scalar branches like the untagged number), preserving the discriminator via each branch's `const`.

```tsx
function branchTitle(b: JsonSchema, i: number): string {
  return b.title ?? `Option ${i + 1}`;
}

// Which oneOf branch does the current value match?
function activeBranchIndex(
  branches: JsonSchema[],
  discrim: string | undefined,
  value: unknown,
): number {
  if (discrim && value && typeof value === "object") {
    const tag = (value as Record<string, unknown>)[discrim];
    const i = branches.findIndex(
      (b) => b.properties?.[discrim]?.const === tag,
    );
    if (i >= 0) return i;
  }
  if (!discrim) {
    // Untagged: match by JSON type (object vs scalar).
    const isObj = value !== null && typeof value === "object" && !Array.isArray(value);
    const i = branches.findIndex((b) => (b.type === "object") === isObj);
    if (i >= 0) return i;
  }
  return 0;
}

function OneOfField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const branches = schema.oneOf ?? [];
  const discrim = schema.discriminator?.propertyName;
  const active = activeBranchIndex(branches, discrim, value);
  const branch = branches[active] ?? branches[0];

  const onPick = (nextIdx: number) => {
    if (nextIdx === active) return;
    onChange(makeDefault(branches[nextIdx], rootSchema));
  };

  // For an object branch, render its fields but hide the discriminator prop
  // (the <select> owns it). Build a copy of the branch minus that property.
  const childSchema: JsonSchema =
    branch.type === "object" && discrim && branch.properties
      ? { ...branch, properties: Object.fromEntries(
            Object.entries(branch.properties).filter(([k]) => k !== discrim)) }
      : branch;

  return (
    <div className="space-y-1">
      <FieldLabel label={label} required={required} path={path} />
      <select
        className={SELECT_CLS}
        value={String(active)}
        onChange={(e) => onPick(Number((e.target as HTMLSelectElement).value))}
      >
        {branches.map((b, i) => (
          <option key={i} value={String(i)}>{branchTitle(b, i)}</option>
        ))}
      </select>
      <SchemaField
        schema={childSchema}
        value={value}
        onChange={onChange}
        rootSchema={rootSchema}
        path={path}
      />
    </div>
  );
}
```

Notes for the implementer: reuse the existing `FieldLabel` component and whatever the file's select-className constant is (grep `SelectField` for the exact `className`; name it `SELECT_CLS` locally or inline the string). For an **object** branch the child `ObjectField` re-renders the discriminator property only if we DON'T strip it — we strip it, so the tag stays in `value` (set by `makeDefault`/the previous state) but isn't shown twice. For a **scalar untagged** branch (the `number`), `childSchema` is the branch itself and `SchemaField` routes to `NumberField`.

- [ ] **Step 6: Dispatch `oneOf` in `SchemaField`.** In `fields.tsx` `SchemaField`, add — after the three `x-aio-display` checks and BEFORE `if (resolved.type === "object")`:

```tsx
  if (resolved.oneOf) {
    return <OneOfField {...props} schema={resolved} />;
  }
```

- [ ] **Step 7: Typecheck.** Run: `cd packages/frontend && npx tsc -p tsconfig.json --noEmit`. Expected: clean.

- [ ] **Step 8: Re-run the skeleton check + commit.** Run: `npx tsx src/pubs/form/__oneof_check.ts` → `oneof makeDefault OK`. Delete `__oneof_check.ts` (its assertions move into the backend `validate-pubs.ts` in Task 3/5 which also imports `makeDefault`), then:

```bash
git add packages/frontend/src/pubs/form/schema.ts packages/frontend/src/pubs/form/fields.tsx
git commit -m "feat(form): OneOfField + oneOf/discriminator support in SchemaForm"
```

---

### Task 2: Frontend `SuggestField` — free-entry-with-suggestions for icon/vfx

**Files:**
- Modify: `packages/frontend/src/pubs/form/schema.ts` (JsonSchema type)
- Modify: `packages/frontend/src/pubs/form/fields.tsx` (SchemaField + new component)
- Create: `packages/frontend/src/pubs/form/suggest-values.ts`

**Interfaces:**
- Produces: `JsonSchema["x-aio-suggest"]?: string[]` (or a `{ list: string }` pointer — use the inline array form for simplicity) + `SuggestField`.

- [ ] **Step 1: Extend `JsonSchema`.** Add to the interface in `schema.ts`:

```ts
  /** Free-text string with a datalist of suggested values. Stores the raw
   *  string (unknown values allowed — eoweb vendors new icon/vfx refs). */
  "x-aio-suggest"?: string[];
```

- [ ] **Step 2: Vendored suggestion lists.** Create `suggest-values.ts`:

```ts
// Suggestion lists for icon/vfx string refs. These live in eoweb (the icon
// manifest + vfx manifest); duplicated here for authoring convenience ONLY.
// Free entry is always allowed — a new value here must be vendored in eoweb
// before it renders in-game. Keep loosely in sync; drift is non-fatal.
// Source: eoweb src/render/skill-icon-manifest.ts (SKILL_ICONS) + src/render/vfx/vfx-manifest.ts (VFX keys).
export const ICON_SUGGESTIONS: string[] = [
  // TODO(implementer): transcribe the slugs from eoweb SKILL_ICONS + the
  // icon_id values in reoserv data/pub/{skills,statuses}/*.json (grep them).
];
export const VFX_SUGGESTIONS: string[] = [
  // TODO(implementer): transcribe the keys from eoweb src/render/vfx/vfx-manifest.ts VFX.
];
```

Implementer: populate both from the real sources — `grep -h '"icon_id"' /Users/cfraser/Projects/reoserv/data/pub/skills/*.json /Users/cfraser/Projects/reoserv/data/pub/statuses/*.json | sort -u` for icons, and the `VFX` object keys in `/Users/cfraser/Projects/eoweb/src/render/vfx/vfx-manifest.ts` for vfx (currently `cast-burst`, `fire-impact`, `buff-aura`). Include all distinct values. (These are the only cross-repo TODOs and are data-only.)

- [ ] **Step 3: `SuggestField` component.** In `fields.tsx`:

```tsx
function SuggestField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const listId = `suggest-${path}`;
  const suggestions = schema["x-aio-suggest"] ?? [];
  const current = typeof value === "string" ? value : "";
  return (
    <div className="space-y-1">
      <FieldLabel label={label} required={required} path={path} />
      <input
        className={INPUT_CLS}
        list={listId}
        value={current}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
```

Use the file's existing input-className constant (grep `StringField` for it).

- [ ] **Step 4: Dispatch.** In `SchemaField`, add after the `x-aio-ref` block and before `x-aio-display`:

```tsx
  if (resolved["x-aio-suggest"]) {
    return <SuggestField {...props} schema={resolved} />;
  }
```

- [ ] **Step 5: Typecheck + commit.** Run `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` (clean), then:

```bash
git add packages/frontend/src/pubs/form
git commit -m "feat(form): SuggestField (datalist) for icon/vfx refs"
```

---

### Task 3: Backend `skills.json` schema + registration + validation script

**Files:**
- Create: `packages/backend/src/schemas/skills.json`
- Modify: `packages/backend/src/pubs/validation.ts`
- Create: `packages/backend/src/scripts/validate-pubs.ts`
- Modify: `packages/backend/package.json` (add `validate:pubs` script)

**Interfaces:**
- Produces: a registered `skills` schema; a `validate-pubs.ts` script that ajv-checks real + malformed pubs.

- [ ] **Step 1: Author `schemas/skills.json`.** Full content (draft-07; enums as `x-aio-options`; unions as `oneOf` + `const` tag + `discriminator` hint):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://aio-editor/schemas/skills.json",
  "title": "Skill",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "string", "minLength": 1, "title": "ID" },
    "name": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "icon_id": { "type": "string", "x-aio-suggest": [] },
    "cost": { "type": "object", "additionalProperties": false,
      "properties": { "hp": { "type": "integer", "default": 0 }, "tp": { "type": "integer", "default": 0 } } },
    "cooldown_ms": { "type": "integer", "minimum": 0, "default": 0 },
    "target": { "type": "string", "default": "self_only", "x-aio-options": [
      { "value": "self_only", "label": "Self only" },
      { "value": "single_enemy", "label": "Single enemy" } ] },
    "range": { "type": "integer", "minimum": 0, "maximum": 252, "default": 0,
      "description": "Cast range in tiles (0 = use weapon range)." },
    "kind": { "type": "string", "default": "active", "x-aio-options": [
      { "value": "active", "label": "Active" },
      { "value": "toggle", "label": "Toggle" } ] },
    "on_status": { "type": "string", "x-aio-ref": { "type": "statuses", "by": "filename-stem" },
      "description": "Status flipped by a toggle skill." },
    "cast_vfx": { "type": "string", "x-aio-suggest": [] },
    "impact_vfx": { "type": "string", "x-aio-suggest": [] },
    "actions": { "type": "array", "items": { "$ref": "#/definitions/skillAction" } }
  },
  "definitions": {
    "element": { "type": "string", "default": "None", "x-aio-options": [
      { "value": "None", "label": "None" }, { "value": "Fire", "label": "Fire" },
      { "value": "Water", "label": "Water" }, { "value": "Earth", "label": "Earth" },
      { "value": "Wind", "label": "Wind" }, { "value": "Light", "label": "Light" },
      { "value": "Dark", "label": "Dark" } ] },
    "coreStat": { "type": "string", "default": "str", "x-aio-options": [
      { "value": "str", "label": "STR" }, { "value": "int", "label": "INT" },
      { "value": "wis", "label": "WIS" }, { "value": "agi", "label": "AGI" },
      { "value": "con", "label": "CON" }, { "value": "cha", "label": "CHA" } ] },
    "scalingTerm": {
      "oneOf": [
        { "type": "object", "title": "Attack power", "additionalProperties": false, "required": ["source", "coefficient"],
          "properties": { "source": { "const": "attack_power" }, "coefficient": { "type": "number", "default": 1 } } },
        { "type": "object", "title": "Core stat", "additionalProperties": false, "required": ["source", "stat", "coefficient"],
          "properties": { "source": { "const": "stat" }, "stat": { "$ref": "#/definitions/coreStat" }, "coefficient": { "type": "number", "default": 1 } } },
        { "type": "object", "title": "Level", "additionalProperties": false, "required": ["source", "coefficient"],
          "properties": { "source": { "const": "level" }, "coefficient": { "type": "number", "default": 1 } } },
        { "type": "object", "title": "Spell power", "additionalProperties": false, "required": ["source", "coefficient"],
          "properties": { "source": { "const": "spell_power" }, "coefficient": { "type": "number", "default": 1 } } },
        { "type": "object", "title": "Healing power", "additionalProperties": false, "required": ["source", "coefficient"],
          "properties": { "source": { "const": "healing_power" }, "coefficient": { "type": "number", "default": 1 } } }
      ],
      "discriminator": { "propertyName": "source" }
    },
    "skillAction": {
      "oneOf": [
        { "type": "object", "title": "Deal damage", "additionalProperties": false, "required": ["action"],
          "properties": {
            "action": { "const": "deal_damage" },
            "min": { "type": "integer", "default": 0 }, "max": { "type": "integer", "default": 0 },
            "element": { "$ref": "#/definitions/element" },
            "scaling": { "type": "array", "items": { "$ref": "#/definitions/scalingTerm" } } } },
        { "type": "object", "title": "Heal", "additionalProperties": false, "required": ["action"],
          "properties": {
            "action": { "const": "heal" },
            "hp": { "type": "integer", "default": 0 }, "tp": { "type": "integer", "default": 0 },
            "scaling": { "type": "array", "items": { "$ref": "#/definitions/scalingTerm" } } } },
        { "type": "object", "title": "Apply status", "additionalProperties": false, "required": ["action", "status_id"],
          "properties": {
            "action": { "const": "apply_status" },
            "status_id": { "type": "string", "x-aio-ref": { "type": "statuses", "by": "filename-stem" } },
            "to": { "type": "string", "default": "self", "x-aio-options": [
              { "value": "self", "label": "Caster (self)" }, { "value": "target", "label": "Enemy target" } ] } } }
      ],
      "discriminator": { "propertyName": "action" }
    }
  }
}
```

Implementer: fill `icon_id`/`cast_vfx`/`impact_vfx` `x-aio-suggest` arrays with the same values you put in `suggest-values.ts` (Task 2) — or leave `[]` here and rely on the frontend constant if you prefer a single source; **decision: leave `[]` in the schema and have `SuggestField` fall back to the frontend `ICON_SUGGESTIONS`/`VFX_SUGGESTIONS` constant keyed off the field `path` ending in `icon_id`/`vfx`.** Simpler single source. Adjust `SuggestField` (Task 2 Step 3) to: `const suggestions = schema["x-aio-suggest"]?.length ? schema["x-aio-suggest"] : suggestionsForPath(path);` where `suggestionsForPath` returns `ICON_SUGGESTIONS` for paths ending `icon_id`, `VFX_SUGGESTIONS` for `_vfx`. (If this coupling feels wrong in review, put the arrays in the schema instead — either is acceptable; pick one and be consistent.)

- [ ] **Step 2: Register in `validation.ts`.** Add the import (alphabetical, after `shopsSchema`/near `skillMastersSchema`):

```ts
import skillsSchema from "../schemas/skills.json" with { type: "json" };
```

and the `rawSchemas` key:

```ts
  skills: skillsSchema,
```

- [ ] **Step 3: Write the validation script.** Create `packages/backend/src/scripts/validate-pubs.ts`:

```ts
// Standalone schema sanity check (no unit-test runner in this repo).
// Run: npx tsx src/scripts/validate-pubs.ts  (from packages/backend)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import skillsSchema from "../schemas/skills.json" with { type: "json" };

const PUB_ROOT = process.env.PUB_DATA_DIR ?? "/Users/cfraser/Projects/reoserv/data/pub";
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let failures = 0;
function check(type: string, schema: object, expectValid: boolean, files: string[]) {
  const validate = ajv.compile(schema);
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, "utf8"));
    const ok = validate(data);
    if (ok !== expectValid) {
      failures++;
      console.error(`[${type}] ${f}: expected ${expectValid ? "valid" : "invalid"}, got ${ok ? "valid" : "invalid"}`,
        ok ? "" : JSON.stringify(validate.errors));
    }
  }
}

function pubs(type: string): string[] {
  const dir = join(PUB_ROOT, type);
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
}

// Real pubs must all validate.
check("skills", skillsSchema, true, pubs("skills"));

// Malformed skills must be rejected (write temp objects inline).
const validate = ajv.compile(skillsSchema);
function expectReject(label: string, obj: unknown) {
  if (validate(obj)) { failures++; console.error(`[skills] should reject: ${label}`); }
}
expectReject("unknown action tag", { id: "x", name: "X", actions: [{ action: "nope" }] });
expectReject("bad element case", { id: "x", name: "X", actions: [{ action: "deal_damage", element: "fire" }] });
expectReject("range over 252", { id: "x", name: "X", range: 999 });
expectReject("missing action tag", { id: "x", name: "X", actions: [{ min: 5 }] });

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("validate-pubs: all checks passed");
```

- [ ] **Step 4: Add the npm script.** In `packages/backend/package.json` `scripts`, add:

```json
    "validate:pubs": "tsx src/scripts/validate-pubs.ts",
```

- [ ] **Step 5: Run — expect PASS.** Run: `cd packages/backend && npm run validate:pubs`. Expected: `validate-pubs: all checks passed`. If a real skill pub fails, the schema is wrong — fix the schema, not the pub. (Note: `strike.json` `scaling` uses `attack_power`; `rage.json` uses `apply_status`/`buff-aura` on_status — both must pass.)

- [ ] **Step 6: Typecheck + commit.** Run `cd packages/backend && npx tsc -p tsconfig.json --noEmit` (clean), then:

```bash
git add packages/backend/src/schemas/skills.json packages/backend/src/pubs/validation.ts packages/backend/src/scripts/validate-pubs.ts packages/backend/package.json
git commit -m "feat(schema): skills.json + validate-pubs script"
```

---

### Task 4: Backend `statuses.json` schema (the deep one)

**Files:**
- Create: `packages/backend/src/schemas/statuses.json`
- Modify: `packages/backend/src/pubs/validation.ts`
- Modify: `packages/backend/src/scripts/validate-pubs.ts`

**Interfaces:**
- Consumes: the same union authoring pattern from Task 3. `skillAction`/`scalingTerm`/`element` definitions are **duplicated** here (self-contained schema; the drift note covers both copies).

- [ ] **Step 1: Author `schemas/statuses.json`.** Structure (author every field; reuse Task 3's `element`/`coreStat`/`scalingTerm`/`skillAction` definitions verbatim inside this file's `definitions`, PLUS the new ones below). Top level:

```
required: ["id","name"]; additionalProperties:false
properties:
  id           string minLength 1
  name         string minLength 1
  icon_id      string x-aio-suggest []
  is_debuff    boolean default false
  show_timer   boolean default true
  default_duration_ms  integer minimum 0 default 0   (0 = permanent)
  max_stacks   integer minimum 1 default 1
  stack_rule   x-aio-options: refresh_duration|add_stacks|independent|ignore_if_present  (default refresh_duration)
  modifiers    array items $ref #/definitions/effect
  triggers     array items $ref #/definitions/trigger
  ticks        $ref #/definitions/tick        (optional; nullable — omit when absent)
  control      $ref #/definitions/controlFlags
  upkeep       $ref #/definitions/upkeep      (optional)
```

New `definitions` (in addition to the Task-3 four):

```json
"statTarget": { "type": "string", "default": "damage_dealt", "x-aio-options": [
  {"value":"str","label":"STR"},{"value":"int","label":"INT"},{"value":"wis","label":"WIS"},
  {"value":"agi","label":"AGI"},{"value":"con","label":"CON"},{"value":"cha","label":"CHA"},
  {"value":"max_hp","label":"Max HP"},{"value":"max_tp","label":"Max TP"},{"value":"max_sp","label":"Max SP"},
  {"value":"hp_regen","label":"HP regen"},{"value":"tp_regen","label":"TP regen"},{"value":"sp_regen","label":"SP regen"},
  {"value":"damage_dealt","label":"Damage dealt"},{"value":"damage_taken","label":"Damage taken"},
  {"value":"accuracy","label":"Accuracy"},{"value":"evasion","label":"Evasion"},{"value":"armor","label":"Armor"},
  {"value":"crit_chance","label":"Crit chance"},{"value":"crit_damage","label":"Crit damage"},
  {"value":"crit_damage_taken","label":"Crit damage taken"},{"value":"crit_resistance","label":"Crit resistance"},
  {"value":"attack_speed","label":"Attack speed"},{"value":"move_speed","label":"Move speed"},
  {"value":"damage_dealt_fire","label":"Damage dealt: Fire"},{"value":"damage_dealt_water","label":"Damage dealt: Water"},
  {"value":"damage_dealt_earth","label":"Damage dealt: Earth"},{"value":"damage_dealt_wind","label":"Damage dealt: Wind"},
  {"value":"damage_dealt_light","label":"Damage dealt: Light"},{"value":"damage_dealt_dark","label":"Damage dealt: Dark"},
  {"value":"damage_taken_fire","label":"Damage taken: Fire"},{"value":"damage_taken_water","label":"Damage taken: Water"},
  {"value":"damage_taken_earth","label":"Damage taken: Earth"},{"value":"damage_taken_wind","label":"Damage taken: Wind"},
  {"value":"damage_taken_light","label":"Damage taken: Light"},{"value":"damage_taken_dark","label":"Damage taken: Dark"},
  {"value":"healing_dealt","label":"Healing dealt"},{"value":"healing_received","label":"Healing received"},
  {"value":"xp_gain","label":"XP gain"},{"value":"gold_gain","label":"Gold gain"},{"value":"rep_gain","label":"Rep gain"},
  {"value":"drop_chance","label":"Drop chance"},{"value":"magic_find","label":"Magic find"},
  {"value":"slow_resistance","label":"Slow resistance"},{"value":"poison_resistance","label":"Poison resistance"},
  {"value":"root_resistance","label":"Root resistance"},{"value":"status_duration_self","label":"Status duration (self)"},
  {"value":"status_duration_dealt","label":"Status duration (dealt)"},
  {"value":"cooldown_reduction","label":"Cooldown reduction"},{"value":"mana_cost_reduction","label":"Mana cost reduction"} ] },

"effectScalingSource": {
  "oneOf": [
    {"type":"object","title":"Rep in zone","additionalProperties":false,"required":["type","zone_id"],
      "properties":{"type":{"const":"rep_in_zone"},"zone_id":{"type":"integer","default":0}}},
    {"type":"object","title":"HP missing","additionalProperties":false,"required":["type"],
      "properties":{"type":{"const":"self_hp_missing"}}},
    {"type":"object","title":"HP current","additionalProperties":false,"required":["type"],
      "properties":{"type":{"const":"self_hp_current"}}},
    {"type":"object","title":"TP missing","additionalProperties":false,"required":["type"],
      "properties":{"type":{"const":"self_tp_missing"}}},
    {"type":"object","title":"TP current","additionalProperties":false,"required":["type"],
      "properties":{"type":{"const":"self_tp_current"}}},
    {"type":"object","title":"Player level","additionalProperties":false,"required":["type"],
      "properties":{"type":{"const":"player_level"}}}
  ], "discriminator": { "propertyName": "type" } },

"effectValue": {
  "oneOf": [
    { "type": "number", "title": "Literal", "default": 0 },
    { "type": "object", "title": "Scaling", "additionalProperties": false, "required": ["per","source"],
      "properties": { "per": { "type": "number", "default": 0 }, "source": { "$ref": "#/definitions/effectScalingSource" } } }
  ] },

"condition": {
  "oneOf": [
    {"type":"object","title":"Target type","additionalProperties":false,"required":["type","value"],
      "properties":{"type":{"const":"target_type"},"value":{"type":"string"}}},
    {"type":"object","title":"Current zone","additionalProperties":false,"required":["type","zone_id"],
      "properties":{"type":{"const":"current_zone"},"zone_id":{"type":"integer","default":0}}},
    {"type":"object","title":"Damage element","additionalProperties":false,"required":["type","element"],
      "properties":{"type":{"const":"damage_element"},"element":{"$ref":"#/definitions/element"}}},
    {"type":"object","title":"Self HP above %","additionalProperties":false,"required":["type","pct"],
      "properties":{"type":{"const":"self_hp_above_pct"},"pct":{"type":"integer","minimum":0,"maximum":100,"default":50}}},
    {"type":"object","title":"Self HP below %","additionalProperties":false,"required":["type","pct"],
      "properties":{"type":{"const":"self_hp_below_pct"},"pct":{"type":"integer","minimum":0,"maximum":100,"default":50}}},
    {"type":"object","title":"Self TP above %","additionalProperties":false,"required":["type","pct"],
      "properties":{"type":{"const":"self_tp_above_pct"},"pct":{"type":"integer","minimum":0,"maximum":100,"default":50}}},
    {"type":"object","title":"Self TP below %","additionalProperties":false,"required":["type","pct"],
      "properties":{"type":{"const":"self_tp_below_pct"},"pct":{"type":"integer","minimum":0,"maximum":100,"default":50}}},
    {"type":"object","title":"Weapon kind","additionalProperties":false,"required":["type","kind"],
      "properties":{"type":{"const":"weapon_kind"},"kind":{"type":"string"}}},
    {"type":"object","title":"Equipped offhand","additionalProperties":false,"required":["type","kind"],
      "properties":{"type":{"const":"equipped_offhand"},"kind":{"type":"string"}}}
  ], "discriminator": { "propertyName": "type" } },

"effect": {
  "oneOf": [
    {"type":"object","title":"Flat","additionalProperties":false,"required":["kind","target","value"],
      "properties":{"kind":{"const":"flat"},"target":{"$ref":"#/definitions/statTarget"},
        "value":{"$ref":"#/definitions/effectValue"},"when":{"$ref":"#/definitions/condition"}}},
    {"type":"object","title":"Percent additive","additionalProperties":false,"required":["kind","target","value"],
      "properties":{"kind":{"const":"percent_additive"},"target":{"$ref":"#/definitions/statTarget"},
        "value":{"$ref":"#/definitions/effectValue"},"when":{"$ref":"#/definitions/condition"}}},
    {"type":"object","title":"Percent multiplicative","additionalProperties":false,"required":["kind","target","value"],
      "properties":{"kind":{"const":"percent_multiplicative"},"target":{"$ref":"#/definitions/statTarget"},
        "value":{"$ref":"#/definitions/effectValue"},"when":{"$ref":"#/definitions/condition"}}}
  ], "discriminator": { "propertyName": "kind" } },

"trigger": { "type": "object", "additionalProperties": false, "required": ["on"],
  "properties": {
    "on": { "type": "string", "default": "on_hit", "x-aio-options": [
      {"value":"on_hit","label":"On hit"},{"value":"on_crit","label":"On crit"},
      {"value":"on_kill","label":"On kill"},{"value":"on_take_damage","label":"On take damage"} ] },
    "chance": { "type": "number", "minimum": 0, "maximum": 1, "default": 1 },
    "consume": { "type": "boolean", "default": false },
    "actions": { "type": "array", "items": { "$ref": "#/definitions/skillAction" } } } },

"tick": { "type": "object", "additionalProperties": false, "required": ["interval_ms","action"],
  "properties": { "interval_ms": { "type": "integer", "minimum": 0, "default": 1000 },
    "action": { "$ref": "#/definitions/skillAction" } } },

"upkeep": { "type": "object", "additionalProperties": false,
  "properties": { "hp": { "type": "integer", "default": 0 }, "tp": { "type": "integer", "default": 0 },
    "interval_ms": { "type": "integer", "minimum": 0, "default": 1000 } } },

"controlFlags": { "type": "object", "additionalProperties": false,
  "properties": { "stun": { "type": "boolean", "default": false }, "root": { "type": "boolean", "default": false },
    "silence": { "type": "boolean", "default": false }, "disarm": { "type": "boolean", "default": false } } }
```

IMPORTANT for `effect.when`: it is **optional** — do NOT put `when` in any effect branch's `required`. Same for `ticks`/`upkeep` on the root (optional, not required). This matches reoserv's `#[serde(default)]` / `Option`.

- [ ] **Step 2: Register.** Add to `validation.ts`: `import statusesSchema from "../schemas/statuses.json" with { type: "json" };` and `statuses: statusesSchema,` in `rawSchemas`.

- [ ] **Step 3: Extend `validate-pubs.ts`.** Import `statusesSchema`; add `check("statuses", statusesSchema, true, pubs("statuses"));` and a few `expectReject` cases against a `statuses` validator: unknown modifier `kind`; `pct` of 150; unknown `stack_rule`; a `trigger.chance` of 2.

- [ ] **Step 4: Run — expect PASS.** `cd packages/backend && npm run validate:pubs` → all pass. Real pubs to satisfy include `berserker.json` (flat-ish modifier with literal value + upkeep), `poison.json` (tick → deal_damage with attack_power scaling), and any with `triggers`/`control`. Fix the schema if a real pub fails.

- [ ] **Step 5: Typecheck + commit.** `cd packages/backend && npx tsc -p tsconfig.json --noEmit` (clean), then:

```bash
git add packages/backend/src/schemas/statuses.json packages/backend/src/pubs/validation.ts packages/backend/src/scripts/validate-pubs.ts
git commit -m "feat(schema): statuses.json (effects/triggers/ticks/control unions)"
```

---

### Task 5: Integration — new-file skeletons + manual form pass

**Files:**
- Modify: `packages/backend/src/scripts/validate-pubs.ts` (add makeDefault-skeleton checks)
- Possibly modify: `packages/frontend/src/pubs/form/schema.ts` (only if a skeleton bug surfaces)

**Interfaces:**
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Skeleton-valid check.** The editor's "+ new" builds a file via `makeDefault(schema)` and immediately saves it — so `makeDefault` output MUST be ajv-valid or every new skill/status lands invalid. Extend `validate-pubs.ts` to import the frontend `makeDefault` and assert:

```ts
import { makeDefault } from "../../../frontend/src/pubs/form/schema";
// after the pub checks:
for (const [type, schema] of [["skills", skillsSchema], ["statuses", statusesSchema]] as const) {
  const skeleton = makeDefault(schema as any, schema as any);
  const v = ajv.compile(schema);
  if (!v(skeleton)) { failures++; console.error(`[${type}] makeDefault skeleton invalid`, JSON.stringify(v.errors)); }
}
```

(If the cross-package relative import trips tsx/tsconfig, instead copy `makeDefault` behavior isn't acceptable — resolve the import path, or run this specific assertion via a tiny script under `packages/frontend`. Prefer making the import work; the backend `tsconfig` `rootDir` may reject it, in which case put the skeleton check in `packages/frontend/src/scripts/skeleton-check.ts` run with `npx tsx` and add a `frontend` npm script `validate:skeletons`.)

- [ ] **Step 2: Run the skeleton check — expect PASS.** A failure here means `makeDefault` produced an invalid skeleton (e.g. a required nested object not seeded, or a `oneOf` whose first branch has a required field with no default). Fix by adding `default`s in the schema so `makeDefault` seeds required fields, OR by teaching `makeDefault` to seed a `oneOf` object branch's required props. Re-run until clean.

- [ ] **Step 3: Manual form pass (documented — no component harness).** Start backend + frontend dev servers with `PUB_DATA_DIR` pointing at a pub volume that has `skills/` + `statuses/`. Verify and note results:
  1. `skills` and `statuses` appear in the pub browser and open in **form** mode (not raw JSON); the "+ new" button appears (needs `kind:directory` + `hasSchema:true`).
  2. Open `strike` → `actions` shows a **variant select** ("Deal damage" selected); switching it to "Apply status" swaps the fields and seeds a `status_id` picker listing real statuses.
  3. Open `berserker` → `modifiers` shows an Effect variant select + a `target` (StatTarget) dropdown + a `value` that is a literal number; the untagged `value` can switch to "Scaling" (per + source picker).
  4. Edit a field, **Save → stage → Diff → Push** round-trips; the diff shows the JSON change.
  5. Regression: open an `items` and an `npcs` file — forms still render and save unchanged.

- [ ] **Step 4: Commit any fixes.**

```bash
git add -A
git commit -m "test(schema): makeDefault skeleton validity for skills/statuses + integration fixes"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** every reoserv field/union in the spec's type tables maps to a schema property/definition above. The `when` (Condition), `EffectValue` untagged, and both `ScalingSource` unions are all present (Task 4).
- **Type consistency:** union branch tags use `const`; the discriminator hint `propertyName` matches the reoserv serde tag (`action`/`source`/`kind`/`type`). `StatusTarget` value is `"self"`. `Element` values are PascalCase.
- **Known risk (flag in review):** ajv `oneOf` with all-object branches requires exactly one branch to match; each branch here is disambiguated by its `const` tag + `additionalProperties:false`, so a well-formed value matches exactly one. If a real pub matches zero or multiple, the schema's `const`/`required` is wrong — the `validate-pubs` run in Tasks 3/4 catches it. The untagged `effectValue` (number vs object) also matches exactly one by type.
- **Cross-repo TODO (data only):** the icon/vfx suggestion lists (Task 2) transcribe values from eoweb + reoserv pubs. Non-fatal if incomplete (free entry always allowed). Add `skills.json`/`statuses.json` to the "reoserv struct changed → update the aio-editor mirror" gotcha list.
