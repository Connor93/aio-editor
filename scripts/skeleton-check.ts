// Standalone check: does `makeDefault(schema)` — the skeleton the editor's
// "+ new file" flow builds and immediately saves — pass its own schema's
// ajv validation? If not, every newly created skill/status is born invalid.
//
// Lives at the repo root (outside packages/frontend/src and
// packages/backend/src) so it falls under neither package's tsconfig
// `include`, letting it freely import the frontend's pure-TS `makeDefault`
// (no Preact/JSX) alongside the backend's compiled schemas.
//
// Run: npx tsx scripts/skeleton-check.ts   (from repo root)
//   or: npm run validate:skeletons
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { makeDefault } from "../packages/frontend/src/pubs/form/schema.ts";
import skillsSchema from "../packages/backend/src/schemas/skills.json" with { type: "json" };
import statusesSchema from "../packages/backend/src/schemas/statuses.json" with { type: "json" };

let failures = 0;

for (const [name, schema] of [
  ["skills", skillsSchema],
  ["statuses", statusesSchema],
] as const) {
  const skeleton = makeDefault(schema as any, schema as any);
  const v = new Ajv({ allErrors: true, strict: false });
  addFormats(v);
  const validate = v.compile(schema);
  if (!validate(skeleton)) {
    failures++;
    console.error(`[${name}] skeleton INVALID`, JSON.stringify(validate.errors));
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("skeleton-check: skills + statuses skeletons valid");
