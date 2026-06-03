import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ApiError } from "../api/client";
import {
  fetchPubFile,
  fetchPubFiles,
  fetchPubTypes,
  savePubFile,
} from "./api";
import { SchemaForm } from "./form/SchemaForm";
import type { JsonSchema } from "./form/schema";
import type {
  PubFile,
  PubFileContent,
  PubSelection,
  PubType,
  ValidationIssue,
} from "./types";

type EditorMode = "form" | "json";

interface PubBrowserProps {
  token: string;
  onUnauthorized: () => void;
}

export function PubBrowser({ token, onUnauthorized }: PubBrowserProps) {
  const [types, setTypes] = useState<PubType[] | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [files, setFiles] = useState<PubFile[] | null>(null);
  const [selection, setSelection] = useState<PubSelection | null>(null);
  const [fileContent, setFileContent] = useState<PubFileContent | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>("form");

  const handleApiError = useCallback(
    (err: unknown, fallback: string): void => {
      const apiErr = err as ApiError;
      if (apiErr?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(apiErr?.message ?? fallback);
      setValidationErrors(apiErr?.validationErrors ?? []);
    },
    [onUnauthorized]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    fetchPubTypes(token, ctrl.signal)
      .then((t) => {
        if (!ctrl.signal.aborted) setTypes(t);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        handleApiError(err, "failed to load pub types");
      });
    return () => ctrl.abort();
  }, [token, handleApiError]);

  useEffect(() => {
    if (selectedType === null) return;
    const ctrl = new AbortController();
    setError(null);
    setFiles(null);
    fetchPubFiles(selectedType, token, ctrl.signal)
      .then((f) => {
        if (!ctrl.signal.aborted) setFiles(f);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        handleApiError(err, "failed to load files");
      });
    return () => ctrl.abort();
  }, [selectedType, token, handleApiError]);

  useEffect(() => {
    if (selection === null) {
      setFileContent(null);
      setDraft("");
      return;
    }
    const ctrl = new AbortController();
    setError(null);
    setStatusMessage(null);
    setValidationErrors([]);
    fetchPubFile(selection.type, selection.filename, token, ctrl.signal)
      .then((c) => {
        if (ctrl.signal.aborted) return;
        setFileContent(c);
        setDraft(c.content);
        // Default to form view when a schema is registered; otherwise fall
        // back to the raw JSON editor.
        setEditorMode(c.schema ? "form" : "json");
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        handleApiError(err, "failed to read file");
      });
    return () => ctrl.abort();
  }, [selection, token, handleApiError]);

  // Parse the current draft into a JS value for form rendering. When parse
  // fails (user typed invalid JSON in the JSON view, then switched modes)
  // the form view shows a helpful error rather than crashing.
  const schema = fileContent?.schema as JsonSchema | null | undefined;
  const parsedDraft = useMemo<{ value: unknown; error: string | null }>(() => {
    if (!schema) return { value: null, error: null };
    try {
      return { value: JSON.parse(draft), error: null };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft, schema]);

  const dirty = fileContent !== null && draft !== fileContent.content;

  async function onSave() {
    if (!selection || !fileContent) return;
    setSaving(true);
    setStatusMessage(null);
    setError(null);
    setValidationErrors([]);
    try {
      await savePubFile(selection.type, selection.filename, draft, token);
      setStatusMessage("saved to staging");
      setFileContent({ ...fileContent, content: draft, source: "staging", staged: true });
      // Refresh the sidebar entry too — saved name may have changed, and we
      // don't want the list to keep showing the old display name until the
      // user navigates away and back.
      const savedName = (() => {
        try {
          const parsed = JSON.parse(draft);
          if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
            return parsed.name;
          }
        } catch {
          // unreadable JSON shouldn't reach here (server accepted the save)
        }
        return undefined;
      })();
      if (files) {
        setFiles(
          files.map((f) =>
            f.filename === selection.filename
              ? { ...f, staged: true, ...(savedName !== undefined ? { name: savedName } : {}) }
              : f
          )
        );
      }
    } catch (err) {
      handleApiError(err, "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[14rem_18rem_1fr] gap-0 border-t border-slate-800">
      <aside className="border-r border-slate-800 bg-slate-950/40 p-2 overflow-auto">
        <h2 className="text-xs uppercase text-slate-500 px-2 py-1">Pub types</h2>
        {types === null ? (
          <p className="px-2 py-1 text-sm text-slate-400">loading…</p>
        ) : (
          <ul>
            {types.map((t) => (
              <li key={t.type}>
                <button
                  className={`w-full text-left rounded px-2 py-1 text-sm hover:bg-slate-800 ${
                    selectedType === t.type ? "bg-slate-800 text-white" : "text-slate-300"
                  }`}
                  onClick={() => {
                    setSelectedType(t.type);
                    setSelection(null);
                  }}
                >
                  {t.type}
                  <span className="ml-2 text-[10px] uppercase text-slate-500">{t.kind === "directory" ? "dir" : "file"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <aside className="border-r border-slate-800 bg-slate-950/20 p-2 overflow-auto">
        <h2 className="text-xs uppercase text-slate-500 px-2 py-1">Files</h2>
        {selectedType === null ? (
          <p className="px-2 py-1 text-sm text-slate-400">pick a pub type</p>
        ) : files === null ? (
          <p className="px-2 py-1 text-sm text-slate-400">loading…</p>
        ) : files.length === 0 ? (
          <p className="px-2 py-1 text-sm text-slate-400">no files</p>
        ) : (
          <ul>
            {files.map((f) => (
              <li key={f.filename}>
                <button
                  className={`w-full text-left rounded px-2 py-1 text-sm hover:bg-slate-800 ${
                    selection?.filename === f.filename ? "bg-slate-800 text-white" : "text-slate-300"
                  }`}
                  onClick={() =>
                    setSelection({ type: selectedType, filename: f.filename })
                  }
                >
                  <span className="truncate block">
                    {f.name ?? <span className="italic text-slate-500">(unnamed)</span>}
                  </span>
                  <span className="block font-mono text-[10px] text-slate-500">
                    {f.filename}
                    {f.staged && (
                      <span className="ml-2 uppercase text-amber-400">staged</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex min-h-0 flex-col bg-slate-950/0">
        {selection === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            pick a file to edit
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-sm">
              <div className="font-mono text-slate-300">
                {selection.type}/{selection.filename}
                {fileContent?.staged && (
                  <span className="ml-2 text-[10px] uppercase text-amber-400">
                    {fileContent.source === "staging" ? "from staging" : "live"}
                  </span>
                )}
                {dirty && (
                  <span className="ml-2 text-[10px] uppercase text-blue-400">
                    unsaved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {schema && (
                  <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
                    <button
                      onClick={() => setEditorMode("form")}
                      className={`px-3 py-1 ${
                        editorMode === "form" ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      Form
                    </button>
                    <button
                      onClick={() => setEditorMode("json")}
                      className={`px-3 py-1 ${
                        editorMode === "json" ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                )}
                {error && <span className="text-xs text-red-400">{error}</span>}
                {statusMessage && (
                  <span className="text-xs text-emerald-400">{statusMessage}</span>
                )}
                <button
                  onClick={onSave}
                  disabled={!dirty || saving}
                  className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save to staging"}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {!fileContent ? (
                <div className="p-4 text-sm text-slate-400">loading…</div>
              ) : editorMode === "form" && schema ? (
                parsedDraft.error ? (
                  <div className="m-4 rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-300">
                    Cannot render form — JSON does not parse: {parsedDraft.error}
                    <div className="mt-2 text-xs text-amber-400">
                      Switch to JSON view to fix the syntax.
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <SchemaForm
                      schema={schema}
                      value={parsedDraft.value}
                      onChange={(next) =>
                        setDraft(JSON.stringify(next, null, 2))
                      }
                    />
                  </div>
                )
              ) : (
                <CodeMirror
                  value={draft}
                  height="100%"
                  theme="dark"
                  extensions={[json()]}
                  onChange={(value) => setDraft(value)}
                  basicSetup={{ lineNumbers: true, foldGutter: true }}
                />
              )}
            </div>
            {validationErrors.length > 0 && (
              <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2">
                <p className="text-xs uppercase text-red-400 mb-1">
                  Schema validation errors ({validationErrors.length})
                </p>
                <ul className="text-xs text-red-300 space-y-1 max-h-40 overflow-auto">
                  {validationErrors.map((issue, i) => (
                    <li key={i} className="font-mono">
                      <span className="text-red-500">{issue.path}</span>{" "}
                      <span className="text-red-300">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
