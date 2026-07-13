import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { installFixtureSpec } from "./fixtures/loadFixtureSpec.js";
import { apiErrorResponse } from "../server.js";
import { FbdlApiError } from "../api.js";

let server: McpServer;
let client: Client;

beforeAll(async () => {
  installFixtureSpec();

  const { getAction, getActions, getSetupEntities } = await import("../spec.js");
  const { validate } = await import("../validator.js");
  const { z } = await import("zod");

  server = new McpServer({ name: "fbdl-mcp-test", version: "1.0.0" });

  server.registerTool(
    "validate_fbdl",
    {
      description: "Validate an FBDL script.",
      inputSchema: { script: z.string() },
    },
    ({ script }) => ({
      content: [{ type: "text" as const, text: JSON.stringify(validate(script), null, 2) }],
    }),
  );

  server.registerTool(
    "list_entities",
    {
      description: "List FBDL setup entity types.",
      inputSchema: { type: z.string().optional() },
    },
    ({ type }) => {
      const all = getSetupEntities();
      const entities = type !== undefined ? all.filter((e) => e.type === type) : all;
      const text = entities.map((e) => `## ${e.type}\n${e.description}`).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "list_actions",
    {
      description: "List FBDL actions.",
      inputSchema: { name: z.string().optional(), category: z.string().optional() },
    },
    ({ name, category }) => {
      let actions = [...getActions()];
      if (name !== undefined) {
        const exact = getAction(name);
        actions = exact !== undefined ? [exact] : [];
      } else if (category !== undefined) {
        const lower = category.toLowerCase();
        actions = actions.filter(
          (a) =>
            a.name.toLowerCase().includes(lower) || a.description.toLowerCase().includes(lower),
        );
      }
      const text = actions.map((a) => `## ${a.name}\n${a.description}`).join("\n\n");
      return {
        content: [
          { type: "text" as const, text: text.length > 0 ? text : "No matching actions found." },
        ],
      };
    },
  );

  server.registerTool(
    "explain_fbdl",
    {
      description: "Explain FBDL script.",
      inputSchema: { script: z.string() },
    },
    ({ script }) => {
      const lines = script
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return {
        content: [{ type: "text" as const, text: lines.map((l) => `Line: ${l}`).join("\n") }],
      };
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

// ── Tool: validate_fbdl ─────────────────────────────────────────────────────

describe("tool: validate_fbdl", () => {
  it("returns valid for correct script", async () => {
    const result = await client.callTool({
      name: "validate_fbdl",
      arguments: { script: "[setup]\n  User UserOne" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text) as {
      valid: boolean;
      errors: unknown[];
      definedLabels: string[];
    };
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.definedLabels).toContain("UserOne");
  });

  it("returns errors for invalid script", async () => {
    const result = await client.callTool({
      name: "validate_fbdl",
      arguments: { script: "[setup]\n  FakeEntity Foo" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text) as { valid: boolean; errors: Array<{ message: string }> };
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("validates a multi-line script end-to-end", async () => {
    const script = `[setup]
  User UserOne
  User UserTwo
  Friendship with {sender: UserOne, receivers: [UserTwo]}
[action]
  UserOne make_post_text PostOne with {place: UserOne, text: 'Hello'}
  UserTwo like_post PostOne`;
    const result = await client.callTool({
      name: "validate_fbdl",
      arguments: { script },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text) as { valid: boolean };
    expect(parsed.valid).toBe(true);
  });
});

// ── Tool: list_entities ─────────────────────────────────────────────────────

describe("tool: list_entities", () => {
  it("lists all entities when no filter", async () => {
    const result = await client.callTool({
      name: "list_entities",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("User");
    expect(text).toContain("Page");
    expect(text).toContain("Group");
    expect(text).toContain("Event");
  });

  it("filters by type", async () => {
    const result = await client.callTool({
      name: "list_entities",
      arguments: { type: "Page" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("Page");
    expect(text).not.toContain("## Group");
  });

  it("returns empty for unknown type", async () => {
    const result = await client.callTool({
      name: "list_entities",
      arguments: { type: "NonExistent" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toBe("");
  });
});

// ── Tool: list_actions ──────────────────────────────────────────────────────

describe("tool: list_actions", () => {
  it("lists all actions when no filter", async () => {
    const result = await client.callTool({
      name: "list_actions",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("make_post_text");
    expect(text).toContain("block");
    expect(text).toContain("like_post");
  });

  it("filters by exact name", async () => {
    const result = await client.callTool({
      name: "list_actions",
      arguments: { name: "make_post_text" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("make_post_text");
    expect(text).not.toContain("## block");
  });

  it("filters by category", async () => {
    const result = await client.callTool({
      name: "list_actions",
      arguments: { category: "post" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("make_post_text");
    expect(text).toContain("make_post_photo");
  });

  it("returns message for no matches", async () => {
    const result = await client.callTool({
      name: "list_actions",
      arguments: { name: "nonexistent_action" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toBe("No matching actions found.");
  });
});

// ── Tool: explain_fbdl ──────────────────────────────────────────────────────

describe("tool: explain_fbdl", () => {
  it("explains a simple script", async () => {
    const result = await client.callTool({
      name: "explain_fbdl",
      arguments: { script: "[setup] User UserOne\nUserOne like_post PostOne" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("[setup]");
    expect(text).toContain("like_post");
  });

  it("skips blank lines", async () => {
    const result = await client.callTool({
      name: "explain_fbdl",
      arguments: { script: "[setup] User UserOne\n\n\nUserOne like_post PostOne" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    // Should have exactly 2 lines of explanation
    expect(text.split("\n").filter((l) => l.startsWith("Line:")).length).toBe(2);
  });
});

// ── apiErrorResponse ────────────────────────────────────────────────────────

describe("apiErrorResponse", () => {
  it("surfaces RFC 7807 title, detail, and status from API error body", () => {
    const body = JSON.stringify({
      title: "Cannot create FBDL run",
      detail: "Failed to parse FBDL: bad setup statement.",
      status: 400,
    });
    const error = new FbdlApiError(400, body);

    const result = apiErrorResponse(error);

    expect(result.ok).toBe(false);
    expect(result.name).toBe("FbdlApiError");
    expect(result.status).toBe(400);
    expect(result.title).toBe("Cannot create FBDL run");
    expect(result.detail).toBe("Failed to parse FBDL: bad setup statement.");
    expect(result.error).toBe("Cannot create FBDL run: Failed to parse FBDL: bad setup statement.");
    expect(result.details).toEqual({
      title: "Cannot create FBDL run",
      detail: "Failed to parse FBDL: bad setup statement.",
      status: 400,
    });
  });

  it("falls back to raw body when the API body is not JSON", () => {
    const error = new FbdlApiError(500, "Internal Server Error");

    const result = apiErrorResponse(error);

    expect(result.status).toBe(500);
    expect(result.body).toBe("Internal Server Error");
    expect(result.title).toBeUndefined();
    expect(result.detail).toBeUndefined();
  });

  it("serializes the cause chain for transport-level fetch failures", () => {
    const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND api.facebook.com"), {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "api.facebook.com",
    });
    const fetchError = new TypeError("fetch failed", { cause: dnsError });

    const result = apiErrorResponse(fetchError);

    expect(result.ok).toBe(false);
    expect(result.name).toBe("TypeError");
    expect(result.error).toBe("fetch failed");
    expect(result.cause).toEqual({
      name: "Error",
      message: "getaddrinfo ENOTFOUND api.facebook.com",
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "api.facebook.com",
    });
  });

  it("returns a generic error for non-Error values", () => {
    const result = apiErrorResponse("oops");
    expect(result).toEqual({ ok: false, error: "Unknown FBDL API error." });
  });
});
