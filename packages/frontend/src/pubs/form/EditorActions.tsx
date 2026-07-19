interface EditorActionsProps {
  staged: boolean;
  dirty: boolean;
  saving: boolean;
  stagingBusy: boolean;
  diffLoading: boolean;
  statusMessage: string | null;
  error: string | null;
  onOpenDiff: () => void;
  onDiscard: () => void;
  onPushOne: () => void;
  onSave: () => void;
}

/** Status/error text plus the Diff / Discard / Push / Save buttons for the pub
 *  editor. Presentational only — all state comes from PubBrowser via props.
 *  Rendered in two slots: the desktop top toolbar and the mobile bottom bar. */
export function EditorActions({
  staged,
  dirty,
  saving,
  stagingBusy,
  diffLoading,
  statusMessage,
  error,
  onOpenDiff,
  onDiscard,
  onPushOne,
  onSave,
}: EditorActionsProps) {
  return (
    <>
      {statusMessage && (
        <span className="text-xs text-emerald-400">{statusMessage}</span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
      {staged && (
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
    </>
  );
}
