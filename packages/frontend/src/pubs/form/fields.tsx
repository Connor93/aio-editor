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
}: {
  label?: string;
  required?: boolean;
  description?: string;
  path: string;
}) {
  if (!label) return null;
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

function ObjectField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const obj = (value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
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

function StringField({ schema, value, onChange, path, label, required }: CommonProps) {
  const s = typeof value === "string" ? value : "";
  const tooShort = typeof schema.minLength === "number" && s.length < schema.minLength;

  return (
    <label className="block">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <input
        type="text"
        value={s}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border bg-slate-950 px-2 py-1 text-sm ${
          tooShort ? "border-amber-700" : "border-slate-700"
        }`}
      />
    </label>
  );
}

function NumberField({ schema, value, onChange, path, label, required }: CommonProps) {
  const n = typeof value === "number" ? value : 0;
  const tooLow = typeof schema.minimum === "number" && n < schema.minimum;
  const tooHigh = typeof schema.maximum === "number" && n > schema.maximum;
  const out = tooLow || tooHigh;

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
          className={`w-32 rounded-md border bg-slate-950 px-2 py-1 text-sm ${
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
