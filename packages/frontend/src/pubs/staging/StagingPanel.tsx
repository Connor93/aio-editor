import { useState } from "react";

import type { ApiError } from "../../api/client";
import type { StagedFileEntry } from "./api";

interface StagingPanelProps {
  staged: StagedFileEntry[] | null;
  selectedFilename: string | null;
  selectedType: string | null;
  busy: boolean;
  onSelect(entry: StagedFileEntry): void;
  onPushAll(): Promise<void>;
  onError(err: unknown, fallback: string): void;
}

export function StagingPanel({
  staged,
  selectedFilename,
  selectedType,
  busy,
  onSelect,
  onPushAll,
  onError,
}: StagingPanelProps) {
  const [pushingAll, setPushingAll] = useState(false);

  async function handlePushAll() {
    if (!staged || staged.length === 0) return;
    setPushingAll(true);
    try {
      await onPushAll();
    } catch (err) {
      onError(err as ApiError, "push-all failed");
    } finally {
      setPushingAll(false);
    }
  }

  return (
    <div className="border-b border-slate-800/60">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
          Staging {staged && `(${staged.length})`}
        </h2>
        {staged && staged.length > 0 && (
          <button
            onClick={handlePushAll}
            disabled={busy || pushingAll}
            className="rounded-md border border-amber-700/60 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
            title="Push every staged file to live"
          >
            {pushingAll ? "…" : "push all"}
          </button>
        )}
      </div>
      {staged === null ? (
        <p className="px-3 pb-2 text-xs text-slate-500">loading…</p>
      ) : staged.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-slate-500">no staged changes</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto px-1.5 pb-2">
          {staged.map((entry) => {
            const isSelected =
              selectedType === entry.type && selectedFilename === entry.filename;
            return (
              <li key={`${entry.type}/${entry.filename}`}>
                <button
                  onClick={() => onSelect(entry)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {entry.type}/{entry.filename.replace(/\.json$/, "")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
