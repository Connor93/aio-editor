import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ApiError } from "../../api/client";
import { fetchPubFiles } from "../api";
import type { PubFile } from "../types";

interface RefsEntry {
  status: "loading" | "loaded" | "error";
  files: PubFile[];
  error?: string;
}

interface RefsContextValue {
  get(type: string): RefsEntry | null;
  ensureLoaded(type: string): void;
}

const RefsContext = createContext<RefsContextValue | null>(null);

interface RefsProviderProps {
  token: string;
  onUnauthorized: () => void;
  children: ReactNode;
}

export function RefsProvider({ token, onUnauthorized, children }: RefsProviderProps) {
  const [entries, setEntries] = useState<Map<string, RefsEntry>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());

  // Bust the cache when the bearer token changes. Practically the AppShell
  // remounts on login/logout so this only fires for in-session rotations,
  // but it keeps the contract obvious.
  useEffect(() => {
    setEntries(new Map());
    inFlight.current.clear();
  }, [token]);

  const ensureLoaded = useCallback(
    (type: string) => {
      if (inFlight.current.has(type)) return;
      if (entries.has(type)) return;
      inFlight.current.add(type);
      setEntries((prev) => {
        if (prev.has(type)) return prev;
        const next = new Map(prev);
        next.set(type, { status: "loading", files: [] });
        return next;
      });

      fetchPubFiles(type, token)
        .then((files) => {
          inFlight.current.delete(type);
          setEntries((prev) => {
            const next = new Map(prev);
            next.set(type, { status: "loaded", files });
            return next;
          });
        })
        .catch((err: ApiError) => {
          inFlight.current.delete(type);
          if (err?.status === 401) {
            onUnauthorized();
            return;
          }
          setEntries((prev) => {
            const next = new Map(prev);
            next.set(type, {
              status: "error",
              files: [],
              error: err?.message ?? "failed to load",
            });
            return next;
          });
        });
    },
    [entries, token, onUnauthorized]
  );

  const get = useCallback(
    (type: string): RefsEntry | null => entries.get(type) ?? null,
    [entries]
  );

  return (
    <RefsContext.Provider value={{ get, ensureLoaded }}>
      {children}
    </RefsContext.Provider>
  );
}

export function useRefs(type: string): RefsEntry {
  const ctx = useContext(RefsContext);
  useEffect(() => {
    if (!ctx) {
      // Dev-mode-only warning so a future refactor that moves a ReferenceField
      // outside the RefsProvider tree doesn't silently render a permanent
      // loading state. Vite strips this branch from prod builds.
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.error(
          `useRefs("${type}") called outside RefsProvider; ` +
            `ReferenceField will render a permanent loading state.`
        );
      }
      return;
    }
    ctx.ensureLoaded(type);
  }, [type, ctx]);
  return (
    ctx?.get(type) ?? {
      status: "loading",
      files: [],
    }
  );
}
