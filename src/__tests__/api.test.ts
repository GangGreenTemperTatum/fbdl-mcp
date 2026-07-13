import { describe, it, expect, vi } from "vitest";
import {
  archiveFbdlRun,
  createFbdlRun,
  FbdlApiConfigError,
  FbdlApiError,
  fetchFbdlReference,
  getFbdlRun,
  listFbdlRuns,
} from "../api.js";

function mockFetch(body: unknown, init: { readonly ok?: boolean; readonly status?: number } = {}) {
  return vi.fn<typeof fetch>(() => {
    const responseBody = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(
      new Response(responseBody, { status: init.status ?? (init.ok === false ? 400 : 200) }),
    );
  });
}

function getRequestInit(fetchImpl: ReturnType<typeof mockFetch>): RequestInit {
  const init = fetchImpl.mock.calls[0]?.[1];
  if (init === undefined || typeof init !== "object") {
    throw new Error("Expected fetch to be called with RequestInit.");
  }
  return init;
}

describe("FBDL API client", () => {
  it("creates runs with bearer auth and JSON body", async () => {
    const fetchImpl = mockFetch({ id: "1221570000000123" });

    const result = await createFbdlRun(
      { fbdlCode: "[setup] User UserOne", note: "Test run" },
      { env: { FBDL_API_TOKEN: "test-token" }, fetchImpl },
    );

    expect(result).toEqual({ id: "1221570000000123" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.facebook.com/bug_bounty/fbdl_runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ fbdl_code: "[setup] User UserOne", note: "Test run" }),
      }),
    );
    const headers = getRequestInit(fetchImpl).headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Authorization")).toBe("Bearer test-token");
    expect((headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("lists runs with cursor pagination params", async () => {
    const fetchImpl = mockFetch({ data: [], paging: { cursors: { after: "next" } } });

    await listFbdlRuns({ limit: 10, after: "cursor" }, { env: { FBDL_API_TOKEN: "t" }, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.facebook.com/bug_bounty/fbdl_runs?limit=10&after=cursor",
      expect.any(Object),
    );
  });

  it("fetches and archives runs by encoded id", async () => {
    const fetchImpl = mockFetch({ ok: true });

    await getFbdlRun("run/id", { env: { FBDL_API_TOKEN: "t" }, fetchImpl });
    await archiveFbdlRun("run/id", { env: { FBDL_API_TOKEN: "t" }, fetchImpl });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.facebook.com/bug_bounty/fbdl_runs/run%2Fid",
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.facebook.com/bug_bounty/fbdl_runs/run%2Fid/archive",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fetches the FBDL reference spec", async () => {
    const fetchImpl = mockFetch({ hints: { setup: [], action: [] } });

    const ref = await fetchFbdlReference({ env: { FBDL_API_TOKEN: "t" }, fetchImpl });

    expect(ref).toEqual({ hints: { setup: [], action: [] } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.facebook.com/bug_bounty/fbdl_reference/",
      expect.any(Object),
    );
  });

  it("requires FBDL_API_TOKEN", async () => {
    await expect(
      createFbdlRun({ fbdlCode: "[setup] User UserOne", note: "x" }, { env: {} }),
    ).rejects.toThrow(FbdlApiConfigError);
  });

  it("surfaces RFC 7807 style API errors without exposing the token", async () => {
    const fetchImpl = mockFetch(
      { type: "about:blank", title: "Invalid request" },
      { ok: false, status: 400 },
    );

    await expect(
      listFbdlRuns({}, { env: { FBDL_API_TOKEN: "secret-token" }, fetchImpl }),
    ).rejects.toMatchObject({
      name: "FbdlApiError",
      status: 400,
      body: JSON.stringify({ type: "about:blank", title: "Invalid request" }),
    } satisfies Partial<FbdlApiError>);
  });
});
