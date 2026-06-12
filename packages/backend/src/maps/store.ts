import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { config } from "../config.js";

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
