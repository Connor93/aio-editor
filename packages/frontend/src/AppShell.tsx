interface AppShellProps {
  expiresAt: string | null;
  onLogout: () => void;
}

export function AppShell({ expiresAt, onLogout }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">AIO Editor</h1>
          <span className="text-xs text-slate-500">Sprint 3.1 — scaffold</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {expiresAt && (
            <span className="text-slate-400">
              session ends {new Date(expiresAt).toLocaleString()}
            </span>
          )}
          <button
            onClick={onLogout}
            className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="rounded-lg border border-dashed border-slate-800 p-12 text-center text-slate-400">
          <p className="text-lg">Authenticated.</p>
          <p className="mt-2 text-sm">
            Sprint 3.2 will wire up the pub editor views here.
          </p>
        </div>
      </main>
    </div>
  );
}
