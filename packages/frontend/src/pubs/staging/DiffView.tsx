import { useMemo } from "react";
import { diffLines } from "diff";

interface DiffViewProps {
  live: string | null;
  staging: string | null;
}

export function DiffView({ live, staging }: DiffViewProps) {
  const parts = useMemo(() => {
    const liveText = pretty(live);
    const stagingText = pretty(staging);
    return diffLines(liveText, stagingText);
  }, [live, staging]);

  if (live === null && staging === null) {
    return (
      <div className="rounded border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-300">
        File not found on live or staging. It may have been pushed or discarded
        by another session.
      </div>
    );
  }
  if (live === null && staging !== null) {
    return (
      <div className="rounded border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm text-emerald-300">
        New file — no live counterpart yet. Push will create it.
      </div>
    );
  }
  if (live !== null && staging === null) {
    return (
      <div className="rounded border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-300">
        No staged changes for this file.
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs leading-relaxed">
      {parts.map((part, i) => {
        const sign = part.added ? "+" : part.removed ? "−" : " ";
        const color = part.added
          ? "text-emerald-300 bg-emerald-950/30"
          : part.removed
            ? "text-red-300 bg-red-950/30"
            : "text-slate-400";
        // Strip the final newline from each part so the prefix lands on the
        // same physical line as the content.
        const lines = part.value.replace(/\n$/, "").split("\n");
        return (
          <div key={i} className={color}>
            {lines.map((line, j) => (
              <div key={j} className="whitespace-pre">
                <span className="select-none pr-2 text-slate-600">{sign}</span>
                {line || " "}
              </div>
            ))}
          </div>
        );
      })}
    </pre>
  );
}

function pretty(s: string | null): string {
  if (s === null) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
