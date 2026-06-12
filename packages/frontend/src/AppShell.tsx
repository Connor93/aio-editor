import { useState } from "react";

import { MapEditor } from "./maps/MapEditor";
import { MapUploader } from "./maps/MapUploader";
import { PubBrowser } from "./pubs/PubBrowser";
import { RefsProvider } from "./pubs/refs/RefsContext";
import { RollSimulator } from "./rolls/RollSimulator";

type View = "pubs" | "rolls" | "maps" | "mapeditor";

interface AppShellProps {
  token: string;
  expiresAt: string | null;
  onLogout: () => void;
}

export function AppShell({ token, expiresAt, onLogout }: AppShellProps) {
  const [view, setView] = useState<View>("pubs");

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3">
        <div className="flex items-baseline gap-6">
          <h1 className="text-lg font-semibold">AIO Editor</h1>
          <nav className="flex gap-1 text-sm">
            <NavTab
              active={view === "pubs"}
              onClick={() => setView("pubs")}
              label="Pubs"
            />
            <NavTab
              active={view === "rolls"}
              onClick={() => setView("rolls")}
              label="Roll simulator"
            />
            <NavTab
              active={view === "maps"}
              onClick={() => setView("maps")}
              label="Maps"
            />
            <NavTab
              active={view === "mapeditor"}
              onClick={() => setView("mapeditor")}
              label="Map Editor"
            />
          </nav>
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
        {view === "pubs" ? (
          <RefsProvider token={token} onUnauthorized={onLogout}>
            <PubBrowser token={token} onUnauthorized={onLogout} />
          </RefsProvider>
        ) : view === "rolls" ? (
          <RollSimulator token={token} onUnauthorized={onLogout} />
        ) : view === "maps" ? (
          <MapUploader token={token} onUnauthorized={onLogout} />
        ) : (
          <MapEditor token={token} />
        )}
      </main>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 transition-colors ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
