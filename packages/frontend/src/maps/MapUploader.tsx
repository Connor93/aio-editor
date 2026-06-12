import { useEffect, useState } from "react";

import type { ApiError } from "../api/client";
import { fetchMapIds, uploadMap } from "./api";

interface MapUploaderProps {
  token: string;
  onUnauthorized: () => void;
}

export function MapUploader({ token, onUnauthorized }: MapUploaderProps) {
  const [ids, setIds] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [mapId, setMapId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchMapIds(token, ac.signal)
      .then(setIds)
      .catch((err: ApiError) => {
        if (err.status === 401) onUnauthorized();
      });
    return () => ac.abort();
  }, [token, onUnauthorized]);

  const refreshIds = () => {
    fetchMapIds(token)
      .then(setIds)
      .catch(() => {
        // non-fatal — the upload already succeeded
      });
  };

  const onFile = (f: File | null) => {
    setFile(f);
    if (f) {
      const m = /^(\d+)\.emf$/i.exec(f.name);
      if (m) setMapId(String(Number(m[1])));
    }
  };

  const onUpload = async () => {
    if (!file) {
      setBanner({ kind: "err", text: "Pick a .emf file first." });
      return;
    }
    const idNum = Number(mapId);
    if (!Number.isInteger(idNum) || idNum < 1) {
      setBanner({ kind: "err", text: "Enter a valid map id (positive integer)." });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const result = await uploadMap(file, idNum, token);
      setBanner({
        kind: "ok",
        text: result.reloaded
          ? `Map ${result.map_id} updated — reoserv hot-reloaded it.`
          : `Map ${result.map_id} created — reoserv hot-loaded the new map.`,
      });
      refreshIds();
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        onUnauthorized();
        return;
      }
      setBanner({ kind: "err", text: e.message ?? "Upload failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-xl space-y-5">
        <h2 className="text-lg font-semibold">Upload a map</h2>
        <p className="text-sm text-slate-400">
          Pick a <code>.emf</code> file and the map id it targets. reoserv
          hot-loads the map on the live server immediately — existing maps
          reload and brand-new map ids load without a restart.
        </p>

        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Map file (.emf)</span>
            <input
              type="file"
              accept=".emf"
              onChange={(e) => onFile(e.currentTarget.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-300"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Map id</span>
            <input
              type="number"
              min={1}
              value={mapId}
              onChange={(e) => setMapId(e.currentTarget.value)}
              className="w-32 rounded-md border border-slate-700 bg-slate-800 px-2 py-1"
            />
          </label>

          <button
            type="button"
            onClick={onUpload}
            disabled={busy}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>

          {banner && (
            <p className={`text-sm ${banner.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
              {banner.text}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-300">
            Existing maps ({ids.length})
          </h3>
          <div className="flex flex-wrap gap-1 text-xs">
            {ids.map((id) => (
              <span key={id} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                {id}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
