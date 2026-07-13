import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSpec } from "../specLoader.js";
import { clearSpec, getSetupEntities } from "../spec.js";
import { FIXTURE_JSON } from "./fixtures/loadFixtureSpec.js";

let cacheDir: string;
let cachePath: string;

beforeEach(async () => {
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fbdl-spec-loader-"));
  cachePath = path.join(cacheDir, "reference.json");
  clearSpec();
});

afterEach(async () => {
  clearSpec();
  await fs.rm(cacheDir, { recursive: true, force: true });
});

function jsonFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: init.status ?? (init.ok === false ? 500 : 200),
      }),
    ),
  );
}

function failingFetch(message: string) {
  return vi.fn<typeof fetch>(() => Promise.reject(new Error(message)));
}

describe("loadSpec", () => {
  it("loads from the API, installs the spec, and writes the cache", async () => {
    const fetchImpl = jsonFetch(FIXTURE_JSON);

    const result = await loadSpec({
      env: { FBDL_API_TOKEN: "t" },
      fetchImpl,
      cachePath,
    });

    expect(result.source).toBe("api");
    expect(getSetupEntities().length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.facebook.com/bug_bounty/fbdl_reference/",
      expect.any(Object),
    );
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8")) as unknown;
    expect(cached).toEqual(FIXTURE_JSON);
  });

  it("falls back to the cache when the API request fails", async () => {
    await fs.writeFile(cachePath, JSON.stringify(FIXTURE_JSON), "utf8");

    const result = await loadSpec({
      env: { FBDL_API_TOKEN: "t" },
      fetchImpl: failingFetch("ECONNREFUSED"),
      cachePath,
    });

    expect(result.source).toBe("cache");
    expect(result.apiError?.message).toContain("ECONNREFUSED");
    expect(getSetupEntities().length).toBeGreaterThan(0);
  });

  it("falls back to the cache when the API returns a non-2xx response", async () => {
    await fs.writeFile(cachePath, JSON.stringify(FIXTURE_JSON), "utf8");

    const result = await loadSpec({
      env: { FBDL_API_TOKEN: "t" },
      fetchImpl: jsonFetch({ error: "down" }, { ok: false, status: 503 }),
      cachePath,
    });

    expect(result.source).toBe("cache");
  });

  it("throws a descriptive error when both the API and the cache are unavailable", async () => {
    await expect(
      loadSpec({
        env: { FBDL_API_TOKEN: "t" },
        fetchImpl: failingFetch("offline"),
        cachePath,
      }),
    ).rejects.toThrow(/no cached spec is available/);
  });

  it("propagates the missing-token error from the API client", async () => {
    await expect(
      loadSpec({
        env: {},
        fetchImpl: jsonFetch(FIXTURE_JSON),
        cachePath,
      }),
    ).rejects.toThrow(/FBDL_API_TOKEN/);
  });
});
