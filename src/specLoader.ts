import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fetchFbdlReference, type FbdlApiClientOptions } from "./api.js";
import { parseFbdlReference } from "./specParser.js";
import { setSpec } from "./spec.js";

const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "fbdl-mcp");
const DEFAULT_CACHE_FILE = path.join(DEFAULT_CACHE_DIR, "reference.json");

export type SpecSource = "api" | "cache";

export interface LoadSpecResult {
  readonly source: SpecSource;
  readonly cachePath: string;
  readonly apiError?: Error;
}

export interface LoadSpecOptions extends FbdlApiClientOptions {
  readonly cachePath?: string;
}

/**
 * Fetch the FBDL spec from the reference API, fall back to the on-disk cache
 * if the API is unreachable, and install the result into the spec singleton.
 *
 * Successful API responses are written to the cache for offline reuse. Throws
 * only if both the API call AND the cache read fail.
 */
export async function loadSpec(options: LoadSpecOptions = {}): Promise<LoadSpecResult> {
  const cachePath = options.cachePath ?? DEFAULT_CACHE_FILE;
  const apiOptions: FbdlApiClientOptions = {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  };

  let apiError: Error | undefined;
  try {
    const raw = await fetchFbdlReference(apiOptions);
    const parsed = parseFbdlReference(raw);
    setSpec(parsed.entities, parsed.actions);
    await writeCache(cachePath, raw).catch(() => {
      // Best-effort cache write — failure shouldn't break startup.
    });
    return { source: "api", cachePath };
  } catch (error) {
    apiError = error instanceof Error ? error : new Error(String(error));
  }

  const cached = await readCache(cachePath);
  if (cached !== null) {
    const parsed = parseFbdlReference(cached);
    setSpec(parsed.entities, parsed.actions);
    return { source: "cache", cachePath, apiError };
  }

  throw new Error(
    `Failed to load FBDL spec: API request failed (${apiError.message}) and no cached spec is available at ${cachePath}.`,
  );
}

async function writeCache(cachePath: string, raw: unknown): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(raw), "utf8");
}

async function readCache(cachePath: string): Promise<unknown> {
  try {
    const body = await fs.readFile(cachePath, "utf8");
    return JSON.parse(body) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export function logSpecLoadResult(result: LoadSpecResult): void {
  if (result.source === "api") {
    process.stderr.write(`fbdl-mcp: loaded FBDL spec from API\n`);
    return;
  }
  const reason = result.apiError !== undefined ? `: ${result.apiError.message}` : "";
  process.stderr.write(
    `fbdl-mcp: loaded FBDL spec from on-disk cache (${result.cachePath})${reason}\n`,
  );
}
