import process from "node:process";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface FbdlRunCreateInput {
  readonly fbdlCode: string;
  readonly note: string;
}

export interface FbdlRunListInput {
  readonly limit?: number;
  readonly after?: string;
}

export interface FbdlApiClientOptions {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
}

const API_ORIGIN = "https://api.facebook.com";

export class FbdlApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FbdlApiConfigError";
  }
}

export class FbdlApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`FBDL API request failed with HTTP ${status}.`);
    this.name = "FbdlApiError";
    this.status = status;
    this.body = body;
  }
}

export async function createFbdlRun(
  input: FbdlRunCreateInput,
  options: FbdlApiClientOptions = {},
): Promise<JsonValue> {
  return fbdlApiRequest(
    "/bug_bounty/fbdl_runs",
    {
      method: "POST",
      body: JSON.stringify({ fbdl_code: input.fbdlCode, note: input.note }),
    },
    options,
  );
}

export async function listFbdlRuns(
  input: FbdlRunListInput = {},
  options: FbdlApiClientOptions = {},
): Promise<JsonValue> {
  const params = new URLSearchParams();
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.after !== undefined) params.set("after", input.after);

  const query = params.toString();
  return fbdlApiRequest(`/bug_bounty/fbdl_runs${query.length > 0 ? `?${query}` : ""}`, {}, options);
}

export async function getFbdlRun(
  id: string,
  options: FbdlApiClientOptions = {},
): Promise<JsonValue> {
  return fbdlApiRequest(`/bug_bounty/fbdl_runs/${encodeURIComponent(id)}`, {}, options);
}

export async function archiveFbdlRun(
  id: string,
  options: FbdlApiClientOptions = {},
): Promise<JsonValue> {
  return fbdlApiRequest(
    `/bug_bounty/fbdl_runs/${encodeURIComponent(id)}/archive`,
    { method: "POST" },
    options,
  );
}

export async function fetchFbdlReference(options: FbdlApiClientOptions = {}): Promise<JsonValue> {
  return fbdlApiRequest("/bug_bounty/fbdl_reference/", {}, options);
}

async function fbdlApiRequest(
  path: string,
  init: RequestInit,
  options: FbdlApiClientOptions,
): Promise<JsonValue> {
  const env = options.env ?? process.env;
  const token = env.FBDL_API_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    throw new FbdlApiConfigError("Set FBDL_API_TOKEN to call the FBDL API.");
  }

  const url = buildApiUrl(path);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const response = await (options.fetchImpl ?? fetch)(url, {
    ...init,
    headers,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new FbdlApiError(response.status, body);
  }

  if (body.trim().length === 0) return null;
  return parseJsonBody(body);
}

function buildApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new FbdlApiConfigError("FBDL API paths must start with '/'.");
  }
  return `${API_ORIGIN}${path}`;
}

function parseJsonBody(body: string): JsonValue {
  const parsed = JSON.parse(body) as unknown;
  return toJsonValue(parsed);
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = toJsonValue(nested);
    }
    return output;
  }
  return null;
}
