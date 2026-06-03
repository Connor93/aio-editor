import { useMemo, useState } from "react";

import { type JsonSchema, makeDefault, resolveRef } from "./schema";

interface CommonProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  rootSchema: JsonSchema;
  path: string;
  label?: string;
  required?: boolean;
  /** Compact rendering hint used inside grouped sections — single-line label,
   *  smaller inputs, no path/description chrome. */
  compact?: boolean;
}

export function SchemaField(props: CommonProps) {
  const resolved = resolveRef(props.schema, props.rootSchema);

  if (resolved.type === "object") {
    if (resolved.properties) return <ObjectField {...props} schema={resolved} />;
    if (resolved.additionalProperties && resolved.additionalProperties !== true)
      return <DictField {...props} schema={resolved} />;
  }

  if (resolved.type === "array" && resolved.items) {
    return <ArrayField {...props} schema={resolved} />;
  }

  if (resolved.type === "integer" || resolved.type === "number") {
    return <NumberField {...props} schema={resolved} />;
  }

  if (resolved.type === "string") {
    return <StringField {...props} schema={resolved} />;
  }

  if (resolved.type === "boolean") {
    return <BooleanField {...props} schema={resolved} />;
  }

  return (
    <div className="text-xs text-amber-400">
      unsupported schema at {props.path}
    </div>
  );
}

function FieldLabel({
  label,
  required,
  description,
  path,
  compact,
}: {
  label?: string;
  required?: boolean;
  description?: string;
  path: string;
  compact?: boolean;
}) {
  if (!label) return null;
  if (compact) {
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-xs font-medium text-slate-200">{label}</span>
        {required && <span className="text-red-400">*</span>}
      </div>
    );
  }
  return (
    <div className="mb-1">
      <span className="text-sm text-slate-200">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      <span className="ml-2 font-mono text-[10px] text-slate-500">{path}</span>
      {description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}
    </div>
  );
}

