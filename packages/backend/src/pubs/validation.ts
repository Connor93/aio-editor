import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import reputationTiersSchema from "../schemas/reputation_tiers.json" with { type: "json" };
import zonesSchema from "../schemas/zones.json" with { type: "json" };

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

// Registry keyed by pub type. The key is the URL segment a client uses (e.g.
// `/api/pubs/zones/zones.json` -> "zones"). Single-file pubs use the file
// stem. To add a new schema: drop the JSON file into ../schemas/ and add an
// import + entry here.
const validators: Record<string, ValidateFunction> = {
  zones: ajv.compile(zonesSchema),
  reputation_tiers: ajv.compile(reputationTiersSchema),
};

export function hasSchemaFor(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(validators, type);
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
