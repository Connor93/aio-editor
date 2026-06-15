import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ApiError } from "../api/client";
import {
  fetchPubFile,
  fetchPubFiles,
  fetchPubTypes,
  fetchSchema,
  savePubFile,
} from "./api";
import { ComputedStatsCard } from "./form/ComputedStatsCard";
import { SchemaForm } from "./form/SchemaForm";
import { type JsonSchema, makeDefault } from "./form/schema";
import {
  type PubFileDiff,
  type StagedFileEntry,
  discardStaged,
  fetchDiff,
  fetchStaging,
  pushStaged,
} from "./staging/api";
import { DiffView } from "./staging/DiffView";
import { StagingPanel } from "./staging/StagingPanel";
import type {
  PubFile,
  PubFileContent,
  PubSelection,
  PubType,
  ValidationIssue,
} from "./types";

type EditorMode = "form" | "json";

/** Fallback display label for files whose JSON has no top-level `name`.
 *  Strips `.json`, replaces underscores with spaces, and title-cases each
 *  word — e.g. `example_fire_dmg.json` → `Example Fire Dmg`. Used in the
 *  file picker so single-config pubs (zones.json, reputation_tiers.json)
 *  don't show "(unnamed)" by default. */
function humanizeFilename(filename: string): string {
  return filename
    .replace(/\.json$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface PubBrowserProps {
  token: string;
  onUnauthorized: () => void;
}

export function PubBrowser({ token, onUnauthorized }: PubBrowserProps) {
  const [types, setTypes] = useState<PubType[] | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [files, setFiles] = useState<PubFile[] | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [selection, setSelection] = useState<PubSelection | null>(null);
  const [fileContent, setFileContent] = useState<PubFileContent | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>("form");
  const [staged, setStaged] = useState<StagedFileEntry[] | null>(null);
  const [diff, setDiff] = useState<PubFileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [stagingBusy, setStagingBusy] = useState(false);

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

  const refreshStaging = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const files = await fetchStaging(token, signal);
        if (!signal?.aborted) setStaged(files);
      } catch (err) {
        if (signal?.aborted) return;
        handleApiError(err, "failed to load staging");
      }
    },
    [token, handleApiError]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    refreshStaging(ctrl.signal);
    return () => ctrl.abort();
  }, [refreshStaging]);

  useEffect(() => {
    if (selectedType === null) return;
    const ctrl = new AbortController();
    setError(null);
    setFiles(null);
    setFileSearch("");
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

  // Case-insensitive substring filter over the leading numeric ID and the
  // display name. Both are checked so "0014" finds the file directly and
  // "drag" finds anything named "Dragon Slayer".
  const visibleFiles = useMemo(() => {
    if (!files) return null;
    const q = fileSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => {
      const idStr = f.filename.replace(/\.json$/, "").toLowerCase();
      if (idStr.includes(q)) return true;
      if (f.name && f.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [files, fileSearch]);

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

  const selectedTypeMeta = selectedType
    ? types?.find((t) => t.type === selectedType) ?? null
    : null;
  const canCreateNew =
    selectedTypeMeta?.kind === "directory" && selectedTypeMeta.hasSchema === true;
  const [creating, setCreating] = useState(false);

  function nextAvailableId(existing: PubFile[]): string {
    // REOSERV's directory pubs use 4-digit zero-padded ids today. Derive
    // width from the next id itself so a stray 5-digit import doesn't bump
    // every subsequent new file out of the convention.
    let max = 0;
    for (const f of existing) {
      const m = /^(\d+)\.json$/.exec(f.filename);
      if (!m) continue;
      const id = Number(m[1]);
      if (id > max) max = id;
    }
    const next = max + 1;
    const width = Math.max(4, String(next).length);
    return `${String(next).padStart(width, "0")}.json`;
  }

  async function onPushOne() {
    if (!selection) return;
    setStagingBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await pushStaged(
        [{ type: selection.type, filename: selection.filename }],
        token
      );
      if (result.errors.length > 0) {
        setError(result.errors.map((e) => e.message).join("; "));
      } else {
        setStatusMessage("pushed to live");
        // After a push the file is live, no longer staged.
        if (fileContent) {
          setFileContent({ ...fileContent, staged: false, source: "live" });
        }
        if (files) {
          setFiles(
            files.map((f) =>
              f.filename === selection.filename ? { ...f, staged: false } : f
            )
          );
        }
        await refreshStaging();
      }
    } catch (err) {
      handleApiError(err, "push failed");
    } finally {
      setStagingBusy(false);
    }
  }

  async function onPushAll() {
    setStagingBusy(true);
    try {
      const result = await pushStaged("all", token);
      if (result.errors.length > 0) {
        setError(result.errors.map((e) => `${e.type}/${e.filename}: ${e.message}`).join("; "));
      } else {
        setStatusMessage(`pushed ${result.pushed.length} file${result.pushed.length === 1 ? "" : "s"} to live`);
      }
      await refreshStaging();
      // The currently selected file may also have been pushed — reload its
      // metadata so the toolbar badges and form view stay correct.
      if (selection) {
        try {
          const fresh = await fetchPubFile(selection.type, selection.filename, token);
          setFileContent(fresh);
          setDraft(fresh.content);
        } catch {
          // best-effort refresh; non-blocking
        }
      }
      if (selectedType && files) {
        const refreshed = await fetchPubFiles(selectedType, token);
        setFiles(refreshed);
      }
    } finally {
      setStagingBusy(false);
    }
  }

  async function onDiscard() {
    if (!selection) return;
    setStagingBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await discardStaged(selection.type, selection.filename, token);
      // Refetch so the editor shows the live content (and clears staged state).
      const fresh = await fetchPubFile(selection.type, selection.filename, token);
      setFileContent(fresh);
      setDraft(fresh.content);
      if (files) {
        setFiles(
          files.map((f) =>
            f.filename === selection.filename ? { ...f, staged: false } : f
          )
        );
      }
      setStatusMessage("discarded staged change");
      await refreshStaging();
    } catch (err) {
      handleApiError(err, "discard failed");
    } finally {
      setStagingBusy(false);
    }
  }

  async function onOpenDiff() {
    if (!selection) return;
    setDiffLoading(true);
    setError(null);
    try {
      const d = await fetchDiff(selection.type, selection.filename, token);
      setDiff(d);
    } catch (err) {
      handleApiError(err, "diff failed");
    } finally {
      setDiffLoading(false);
    }
  }

  async function onCreateNew() {
    if (!selectedType || !canCreateNew || !files) return;
    // Capture state at the start so a mid-flight selectedType change can't
    // inject a new file into the wrong type's list. Cheaper than threading
    // an AbortController through fetchSchema for this one off-the-hot-path
    // action.
    const requestedType = selectedType;
    const filesAtStart = files;
    setCreating(true);
    setError(null);
    setStatusMessage(null);
    setValidationErrors([]);
    try {
      const schema = await fetchSchema(requestedType, token);
      const skeleton = makeDefault(schema, schema);
      const filename = nextAvailableId(filesAtStart);
      const body = JSON.stringify(skeleton, null, 2);
      await savePubFile(requestedType, filename, body, token);
      // Staging is type-agnostic — refresh it regardless of where the user is now.
      await refreshStaging();
      if (selectedType !== requestedType) {
        // The user moved on while the create was in flight — don't smear
        // sidebar/selection state onto a different type.
        return;
      }
      setFiles([...filesAtStart, { filename, staged: true, name: null }]);
      setSelection({ type: requestedType, filename });
      setStatusMessage(`created ${filename} in staging`);
    } catch (err) {
      handleApiError(err, "failed to create new file");
    } finally {
      setCreating(false);
    }
  }

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
      // Reflect the new staged file in the Staging panel immediately, without a
      // manual page refresh.
      await refreshStaging();
    } catch (err) {
      handleApiError(err, "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[14rem_20rem_1fr] gap-0 border-t border-slate-800">
      <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950/40">
        <StagingPanel
          staged={staged}
          selectedType={selection?.type ?? null}
          selectedFilename={selection?.filename ?? null}
          busy={stagingBusy}
          onSelect={(entry) => {
            setSelectedType(entry.type);
            setSelection({ type: entry.type, filename: entry.filename });
          }}
          onPushAll={onPushAll}
          onError={handleApiError}
        />
        <div className="border-b border-slate-800/60 px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Pub types
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {types === null ? (
            <p className="px-2 py-1 text-sm text-slate-500">loading…</p>
          ) : (
            <ul className="space-y-0.5">
              {types.map((t) => (
                <li key={t.type}>
                  <button
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      selectedType === t.type
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                    onClick={() => {
                      setSelectedType(t.type);
                      setSelection(null);
                    }}
                  >
                    <span>{t.type}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {t.kind === "directory" ? "dir" : "file"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950/20">
        <div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Files{" "}
            {files &&
              (fileSearch && visibleFiles
                ? `(${visibleFiles.length}/${files.length})`
                : `(${files.length})`)}
          </h2>
          {canCreateNew && (
            <button
              onClick={onCreateNew}
              disabled={creating}
              className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Create a new ${selectedType} entry`}
            >
              {creating ? "…" : "+ new"}
            </button>
          )}
        </div>
        {selectedType !== null && files !== null && files.length > 0 && (
          <div className="border-b border-slate-800/40 px-2 py-1.5">
            <div className="relative">
              <input
                type="search"
                value={fileSearch}
                onChange={(e) => setFileSearch(e.currentTarget.value)}
                placeholder="Search by name or ID…"
                className="w-full rounded border border-slate-700 bg-slate-900/60 px-2 py-1 pr-7 text-sm text-slate-200 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
              />
              {fileSearch && (
                <button
                  onClick={() => setFileSearch("")}
                  className="-translate-y-1/2 absolute top-1/2 right-1 rounded px-1 text-slate-400 hover:text-slate-200"
                  title="clear search"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {selectedType === null ? (
            <p className="px-2 py-1 text-sm text-slate-500">pick a pub type</p>
          ) : files === null ? (
            <p className="px-2 py-1 text-sm text-slate-500">loading…</p>
          ) : files.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">no files</p>
          ) : visibleFiles && visibleFiles.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-500">
              no files match “{fileSearch}”
            </p>
          ) : (
            <ul className="space-y-0.5">
              {(visibleFiles ?? files).map((f) => {
                const selected = selection?.filename === f.filename;
                return (
                  <li key={f.filename}>
                    <button
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
                        selected
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-800/60"
                      }`}
                      onClick={() =>
                        setSelection({ type: selectedType, filename: f.filename })
                      }
                    >
                      {f.staged ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                          title="staged"
                        />
                      ) : (
                        <span className="h-1.5 w-1.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {f.name ?? (
                          <span className="text-slate-400">
                            {humanizeFilename(f.filename)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {f.filename.replace(/\.json$/, "")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-slate-950/0">
        {selection === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            pick a file to edit
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/40 px-4 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-slate-200">
                  {selection.type}/{selection.filename}
                </span>
                {fileContent?.staged && (
                  <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                    staged
                  </span>
                )}
                {dirty && (
                  <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-300">
                    unsaved
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {schema && (
                  <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
                    <button
                      onClick={() => setEditorMode("form")}
                      className={`px-3 py-1 transition-colors ${
                        editorMode === "form"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      Form
                    </button>
                    <button
                      onClick={() => setEditorMode("json")}
                      className={`px-3 py-1 transition-colors ${
                        editorMode === "json"
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                )}
                {statusMessage && (
                  <span className="text-xs text-emerald-400">{statusMessage}</span>
                )}
                {error && <span className="text-xs text-red-400">{error}</span>}
                {fileContent?.staged && (
                  <>
                    <button
                      onClick={onOpenDiff}
                      disabled={stagingBusy || diffLoading}
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
                      title="Show diff against live"
                    >
                      {diffLoading ? "…" : "Diff"}
                    </button>
                    <button
                      onClick={onDiscard}
                      disabled={stagingBusy}
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
                      title="Discard staged change; revert to live"
                    >
                      Discard
                    </button>
                    <button
                      onClick={onPushOne}
                      disabled={stagingBusy}
                      className="rounded-md border border-amber-700/60 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                      title="Atomically copy staging → live"
                    >
                      Push to live
                    </button>
                  </>
                )}
                <button
                  onClick={onSave}
                  disabled={!dirty || saving}
                  className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
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
                    {selection?.type === "npcs" &&
                      parsedDraft.value != null &&
                      typeof parsedDraft.value === "object" && (
                        <ComputedStatsCard
                          npc={parsedDraft.value as Record<string, unknown>}
                          token={token}
                          onUnauthorized={onUnauthorized}
                        />
                      )}
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

      {diff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur"
          onClick={() => setDiff(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <h3 className="font-mono text-sm text-slate-200">
                {diff.type}/{diff.filename}
                <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
                  diff
                </span>
              </h3>
              <button
                onClick={() => setDiff(null)}
                className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <DiffView live={diff.live} staging={diff.staging} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