function ObjectField({ schema, value, onChange, rootSchema, path, label, required, compact }: CommonProps) {
  const obj = (value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
  const groups = schema["x-aio-groups"];

  // Grouped layout fires at the form root (top-level object with declared
  // groups). Nested objects keep the flat layout — keeps complexity bounded
  // and matches how groups are authored today.
  if (groups && path === "/") {
    return (
      <GroupedObject
        schema={schema}
        groups={groups}
        obj={obj}
        onChange={onChange}
        rootSchema={rootSchema}
      />
    );
  }

  const properties = schema.properties ?? {};
  const requiredKeys = new Set(schema.required ?? []);

  // Split properties into "render now" (required or already present) and
  // "offer to add" (optional and absent). Forcing optional sub-objects to
  // render with seeded defaults would let users save half-populated
  // structures that the schema considers missing-from-the-start.
  const presentKeys = new Set(Object.keys(obj));
  const renderedKeys: string[] = [];
  const addableKeys: string[] = [];
  for (const key of Object.keys(properties)) {
    if (requiredKeys.has(key) || presentKeys.has(key)) {
      renderedKeys.push(key);
    } else {
      addableKeys.push(key);
    }
  }

  return (
    <fieldset className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="space-y-3">
        {renderedKeys.map((key) => {
          const childSchema = properties[key]!;
          const childPath = `${path === "/" ? "" : path}/${key}`;
          const isOptional = !requiredKeys.has(key);
          return (
            <div key={key} className="relative">
              <SchemaField
                schema={childSchema}
                value={obj[key]}
                rootSchema={rootSchema}
                path={childPath}
                label={key}
                required={requiredKeys.has(key)}
                onChange={(next) => onChange({ ...obj, [key]: next })}
                compact={compact}
              />
              {isOptional && (
                <button
                  type="button"
                  onClick={() => {
                    const rest = { ...obj };
                    delete rest[key];
                    onChange(rest);
                  }}
                  className="absolute right-2 top-2 rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800"
                  title={`remove optional ${key}`}
                >
                  remove
                </button>
              )}
            </div>
          );
        })}
        {addableKeys.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] uppercase text-slate-500">optional</span>
            {addableKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({
                    ...obj,
                    [key]: makeDefault(properties[key]!, rootSchema),
                  })
                }
                className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                + {key}
              </button>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

interface GroupedObjectProps {
  schema: JsonSchema;
  groups: NonNullable<JsonSchema["x-aio-groups"]>;
  obj: Record<string, unknown>;
  onChange: (next: unknown) => void;
  rootSchema: JsonSchema;
}

function GroupedObject({ schema, groups, obj, onChange, rootSchema }: GroupedObjectProps) {
  const properties = schema.properties ?? {};
  const requiredKeys = new Set(schema.required ?? []);

  // Any properties not claimed by an authored group land in a trailing "Other"
  // section so nothing silently disappears when a schema is mid-rollout.
  const groupedKeys = new Set(groups.flatMap((g) => g.fields));
  const otherKeys = Object.keys(properties).filter((k) => !groupedKeys.has(k));
  const sections = otherKeys.length > 0
    ? [...groups, { label: "Other", fields: otherKeys }]
    : groups;

  return (
    <div className="space-y-6">
      {sections.map((group) => (
        <GroupedSection
          key={group.label}
          group={group}
          properties={properties}
          requiredKeys={requiredKeys}
          obj={obj}
          onChange={onChange}
          rootSchema={rootSchema}
        />
      ))}
    </div>
  );
}

interface GroupedSectionProps {
  group: NonNullable<JsonSchema["x-aio-groups"]>[number];
  properties: Record<string, JsonSchema>;
  requiredKeys: Set<string>;
  obj: Record<string, unknown>;
  onChange: (next: unknown) => void;
  rootSchema: JsonSchema;
}

function GroupedSection({
  group,
  properties,
  requiredKeys,
  obj,
  onChange,
  rootSchema,
}: GroupedSectionProps) {
  const renderedKeys: string[] = [];
  const addableKeys: string[] = [];
  const presentKeys = new Set(Object.keys(obj));

  for (const key of group.fields) {
    if (!properties[key]) continue;
    if (requiredKeys.has(key) || presentKeys.has(key)) {
      renderedKeys.push(key);
    } else {
      addableKeys.push(key);
    }
  }

  if (renderedKeys.length === 0 && addableKeys.length === 0) {
    // No rendered fields and no addable fields — section has nothing to offer.
    // (As soon as a group has any optional field the user could add, we keep
    //  the header visible so the section is discoverable.)
    return null;
  }

  const layout = group.layout ?? "grid";
  const containerClass =
    layout === "inline"
      ? "flex flex-wrap gap-3"
      : "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3";
  const compactChildren = layout === "inline";

  return (
    <section>
      <div className="sticky top-0 z-10 -mx-4 mb-2 border-b border-slate-800 bg-slate-950/90 px-4 py-1.5 backdrop-blur">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {group.label}
        </h3>
        {group.description && (
          <p className="text-[11px] text-slate-500">{group.description}</p>
        )}
      </div>
      <div className={containerClass}>
        {renderedKeys.map((key) => {
          const childSchema = properties[key]!;
          const isOptional = !requiredKeys.has(key);
          const showRemove = isOptional && !compactChildren;
          return (
            <div key={key} className={showRemove ? "relative pr-16" : "relative"}>
              <SchemaField
                schema={childSchema}
                value={obj[key]}
                rootSchema={rootSchema}
                path={`/${key}`}
                label={key}
                required={requiredKeys.has(key)}
                onChange={(next) => onChange({ ...obj, [key]: next })}
                compact={compactChildren}
              />
              {showRemove && (
                <button
                  type="button"
                  onClick={() => {
                    const rest = { ...obj };
                    delete rest[key];
                    onChange(rest);
                  }}
                  className="absolute right-2 top-2 rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800"
                  title={`remove optional ${key}`}
                >
                  remove
                </button>
              )}
            </div>
          );
        })}
      </div>
      {addableKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase text-slate-500">optional</span>
          {addableKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                onChange({
                  ...obj,
                  [key]: makeDefault(properties[key]!, rootSchema),
                })
              }
              className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              + {key}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ArrayField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const arr = Array.isArray(value) ? value : [];
  const itemSchema = schema.items as JsonSchema;

  return (
    <fieldset className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="space-y-2">
        {arr.length === 0 && (
          <p className="text-xs italic text-slate-500">(empty)</p>
        )}
        {arr.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <SchemaField
                schema={itemSchema}
                value={item}
                rootSchema={rootSchema}
                path={`${path === "/" ? "" : path}/${i}`}
                onChange={(next) => onChange(arr.map((v, idx) => (idx === i ? next : v)))}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(arr.filter((_, idx) => idx !== i))}
              className="mt-1 rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
              title={`remove index ${i}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...arr, makeDefault(itemSchema, rootSchema)])}
          className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          + add item
        </button>
      </div>
    </fieldset>
  );
}

function DictField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const dict = (value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
  const valueSchema = schema.additionalProperties as JsonSchema;
  const patternStr = schema.propertyNames?.pattern;
  const keyPattern = useMemo(() => {
    if (!patternStr) return null;
    try {
      return new RegExp(patternStr);
    } catch {
      return null;
    }
  }, [patternStr]);

  const [newKey, setNewKey] = useState("");
  const newKeyValid =
    newKey.length > 0 &&
    (!keyPattern || keyPattern.test(newKey)) &&
    !Object.prototype.hasOwnProperty.call(dict, newKey);

  return (
    <fieldset className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="space-y-2">
        {Object.keys(dict).length === 0 && (
          <p className="text-xs italic text-slate-500">(empty)</p>
        )}
        {Object.entries(dict).map(([key, v]) => (
          <div key={key} className="flex items-start gap-2">
            <div className="w-32 pt-2 font-mono text-xs text-slate-400">{key}</div>
            <div className="flex-1">
              <SchemaField
                schema={valueSchema}
                value={v}
                rootSchema={rootSchema}
                path={`${path === "/" ? "" : path}/${key}`}
                onChange={(next) => onChange({ ...dict, [key]: next })}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const rest = { ...dict };
                delete rest[key];
                onChange(rest);
              }}
              className="mt-1 rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
              title={`remove key ${key}`}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder={keyPattern ? `new key (${schema.propertyNames?.pattern})` : "new key"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          />
          <button
            type="button"
            disabled={!newKeyValid}
            onClick={() => {
              onChange({ ...dict, [newKey]: makeDefault(valueSchema, rootSchema) });
              setNewKey("");
            }}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            + add entry
          </button>
        </div>
      </div>
    </fieldset>
  );
}

function StringField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const s = typeof value === "string" ? value : "";
  const tooShort = typeof schema.minLength === "number" && s.length < schema.minLength;

  return (
    <label className="block">
      <FieldLabel label={label} required={required} description={schema.description} path={path} compact={compact} />
      <input
        type="text"
        value={s}
        onChange={(e) => onChange(e.target.value)}
        className={`${compact ? "mt-0.5 w-full" : "w-full"} rounded-md border bg-slate-950 px-2 py-1 text-sm ${
          tooShort ? "border-amber-700" : "border-slate-700"
        }`}
      />
    </label>
  );
}

function NumberField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const n = typeof value === "number" ? value : 0;
  const tooLow = typeof schema.minimum === "number" && n < schema.minimum;
  const tooHigh = typeof schema.maximum === "number" && n > schema.maximum;
  const out = tooLow || tooHigh;

  if (compact) {
    return (
      <label className="block w-20">
        <FieldLabel label={label} required={required} description={schema.description} path={path} compact />
        <input
          type="number"
          value={n}
          step={schema.type === "integer" ? 1 : "any"}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) {
              onChange(schema.type === "integer" ? Math.trunc(next) : next);
            }
          }}
          className={`mt-0.5 w-full rounded-md border bg-slate-950 px-2 py-1 text-sm tabular-nums ${
            out ? "border-amber-700" : "border-slate-700"
          }`}
        />
      </label>
    );
  }

  return (
    <label className="block">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={n}
          step={schema.type === "integer" ? 1 : "any"}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) {
              onChange(schema.type === "integer" ? Math.trunc(next) : next);
            }
          }}
          className={`w-32 rounded-md border bg-slate-950 px-2 py-1 text-sm tabular-nums ${
            out ? "border-amber-700" : "border-slate-700"
          }`}
        />
        {typeof schema.minimum === "number" || typeof schema.maximum === "number" ? (
          <span className="text-[10px] text-slate-500">
            [{schema.minimum ?? "−∞"}, {schema.maximum ?? "∞"}]
          </span>
        ) : null}
      </div>
    </label>
  );
}

function BooleanField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const checked = value === true;
  return (
    <label className={`flex items-center gap-2 ${compact ? "text-sm" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-slate-200"
      />
      <span className={compact ? "text-xs text-slate-200" : "text-sm text-slate-200"}>
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {!compact && (
        <span className="font-mono text-[10px] text-slate-500">{path}</span>
      )}
      {schema.description && !compact && (
        <span className="ml-2 text-xs text-slate-500">{schema.description}</span>
      )}
    </label>
  );
}
