import { SchemaField } from "./fields";
import type { JsonSchema } from "./schema";

interface SchemaFormProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (next: unknown) => void;
}

export function SchemaForm({ schema, value, onChange }: SchemaFormProps) {
  return (
    <div className="space-y-3">
      <SchemaField
        schema={schema}
        value={value}
        onChange={onChange}
        rootSchema={schema}
        path="/"
      />
    </div>
  );
}
