// Minimal JSON-Schema subset used by the AIO Editor form renderer. The
// renderer handles the shapes that show up in our shipped pub schemas; new
// keywords can be added here and dispatched in SchemaField.tsx as needed.

export interface FieldGroup {
  label: string;
  description?: string;
  /** Field keys in display order. Fields not listed in any group fall into a
   *  trailing "Other" group so nothing silently disappears from the form. */
  fields: string[];
  /** Layout hint. "grid" (default) → 2-col responsive grid; "inline" → tight
   *  horizontal row of small labeled inputs (good for stat blocks). */
  layout?: "grid" | "inline";
}

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
  enum?: (string | number)[];
  default?: unknown;
  description?: string;
  title?: string;
  /** AIO Editor extension. Ignored by Ajv (we run with strict: false). */
  "x-aio-groups"?: FieldGroup[];
  /** AIO Editor extension. Renders the field as a labelled select dropdown
   *  instead of a bare input. Free-form values are still accepted on save —
   *  Ajv only sees `type`/`minimum`/etc. — so forward-compat with new
   *  REOSERV enum variants is preserved.
   *
   *  Each option may carry an optional `description` that surfaces under
   *  the dropdown once the option is selected — useful for enums with many
   *  variants (e.g. the modifier `target` field's 49 stat targets) where
   *  the label alone isn't self-explanatory. */
  "x-aio-options"?: Array<{ value: string | number; label: string; description?: string }>;
  /** AIO Editor extension. Declares the field as a cross-pub reference; the
   *  renderer turns the field into a dropdown sourced from the referenced
   *  pub's file list. Today only `by: "filename-id"` is supported (the
   *  field's integer value matches the leading numeric portion of a
   *  filename like `0001.json`). Validation is advisory only — out-of-list
   *  values render amber but still save, preserving forward-compat. */
  "x-aio-ref"?: {
    type: string;
    by?: "filename-id";
    /** Label to show for value 0 when the field treats 0 as a sentinel for
     *  "none / any". When set, value 0 renders without the unknown-amber
     *  warning even if no `0000.json` exists. */
    noneLabel?: string;
  };
  /** AIO Editor extension. Changes the field's display while keeping the
   *  stored JSON value unchanged. `kind: "percent"` shows the value as a
   *  percentage (displayed = stored / divisor); useful for fields that
   *  REOSERV stores as integers rolled against a fixed divisor (e.g. drop
   *  rate stored as 0..64000 but conceptually a percentage). */
  "x-aio-display"?:
    | {
        kind: "percent";
        /** Stored ↔ displayed conversion factor. displayed = stored / divisor. */
        divisor: number;
      }
    | {
        kind: "gfx";
        /** GFX category to load images from. Backend maps this to a
         *  `gfxNNN/` directory and computes `resource_id = 100 + value*2`. */
        category: "items" | "npcs" | "spells" | "spell_icons";
      };
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
 *  item or dict entry — or when "+ new" builds a starting skeleton for a
 *  whole pub file. The values it produces have to pass schema validation
 *  on the way to staging, so we honor `minLength` / `enum` / `minimum`
 *  rather than always returning the literal zero value for the type. */
export function makeDefault(schema: JsonSchema, rootSchema: JsonSchema): unknown {
  const resolved = resolveRef(schema, rootSchema);
  // An explicit `default` at this node wins over the type-driven fallback.
  // Object schemas keep the recursive path because their default-included
  // children aren't all expressible as a single literal — see the object
  // case below.
  if (
    resolved.type !== "object" &&
    Object.prototype.hasOwnProperty.call(resolved, "default")
  ) {
    return resolved.default;
  }
  switch (resolved.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      const required = resolved.required ?? [];
      const properties = resolved.properties ?? {};
      // Required keys must be present for the document to validate. Keys
      // with an explicit `default` get pre-filled so designers don't
      // have to remember every necessary field — the schema author has
      // already declared a sensible starting value.
      const include = new Set<string>(required);
      for (const [key, child] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(child, "default")) {
          include.add(key);
        }
      }
      for (const key of include) {
        const childSchema = properties[key];
        if (childSchema) {
          obj[key] = makeDefault(childSchema, rootSchema);
        }
      }
      return obj;
    }
    case "array":
      return [];
    case "string": {
      if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
        return resolved.enum[0];
      }
      // Schemas like `name: { type: "string", minLength: 1 }` reject the
      // empty string — supply a placeholder the user can edit instead.
      if (typeof resolved.minLength === "number" && resolved.minLength > 0) {
        return "untitled";
      }
      return "";
    }
    case "integer":
    case "number":
      if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
        return resolved.enum[0];
      }
      if (typeof resolved.minimum === "number") return resolved.minimum;
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}
