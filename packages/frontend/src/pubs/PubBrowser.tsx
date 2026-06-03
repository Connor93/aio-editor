import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useState } from "react";

import type { ApiError } from "../api/client";
import {
  fetchPubFile,
  fetchPubFiles,
  fetchPubTypes,
  savePubFile,
} from "./api";
import type {
  PubFile,
  PubFileContent,
  PubSelection,
  PubType,
} from "./types";

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

  const handleApiError = useCallback(
    (err: unknown, fallback: string): void => {
      const apiErr = err as ApiError;
      if (apiErr?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(apiErr?.message ?? fallback);
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
    fetchPubFile(selection.type, selection.filename, token, ctrl.signal)
      .then((c) => {
        if (ctrl.signal.aborted) return;
        setFileContent(c);
        setDraft(c.content);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        handleApiError(err, "failed to read file");
      });
    return () => ctrl.abort();
  }, [selection, token, handleApiError]);

  const dirty = fileContent !== null && draft !== fileContent.content;

  async function onSave() {
    if (!selection || !fileContent) return;
    setSaving(true);
    setStatusMessage(null);
    setError(null);
    try {
      await savePubFile(selection.type, selection.filename, draft, token);
      setStatusMessage("saved to staging");
      setFileContent({ ...fileContent, content: draft, source: "staging", staged: true });
      if (files) {
        setFiles(
          files.map((f) =>
            f.filename === selection.filename ? { ...f, staged: true } : f
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
                  className={`w-full text-left rounded px-2 py-1 text-sm font-mono hover:bg-slate-800 ${
                    selection?.filename === f.filename ? "bg-slate-800 text-white" : "text-slate-300"
                  }`}
                  onClick={() =>
                    setSelection({ type: selectedType, filename: f.filename })
                  }
                >
                  <span className="truncate block">{f.filename}</span>
                  {f.staged && (
                    <span className="text-[10px] uppercase text-amber-400">staged</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex flex-col bg-slate-950/0">
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
            <div className="flex-1 overflow-auto">
              {fileContent ? (
                <CodeMirror
                  value={draft}
                  height="100%"
                  theme="dark"
                  extensions={[json()]}
                  onChange={(value) => setDraft(value)}
                  basicSetup={{ lineNumbers: true, foldGutter: true }}
                />
              ) : (
                <div className="p-4 text-sm text-slate-400">loading…</div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
