import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import classesSchema from "../schemas/classes.json" with { type: "json" };
import innsSchema from "../schemas/inns.json" with { type: "json" };
import itemsSchema from "../schemas/items.json" with { type: "json" };
import mapModulesSchema from "../schemas/map_modules.json" with { type: "json" };
import modifiersSchema from "../schemas/modifiers.json" with { type: "json" };
import npcsSchema from "../schemas/npcs.json" with { type: "json" };
import rarityWeightsSchema from "../schemas/rarity_weights.json" with { type: "json" };
import reputationTiersSchema from "../schemas/reputation_tiers.json" with { type: "json" };
import shopsSchema from "../schemas/shops.json" with { type: "json" };
import skillMastersSchema from "../schemas/skill_masters.json" with { type: "json" };
import skillsSchema from "../schemas/skills.json" with { type: "json" };
import spellsSchema from "../schemas/spells.json" with { type: "json" };
import statusesSchema from "../schemas/statuses.json" with { type: "json" };
import zonesSchema from "../schemas/zones.json" with { type: "json" };

// Single source of truth — `validators` is derived from `rawSchemas` so a
// new entry only ever needs to be added in one place. Drop the JSON into
// ../schemas/, add the import, and add the key here.
const rawSchemas: Record<string, object> = {
  classes: classesSchema,
  inns: innsSchema,
  items: itemsSchema,
  map_modules: mapModulesSchema,
  modifiers: modifiersSchema,
  npcs: npcsSchema,
  rarity_weights: rarityWeightsSchema,
  reputation_tiers: reputationTiersSchema,
  shops: shopsSchema,
  skill_masters: skillMastersSchema,
  skills: skillsSchema,
  statuses: statusesSchema,
  spells: spellsSchema,
  zones: zonesSchema,
};

export interface ValidationIssue {
  path: string;
  message: string;
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  // We allow $schema and similar metadata keywords to pass through.
  useDefaults: false,
  removeAdditional: false,
});
addFormats(ajv);

const validators: Record<string, ValidateFunction> = Object.fromEntries(
  Object.entries(rawSchemas).map(([type, schema]) => [type, ajv.compile(schema)])
);

export function hasSchemaFor(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(validators, type);
}

export function getSchemaFor(type: string): object | null {
  return rawSchemas[type] ?? null;
}

export function validatePubContent(
  type: string,
  parsed: unknown
): ValidationIssue[] | null {
  const validator = validators[type];
  if (!validator) return null;

  const valid = validator(parsed);
  if (valid) return [];

  return (validator.errors ?? []).map(formatIssue);
}

function formatIssue(err: ErrorObject): ValidationIssue {
  const path = err.instancePath === "" ? "/" : err.instancePath;
  const missing =
    err.keyword === "required" && typeof err.params?.missingProperty === "string"
      ? ` (missing field: ${err.params.missingProperty})`
      : "";
  const extra =
    err.keyword === "additionalProperties" && typeof err.params?.additionalProperty === "string"
      ? ` (unexpected field: ${err.params.additionalProperty})`
      : "";
  return {
    path,
    message: `${err.message ?? "invalid"}${missing}${extra}`,
  };
}
