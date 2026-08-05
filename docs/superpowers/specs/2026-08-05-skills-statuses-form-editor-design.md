# Skills & Statuses Form Editor — Design

**Date:** 2026-08-05
**Repo:** aio-editor (backend schemas + frontend SchemaForm)
**Status:** design approved (user), pending spec review → plan

## Goal

Turn the AIO editor's `skills/` and `statuses/` pub types from **raw-JSON-only**
into first-class **schema-driven forms**, including a reusable editor for the
discriminated unions the skills/status data model uses (`actions`, `scaling`,
`modifiers`, `triggers`, `ticks`, effect conditions).

## Context & current state

The editor is fully schema-driven: `listPubTypes` (backend `pubs/store.ts`)
lists **every directory** on the pub volume as a pub type, so `skills/` (14
files) and `statuses/` (15 files) already appear in the browser. But only 12
types have a registered schema (`packages/backend/src/schemas/*.json` +
`pubs/validation.ts`); the rest fall back to the raw JSON editor
(`PubBrowser.tsx`: `setEditorMode(c.schema ? "form" : "json")`). Skills and
statuses have **no schema**, so today they are hand-edited JSON — no field
help, no validation, no dropdowns/pickers.

`spells.json` / `skill_masters.json` schemas exist but are the **legacy ESF**
spells and skillmaster NPCs — unrelated to this new data-driven framework.

The forms must mirror the reoserv structs exactly (same drift model as the
other 12 schemas):
- `SkillDef` / `SkillAction` / `ScalingTerm` — `reoserv/src/utils/load_skill_file.rs`
- `StatusDef` / `Trigger` / `Tick` / `Upkeep` / `ControlFlags` / `StackRule` —
  `reoserv/src/utils/load_status_file.rs`
- `Effect` / `EffectValue` / `StatTarget` / `Condition` / effects `ScalingSource`
  — `reoserv/src/effects/{effect,stat_target,condition,scaling}.rs`

**No reoserv changes.** This is entirely an aio-editor feature; the reoserv
structs are the reference the schemas copy.

## Architecture / approach

### Chosen: `oneOf` + discriminator hint, one reusable `OneOfField`

Model each tagged union in JSON Schema as `oneOf: [...branches]`, where each
branch `required`s its discriminator property and pins it with `const`. Add a
sibling **`discriminator: { propertyName }`** hint the *frontend* reads to drive
a variant `<select>`. Backend validation uses plain `oneOf` (ajv tries each
branch; the `const` tags make exactly one match), so we avoid ajv's strict
`discriminator`-keyword constraints — we only need ajv to **not reject** the
`discriminator`/`title`/`const` keywords (allow them as inert, or `strict:false`
for these schemas).

