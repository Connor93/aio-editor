import { existsSync, lstatSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { config } from "../config.js";

export interface StagedFileEntry {
  type: string;
  filename: string;
  bytes: number;
  modifiedAt: string;
}

/** Walk the staging directory tree and return every staged file with metadata.
 *  Top-level entries (e.g. `.staging/zones.json`) carry no `type`/subdir; we
 *  normalise them to `type === <basename without .json>` matching the rest
 *  of the API. */
export async function listStagedFiles(): Promise<StagedFileEntry[]> {
  if (!existsSync(config.stagingDir)) return [];
  const out: StagedFileEntry[] = [];

  const topEntries = await readdir(config.stagingDir, { withFileTypes: true });
  for (const entry of topEntries) {
    if (entry.name.startsWith(".")) continue;

    const topPath = join(config.stagingDir, entry.name);

    if (entry.isFile() && entry.name.endsWith(".json")) {
      const stats = await stat(topPath);
      out.push({
        type: entry.name.slice(0, -".json".length),
        filename: entry.name,
        bytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
      continue;
    }

    if (entry.isDirectory()) {
      const children = await readdir(topPath, { withFileTypes: true });
      for (const child of children) {
        if (!child.isFile()) continue;
        if (!child.name.endsWith(".json")) continue;
        const childPath = join(topPath, child.name);
        const stats = await stat(childPath);
        out.push({
          type: entry.name,
          filename: child.name,
          bytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
  }

  out.sort((a, b) => {
    const cmp = a.type.localeCompare(b.type);
    return cmp !== 0 ? cmp : a.filename.localeCompare(b.filename);
  });
  return out;
}

/** Resolve the live + staging paths for a (type, filename) pair, handling the
 *  single-file pub special case where the file lives at `<pubDir>/<type>.json`
 *  instead of `<pubDir>/<type>/<filename>`. */
function pairPaths(type: string, filename: string): { livePath: string; stagingPath: string } {
  const singleFileName = `${type}.json`;
  if (filename === singleFileName) {
    const liveCandidate = join(config.pubDataDir, singleFileName);
    const dirCandidate = join(config.pubDataDir, type);
    if (existsSync(liveCandidate) && !existsSync(dirCandidate)) {
      return {
        livePath: liveCandidate,
        stagingPath: join(config.stagingDir, singleFileName),
      };
    }
    // Staging-only single-file pub (no live counterpart yet) — fall through
    // to the directory-layout assumption so the file gets pushed in the
    // canonical spot.
    if (!existsSync(dirCandidate)) {
      return {
        livePath: liveCandidate,
        stagingPath: join(config.stagingDir, singleFileName),
      };
    }
  }
  return {
    livePath: join(config.pubDataDir, type, filename),
    stagingPath: join(config.stagingDir, type, filename),
  };
}

export interface PubFileDiff {
  type: string;
  filename: string;
  live: string | null;
  staging: string | null;
}

export async function readDiff(type: string, filename: string): Promise<PubFileDiff> {
  const { livePath, stagingPath } = pairPaths(type, filename);
  const live = existsSync(livePath) ? await readFile(livePath, "utf8") : null;
  const staging = existsSync(stagingPath) ? await readFile(stagingPath, "utf8") : null;
  return { type, filename, live, staging };
}

export class StagingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingNotFoundError";
  }
}

/** Atomic copy `<stagingPath>` → `<livePath>` via write-to-temp + rename. The
 *  rename is atomic on the same filesystem (POSIX guarantee), so a concurrent
 *  REOSERV hot-reload either sees the old file or the new one — never a
 *  partially written one. */
export async function pushFile(type: string, filename: string): Promise<void> {
  const { livePath, stagingPath } = pairPaths(type, filename);
  if (!existsSync(stagingPath)) {
    throw new StagingNotFoundError(`no staged copy of ${type}/${filename}`);
  }

  const content = await readFile(stagingPath, "utf8");
  await mkdir(dirname(livePath), { recursive: true });

  const tempPath = `${livePath}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tempPath, content, "utf8");
  try {
    await rename(tempPath, livePath);
  } catch (err) {
    // Best-effort cleanup of the temp file if rename fails (e.g. cross-device).
    try {
      await rm(tempPath, { force: true });
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }

  // Drop the staging copy now that live owns the canonical state.
  await rm(stagingPath, { force: true });
}

export async function discardStaged(type: string, filename: string): Promise<void> {
  const { stagingPath } = pairPaths(type, filename);
  if (!existsSync(stagingPath)) {
    throw new StagingNotFoundError(`no staged copy of ${type}/${filename}`);
  }
  // force:true so a concurrent discard/push that already removed the file
  // doesn't bubble up an ENOENT as a generic 500 — we already verified
  // intent via existsSync above.
  await rm(stagingPath, { force: true });
}

/** Defensive: any path resolved for read/write must remain rooted in either
 *  the live pub dir or the staging dir. Catches anything that slipped past
 *  the param-level segment safety check. */
export function assertWithinRoots(path: string): void {
  const resolved = resolve(path);
  const liveRoot = resolve(config.pubDataDir);
  const stagingRoot = resolve(config.stagingDir);
  if (
    !resolved.startsWith(liveRoot + "/") &&
    !resolved.startsWith(stagingRoot + "/") &&
    resolved !== liveRoot &&
    resolved !== stagingRoot
  ) {
    throw new Error(`resolved path escaped both roots: ${resolved}`);
  }
}

// Silence unused-import linter for the safety helper export — it'll get a
// consumer in Sprint 3.4 when the audit layer adds path tracking.
void lstatSync;
