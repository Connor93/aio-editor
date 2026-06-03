import { PubBrowser } from "./pubs/PubBrowser";
import { RefsProvider } from "./pubs/refs/RefsContext";

interface AppShellProps {
  token: string;
  expiresAt: string | null;
  onLogout: () => void;
}

export function AppShell({ token, expiresAt, onLogout }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">AIO Editor</h1>
          <span className="text-xs text-slate-500">Sprint 3.2 — pub browser</span>
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

      <main className="flex-1 overflow-hidden">
        <RefsProvider token={token} onUnauthorized={onLogout}>
          <PubBrowser token={token} onUnauthorized={onLogout} />
        </RefsProvider>
      </main>
    </div>
  );
}