One new `OneOfField` in `SchemaForm` renders any union:
- reads `schema.oneOf` (+ optional `discriminator.propertyName`),
- shows a variant selector (labels from each branch's `title`; value = the
  branch's discriminator `const`),
- renders the selected branch as an `ObjectField` **minus** the discriminator
  property (the selector owns it),
- on switch, seeds the new branch via `makeDefault` while preserving the tag.

This is reusable (items/npcs could adopt it later) and matches how serde's
internally-tagged enums actually serialize.

**Rejected alternatives:** (a) flatten each union into one all-optional object
— weak validation, shows irrelevant fields (the Tier-1 compromise the user
declined); (b) a bespoke hardcoded skill-action widget — not reusable, breaks
on every new variant.

### The one special case: `EffectValue` is `#[serde(untagged)]`

`EffectValue` = **a bare number** (`Literal`) **or** an object
`{ per, source }` (`Scaling`). No discriminator property. `OneOfField` must
support the **no-discriminator** case: two branches distinguished by JSON type
(`number` vs `object`), rendered with a simple variant toggle
("Literal number" / "Scaling expression"). Same field, discriminator optional.

## The complete type reference (schemas mirror this exactly)

### Discriminated unions

| Union | Discriminator | Branches (tag value → extra fields) |
|---|---|---|
| `SkillAction` (skill `actions[]`, status `ticks.action`, trigger `actions[]`) | `action` (snake_case) | `deal_damage` → `min:int, max:int, element:Element, scaling:ScalingTerm[]` · `heal` → `hp:int, tp:int, scaling:ScalingTerm[]` · `apply_status` → `status_id:string(status-ref), to:StatusTarget` |
| `ScalingTerm.source` — **flattened** (tag + `coefficient` are siblings) | `source` (snake_case) | `attack_power` · `stat` → `stat:CoreStat` · `level` · `spell_power` · `healing_power`; **all** branches also carry `coefficient:number` |
| `Effect` (status `modifiers[]`) | `kind` (snake_case) | `flat` / `percent_additive` / `percent_multiplicative`, each → `target:StatTarget, value:EffectValue, when?:Condition` |
| `EffectValue` (**untagged**) | — (type-distinguished) | number (`Literal`) · `{ per:number, source:effects.ScalingSource }` (`Scaling`) |
| `Condition` (`Effect.when`) | `type` (snake_case) | `target_type`→`value:string` · `current_zone`→`zone_id:int` · `damage_element`→`element:Element` · `self_hp_above_pct`/`self_hp_below_pct`/`self_tp_above_pct`/`self_tp_below_pct`→`pct:int(0..100)` · `weapon_kind`→`kind:string` · `equipped_offhand`→`kind:string` |

Note **two different `ScalingSource` types**: the skill one (`ScalingTerm`, tag
`source`, values `attack_power/stat/level/spell_power/healing_power`) and the
effects one (`EffectValue.Scaling`, tag `type`, values
`rep_in_zone{zone_id}/self_hp_missing/self_hp_current/self_tp_missing/self_tp_current/player_level`).
They are distinct — do not merge.

### Plain enums (dropdowns)

- `SkillTarget`: `self_only`, `single_enemy`
- `SkillKind`: `active`, `toggle`
- `StatusTarget`: **`self`** (renamed — not `self_caster`), `target`
- `CoreStat`: `str, int, wis, agi, con, cha`
- `Element`: **PascalCase** — `None, Fire, Water, Earth, Wind, Light, Dark`
  (⚠️ gotcha: `"Fire"` not `"fire"` — a lowercased element silently drops the pub)
- `StackRule`: `refresh_duration, add_stacks, independent, ignore_if_present`
- `TriggerEvent`: `on_hit, on_crit, on_kill, on_take_damage`
- `StatTarget` (~50, snake_case): core (`str,int,wis,agi,con,cha`), resources
  (`max_hp,max_tp,max_sp,hp_regen,tp_regen,sp_regen`), combat
  (`damage_dealt,damage_taken,accuracy,evasion,armor,crit_chance,crit_damage,crit_damage_taken,crit_resistance,attack_speed,move_speed`),
  per-element dealt/taken (`damage_dealt_fire…dark`, `damage_taken_fire…dark`),
  healing (`healing_dealt,healing_received`), economy
  (`xp_gain,gold_gain,rep_gain,drop_chance,magic_find`), status
  (`slow_resistance,poison_resistance,root_resistance,status_duration_self,status_duration_dealt`),
  cost (`cooldown_reduction,mana_cost_reduction`)

### skills.json — object fields

`id` (string, req), `name` (string, req), `description` (string),
`icon_id` (string, icon datalist), `cost` (`{hp:int, tp:int}`),
`cooldown_ms` (int), `target` (SkillTarget▾, default `self_only`),
`range` (int, 0..252), `kind` (SkillKind▾, default `active`),
`on_status` (string, **status-ref** picker), `cast_vfx`/`impact_vfx`
(string, vfx datalist), `actions` (SkillAction[]).

### statuses.json — object fields

`id` (req), `name` (req), `icon_id` (icon datalist), `is_debuff` (bool),
`show_timer` (bool, default true), `default_duration_ms` (int, 0=permanent),
`max_stacks` (int, default 1), `stack_rule` (StackRule▾),
`modifiers` (Effect[]), `triggers` (Trigger[]:
`{on:TriggerEvent▾, chance:number 0..1 default 1, consume:bool, actions:SkillAction[]}`),
`ticks` (nullable `{interval_ms:int, action:SkillAction}`),
`control` (`{stun,root,silence,disarm:bool}`),
`upkeep` (nullable `{hp:int, tp:int, interval_ms:int}`).

## Components

1. **Backend — schemas + registration.** New `schemas/skills.json` +
   `schemas/statuses.json` (with shared union sub-schemas via `$ref`/`$defs`
   where it reduces duplication — e.g. `SkillAction`, `ScalingTerm`,
   `StatTarget`, `Element` reused across both). Register both in
   `validation.ts` `rawSchemas` (+ imports). Ensure ajv tolerates the
   `discriminator`/`title`/`const` keywords used for union hints.

2. **Frontend — `OneOfField` + `schema.ts` support.** Extend the `JsonSchema`
   type with `oneOf?: JsonSchema[]`, `discriminator?: {propertyName:string}`,
   `const?: unknown`, `title?: string`. `SchemaField` dispatches to
   `OneOfField` when `schema.oneOf` is present. `makeDefault`, the coercion,
   and the validation-walk in `schema.ts` handle `oneOf` (default = first
   branch's skeleton; untagged EffectValue default = literal `0`).

3. **Frontend — reference data for pickers.**
   - `on_status` + `apply_status.status_id` → **status reference picker**:
     extend `RefsContext` with a `statuses` category (enumerate the `statuses/`
     pub type — native, it's the editor's own volume) and a
     `x-aio-display: { kind: "ref", category: "statuses" }` (or reuse the
     existing string-reference mechanism) so a bad ref is flagged.
   - static enums → JSON-Schema `enum` → existing `SelectField`.
   - `icon_id`, `cast_vfx`, `impact_vfx` → **suggest-datalists**: a small
     vendored option list (known game-icons slugs / vfx refs, with a
     "synced from eoweb — see <path>" comment) **plus free entry** (a new
     lightweight datalist field or `x-aio-display:{kind:"suggest"}`), because
     eoweb vendors new icons/VFX on demand and a strict enum would wrongly
     block authoring a new ref.

## Testing

The repo has **no unit-test runner** (no vitest/jest; gates are `tsc --noEmit`
typecheck + biome). The backend already depends on **`tsx`** (runs TS directly).
So tests are **standalone `tsx` validation scripts**, not a framework suite:

- **Backend (a `tsx` script under `packages/backend/`):** compile both schemas
  with the same ajv config `validation.ts` uses, then assert they **accept all
  14 real skill + 15 status pubs** (read from the pub volume / a fixtures copy)
  and **reject** representative malformed input (unknown `action` tag; missing
  discriminator tag; wrong `element` case e.g. `"fire"`; out-of-range
  `pct`/`range`; a `chance` outside 0..1). Also assert `makeDefault(schema)`
  output is ajv-valid for both schemas (import the frontend `schema.ts`
  `makeDefault` under tsx). Wire it as an npm script (e.g. `validate:schemas`).
- **Frontend:** `tsc --noEmit` + biome clean on the new `OneOfField` /
  `schema.ts` / field changes. Manual verification that `OneOfField` renders
  each union, switches variants (tag preserved, defaults seeded), handles the
  untagged `EffectValue`, and that the 12 existing forms still render + save
  (spot-check items + npcs) — the editor has no component-test harness to
  automate this, so it is a documented manual pass in the plan.

## Drift guard / gotchas (carry into the plan + gotchas note)

- **Element is PascalCase** — the enum values must be `Fire`…`Dark`/`None`.
- **`StatusTarget::SelfCaster` serializes as `"self"`**, not `self_caster`.
- **Two distinct `ScalingSource` unions** (tag `source` vs `type`) — keep separate.
- The two schemas duplicate reoserv structs → add them to the "reoserv struct
  changed → update the aio-editor mirror" list (same hazard as the existing 12).

## Scope / YAGNI

- **In:** full schemas for both types (validating all real pubs), the reusable
  `OneOfField` (tagged + untagged), the status-ref picker, static enum
  dropdowns, icon/vfx suggest-datalists.
- **Out (deferred):** authoring *new* game-icons/VFX from the editor (that's an
  eoweb vendoring step); a live cross-repo sync of the icon/vfx lists (vendored
  static list + free entry is enough); a visual VFX/SFX previewer (that's the
  separate D15 sub-project); any reoserv-side change.
```
