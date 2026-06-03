// Minimal JSON-Schema subset used by the AIO Editor form renderer. The
// renderer handles the shapes that show up in our shipped pub schemas; new
// keywords can be added here and dispatched in SchemaField.tsx as needed.

export interface JsonSchema {
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  propertyNames?: { pattern?: string };
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  description?: string;
  title?: string;
}

/**
 * Resolve a `#/definitions/...` style local $ref against the root schema.
 * Returns the original schema unchanged when no $ref is present.
 */
export function resolveRef(
  schema: JsonSchema,
  rootSchema: JsonSchema
): JsonSchema {
  if (!schema.$ref) return schema;
  const ref = schema.$ref;
  if (!ref.startsWith("#/")) {
    return schema;
  }
  const segments = ref.slice(2).split("/");
  let cursor: unknown = rootSchema;
  for (const seg of segments) {
    if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[seg];
    } else {
      return schema;
    }
  }
  return (cursor as JsonSchema | undefined) ?? schema;
}

/** Best-effort default value for a schema when the user adds a new array
 *  item or dict entry. Matches the leaves to sensible zero values. */
export function makeDefault(schema: JsonSchema, rootSchema: JsonSchema): unknown {
  const resolved = resolveRef(schema, rootSchema);
  switch (resolved.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      const required = resolved.required ?? [];
      const properties = resolved.properties ?? {};
      for (const key of required) {
        const childSchema = properties[key];
        if (childSchema) {
          obj[key] = makeDefault(childSchema, rootSchema);
        }
      }
      return obj;
    }
    case "array":
      return [];
    case "string":
      return "";
    case "integer":
    case "number":
      if (typeof resolved.minimum === "number") return resolved.minimum;
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}
