import { existsSync, lstatSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { config } from "../config.js";

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

export class PubNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PubNotFoundError";
  }
}

/**
 * The editor exposes pubs by name. Names must be safe URL segments — no
 * traversal, no separators, no leading dot. The plain-segment guard runs on
 * every public entry-point.
 */
function assertSafeSegment(name: string, label: string): void {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.includes(":") ||
    name.startsWith(".")
  ) {
    throw new InvalidPathError(`invalid ${label}: ${JSON.stringify(name)}`);
  }
}

export interface PubTypeInfo {
  /** URL-safe name. For multi-file pubs this is the directory name; for
   *  single-file pubs it is the basename without `.json`. */
  type: string;
  /** "directory" => multi-file pub (e.g. items/, npcs/);
   *  "file" => single-file pub (e.g. zones.json, map_modules.json). */
  kind: "directory" | "file";
}

export async function listPubTypes(): Promise<PubTypeInfo[]> {
  const entries = await readdir(config.pubDataDir, { withFileTypes: true });
  const out: PubTypeInfo[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      out.push({ type: entry.name, kind: "directory" });
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push({ type: entry.name.slice(0, -".json".length), kind: "file" });
    }
  }

  out.sort((a, b) => a.type.localeCompare(b.type));
  return out;
}

export interface PubFileInfo {
  filename: string;
  staged: boolean;
}

async function readDirIfExists(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  const entries = await readdir(path);
  return entries.filter((e) => e.endsWith(".json"));
}

function isExistingDirOrSymlink(path: string): boolean {
  try {
    const st = lstatSync(path);
    return st.isDirectory() || st.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function listPubFiles(type: string): Promise<PubFileInfo[]> {
  assertSafeSegment(type, "type");

  const liveDir = join(config.pubDataDir, type);
  const stagingDir = join(config.stagingDir, type);

  if (existsSync(liveDir) && (await stat(liveDir)).isDirectory()) {
    const liveFiles = await readDirIfExists(liveDir);
    const stagedFiles = await readDirIfExists(stagingDir);
    const stagedSet = new Set(stagedFiles);

    const all = new Set([...liveFiles, ...stagedFiles]);
    return [...all]
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => ({ filename, staged: stagedSet.has(filename) }));
  }

  const singleFileName = `${type}.json`;
  const liveFile = join(config.pubDataDir, singleFileName);
  if (existsSync(liveFile)) {
    const stagedExists = existsSync(join(config.stagingDir, singleFileName));
    return [{ filename: singleFileName, staged: stagedExists }];
  }

  throw new PubNotFoundError(`unknown pub type: ${type}`);
}

/**
 * Resolves the on-disk paths (live + staging) for a (type, filename) pair.
 * Returns the canonical pair regardless of whether the file actually exists.
 */
function resolvePaths(
  type: string,
  filename: string
): { livePath: string; stagingPath: string; isSingleFile: boolean } {
  assertSafeSegment(type, "type");
  assertSafeSegment(filename, "filename");
  if (!filename.endsWith(".json")) {
    throw new InvalidPathError(`filename must end with .json: ${filename}`);
  }

  const singleFileName = `${type}.json`;
  if (filename === singleFileName) {
    const candidate = join(config.pubDataDir, singleFileName);
    const dirCandidate = join(config.pubDataDir, type);
    if (
      existsSync(candidate) &&
      !isExistingDirOrSymlink(dirCandidate)
    ) {
      return {
        livePath: candidate,
        stagingPath: join(config.stagingDir, singleFileName),
        isSingleFile: true,
      };
    }
  }

  return {
    livePath: join(config.pubDataDir, type, filename),
    stagingPath: join(config.stagingDir, type, filename),
    isSingleFile: false,
  };
}

export interface PubFileContent {
  content: string;
  source: "staging" | "live";
  staged: boolean;
}

export async function readPubFile(
  type: string,
  filename: string
): Promise<PubFileContent> {
  const { livePath, stagingPath } = resolvePaths(type, filename);

  if (existsSync(stagingPath)) {
    const content = await readFile(stagingPath, "utf8");
    return { content, source: "staging", staged: true };
  }

  if (existsSync(livePath)) {
    const content = await readFile(livePath, "utf8");
    return { content, source: "live", staged: false };
  }

  throw new PubNotFoundError(`pub file not found: ${type}/${filename}`);
}

export async function writePubFile(
  type: string,
  filename: string,
  content: string
): Promise<void> {
  // Validate JSON parses; refuse the write rather than persisting garbage.
  try {
    JSON.parse(content);
  } catch (err) {
    throw new InvalidPathError(
      `body is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const { stagingPath } = resolvePaths(type, filename);

  // Sanity check: the resolved staging path must remain inside config.stagingDir.
  const resolvedStaging = resolve(stagingPath);
  const resolvedRoot = resolve(config.stagingDir);
  if (!resolvedStaging.startsWith(resolvedRoot + "/") && resolvedStaging !== resolvedRoot) {
    throw new InvalidPathError(
      "resolved staging path escaped the staging root"
    );
  }

  await mkdir(dirname(resolvedStaging), { recursive: true });
  await writeFile(resolvedStaging, content, "utf8");
}

// Re-export for potential reuse by future modules without leaking internals
export const __internals_for_tests = {
  assertSafeSegment,
  resolvePaths,
  basenameNoExt: (p: string) => basename(p, extname(p)),
};
