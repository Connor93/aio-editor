import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import reputationTiersSchema from "../schemas/reputation_tiers.json" with { type: "json" };
import zonesSchema from "../schemas/zones.json" with { type: "json" };

// Single source of truth — `validators` is derived from `rawSchemas` so a
// new entry only ever needs to be added in one place. Drop the JSON into
// ../schemas/, add the import, and add the key here.
const rawSchemas: Record<string, object> = {
  zones: zonesSchema,
  reputation_tiers: reputationTiersSchema,
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
