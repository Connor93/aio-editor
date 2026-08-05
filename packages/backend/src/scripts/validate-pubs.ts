// Standalone schema sanity check (no unit-test runner in this repo).
// Run: npx tsx src/scripts/validate-pubs.ts  (from packages/backend)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import skillsSchema from "../schemas/skills.json" with { type: "json" };
import statusesSchema from "../schemas/statuses.json" with { type: "json" };

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
check("statuses", statusesSchema, true, pubs("statuses"));

function rejecter(type: string, schema: object) {
  const validate = ajv.compile(schema);
  return (label: string, obj: unknown) => {
    if (validate(obj)) { failures++; console.error(`[${type}] should reject: ${label}`); }
  };
}

function accepter(type: string, schema: object) {
  const validate = ajv.compile(schema);
  return (label: string, obj: unknown) => {
    if (!validate(obj)) {
      failures++;
      console.error(`[${type}] should ACCEPT: ${label}`, JSON.stringify(validate.errors));
    }
  };
}

// Malformed skills must be rejected.
const rejectSkill = rejecter("skills", skillsSchema);
rejectSkill("unknown action tag", { id: "x", name: "X", actions: [{ action: "nope" }] });
rejectSkill("bad element case", { id: "x", name: "X", actions: [{ action: "deal_damage", element: "fire" }] });
rejectSkill("range over 252", { id: "x", name: "X", range: 999 });
rejectSkill("missing action tag", { id: "x", name: "X", actions: [{ min: 5 }] });

// Malformed statuses must be rejected.
const rejectStatus = rejecter("statuses", statusesSchema);
rejectStatus("unknown modifier kind", { id: "x", name: "X", modifiers: [{ kind: "nope", target: "armor", value: 1 }] });
rejectStatus("pct over 100", { id: "x", name: "X", triggers: [{ on: "on_take_damage", actions: [] }], modifiers: [{ kind: "flat", target: "armor", value: 1, when: { type: "self_hp_below_pct", pct: 150 } }] });
rejectStatus("unknown stack_rule", { id: "x", name: "X", stack_rule: "nope" });
rejectStatus("chance over 1", { id: "x", name: "X", triggers: [{ on: "on_hit", chance: 2 }] });

// Positive coverage for union branches no real status pub exercises yet, so a
// future const/required typo on any of them is caught (reviewer-flagged blind
// spot): every `condition` branch, every `effectScalingSource` branch, and
// `effectValue`'s object/"Scaling" form.
const acceptStatus = accepter("statuses", statusesSchema);
acceptStatus("effectValue Scaling + all effectScalingSource variants", {
  id: "x", name: "X", modifiers: [
    { kind: "flat", target: "armor", value: { per: 0.1, source: { type: "self_hp_missing" } } },
    { kind: "flat", target: "armor", value: { per: 0.1, source: { type: "self_hp_current" } } },
    { kind: "flat", target: "armor", value: { per: 0.1, source: { type: "self_tp_missing" } } },
    { kind: "flat", target: "armor", value: { per: 0.1, source: { type: "self_tp_current" } } },
    { kind: "flat", target: "max_hp", value: { per: 5, source: { type: "player_level" } } },
    { kind: "percent_additive", target: "damage_dealt", value: { per: 0.01, source: { type: "rep_in_zone", zone_id: 7 } } },
  ],
});
acceptStatus("all condition `when` variants", {
  id: "x", name: "X", modifiers: [
    { kind: "flat", target: "armor", value: 1, when: { type: "damage_element", element: "Fire" } },
    { kind: "flat", target: "armor", value: 1, when: { type: "self_hp_above_pct", pct: 50 } },
    { kind: "flat", target: "armor", value: 1, when: { type: "self_hp_below_pct", pct: 30 } },
    { kind: "flat", target: "armor", value: 1, when: { type: "self_tp_above_pct", pct: 50 } },
    { kind: "flat", target: "armor", value: 1, when: { type: "self_tp_below_pct", pct: 20 } },
    { kind: "flat", target: "armor", value: 1, when: { type: "current_zone", zone_id: 3 } },
    { kind: "flat", target: "armor", value: 1, when: { type: "target_type", value: "undead" } },
    { kind: "flat", target: "armor", value: 1, when: { type: "weapon_kind", kind: "staff" } },
    { kind: "flat", target: "armor", value: 1, when: { type: "equipped_offhand", kind: "shield" } },
  ],
});

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("validate-pubs: all checks passed");
