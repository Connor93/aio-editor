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
