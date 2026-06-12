import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { config } from "../config.js";
import { decodeEmfName } from "./emf_name.js";

/** Client-correctable problems (bad magic, bad id). Mapped to 400 by the route. */
export class InvalidMapError extends Error {}

/** Map id is valid but no file exists on disk. Mapped to 404 by the route. */
export class MapNotFoundError extends Error {}

const MIN_MAP_ID = 1;
const MAX_MAP_ID = 32000;
// Real .emf files start with the ASCII bytes "EMF" (full header is "EMF2").
const EMF_MAGIC = Buffer.from("EMF", "latin1");

export function clampMapId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < MIN_MAP_ID || id > MAX_MAP_ID) {
    throw new InvalidMapError(`map_id must be an integer in ${MIN_MAP_ID}..${MAX_MAP_ID}`);
  }
  return id;
}

export function paddedMapName(id: number): string {
  return `${String(id).padStart(5, "0")}.emf`;
}

export function assertEmf(buffer: Buffer): void {
  if (buffer.length < 3 || !buffer.subarray(0, 3).equals(EMF_MAGIC)) {
    throw new InvalidMapError("not an EMF map file (missing 'EMF' magic header)");
  }
}

function mapsDir(): string {
  if (!config.mapsDataDir) {
    throw new InvalidMapError("maps are not configured on this server");
  }
  return config.mapsDataDir;
}

/** Write an uploaded map to its canonical {id:05}.emf. Backs up any existing
 *  file first, then writes atomically (temp + rename) so reoserv's watcher
 *  never sees a partial file. Returns reloaded:true when an existing map was
 *  overwritten (reoserv hot-reloads those) vs a new id (needs a restart). */
export async function writeMap(
  id: number,
  buffer: Buffer,
): Promise<{ mapId: number; reloaded: boolean }> {
  assertEmf(buffer);
  const dir = mapsDir();
  const canonical = join(dir, paddedMapName(id));
  const existed = existsSync(canonical);

  await mkdir(dir, { recursive: true });

  if (existed) {
    // One-level backup before clobbering. ".emf.bak" so reoserv's watcher
    // (which only reacts to the ".emf" extension) ignores it.
    const backupDir = join(dir, ".backups");
    await mkdir(backupDir, { recursive: true });
    const backup = join(backupDir, `${String(id).padStart(5, "0")}-${Date.now()}.emf.bak`);
    await copyFile(canonical, backup);
  }

  const tempPath = `${canonical}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tempPath, buffer);
  try {
    await rename(tempPath, canonical);
  } catch (err) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }

  return { mapId: id, reloaded: existed };
}

/** Map ids present on disk (canonical {digits}.emf only — skips backups,
 *  temp files, and the .backups dir). Sorted ascending. */
export async function listMapIds(): Promise<number[]> {
  const dir = mapsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const ids = new Set<number>();
  for (const name of entries) {
    const m = /^(\d+)\.emf$/.exec(name);
    if (m) ids.add(Number(m[1]));
  }
  return [...ids].sort((a, b) => a - b);
}

/** Read a map's raw .emf bytes by id. Throws MapNotFoundError (→404) when the
 *  canonical {id:05}.emf doesn't exist. */
export async function readMap(id: number): Promise<Buffer> {
  const dir = mapsDir();
  const path = join(dir, paddedMapName(id));
  if (!existsSync(path)) {
    throw new MapNotFoundError(`map ${id} not found`);
  }
  return readFile(path);
}

export interface MapEntry {
  id: number;
  name: string | null;
}

// (mtimeMs, name) keyed by map id — avoids re-reading headers on every list call
// when the file hasn't changed. Bounded by the number of maps on disk.
const nameCache = new Map<number, { mtimeMs: number; name: string | null }>();

/** Read a map's display name from its EMF header. Only the first 31 bytes are
 *  read. Returns null when the file is missing, isn't an EMF, or has no name.
 *  Memoised on the file's mtime. */
export async function readMapName(id: number): Promise<string | null> {
  const dir = mapsDir();
  const path = join(dir, paddedMapName(id));
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }
  const cached = nameCache.get(id);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.name;
  }
  let name: string | null = null;
  try {
    const fh = await open(path, "r");
    try {
      const header = Buffer.alloc(31);
      await fh.read(header, 0, 31, 0);
      name = decodeEmfName(header);
    } finally {
      await fh.close();
    }
  } catch {
    name = null;
  }
  nameCache.set(id, { mtimeMs, name });
  return name;
}

/** Maps on disk as `{ id, name }`, sorted by name (named first, alphabetical),
 *  then by id. Names come from each map's EMF header (partial read + cache). */
export async function listMaps(): Promise<MapEntry[]> {
  const ids = await listMapIds();
  const entries: MapEntry[] = await Promise.all(
    ids.map(async (id) => ({ id, name: await readMapName(id) })),
  );
  entries.sort((a, b) => {
    if (a.name && b.name) return a.name.localeCompare(b.name) || a.id - b.id;
    if (a.name) return -1;
    if (b.name) return 1;
    return a.id - b.id;
  });
  return entries;
}
