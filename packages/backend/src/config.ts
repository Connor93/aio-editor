import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is required. Set it in packages/backend/.env (see .env.example).`
    );
  }
  return value;
}

const pubDataDir = resolve(requireEnv("PUB_DATA_DIR"));
const gfxRoot = process.env.GFX_ROOT?.trim()
  ? resolve(process.env.GFX_ROOT.trim())
  : null;
const mapsDataDir = process.env.MAPS_DATA_DIR?.trim()
  ? resolve(process.env.MAPS_DATA_DIR.trim())
  : null;
const mapperAssetsDir = process.env.MAPPER_ASSETS_DIR?.trim()
  ? resolve(process.env.MAPPER_ASSETS_DIR.trim())
  : resolve(moduleDir, "assets/mapper");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "127.0.0.1",
  reoservBaseUrl: process.env.REOSERV_BASE_URL ?? "http://127.0.0.1:8090",
  pubDataDir,
  stagingDir: resolve(pubDataDir, ".staging"),
  gfxRoot,
  mapsDataDir,
  mapperAssetsDir,
};
