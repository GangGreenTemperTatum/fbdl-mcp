#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAction, getActions, getSetupEntities, getSetupEntity } from "./spec.js";
import { loadSpec, logSpecLoadResult } from "./specLoader.js";
import { validate } from "./validator.js";
import { configureProxyFromEnv } from "./proxy.js";
import { tryAcquireCreateSlot } from "./runGuard.js";
import { archiveFbdlRun, createFbdlRun, getFbdlRun, listFbdlRuns } from "./api.js";

const server = new McpServer({
  name: "fbdl-mcp",
  version: "1.0.0",
});

// ── Tool: validate_fbdl ─────────────────────────────────────────────────────

server.registerTool(
  "validate_fbdl",
  {
    description:
      "Validate an FBDL script for structural correctness. Checks syntax, known entities/actions, required parameters, and enum values.",
    inputSchema: { script: z.string().describe("The FBDL script to validate.") },
  },
  ({ script }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(validate(script), null, 2) }],
  }),
);

// ── Tool: list_entities ─────────────────────────────────────────────────────

server.registerTool(
  "list_entities",
  {
    description: "List all available FBDL setup entity types with their parameters and examples.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe("Filter by entity type name (e.g. 'Page', 'Group'). Omit to list all."),
    },
  },
  ({ type }) => {
    const allEntities = getSetupEntities();
    const entities = type !== undefined ? allEntities.filter((e) => e.type === type) : allEntities;
    const text = entities
      .map((e) => {
        const params = e.params
          .map((p) => {
            const req = p.required ? "(required)" : "(optional)";
            const vals = p.values !== undefined ? ` [${p.values.join(" | ")}]` : "";
            const list = p.isList === true ? " (list)" : "";
            return `    ${p.name} ${req}${vals}${list}: ${p.description}`;
          })
          .join("\n");
        return `## ${e.type}\n${e.description}\nLabel: ${e.hasLabel ? "yes" : "no"}\n${params.length > 0 ? `Parameters:\n${params}` : "No parameters."}\nExample: ${e.example}`;
      })
      .join("\n\n");

    return { content: [{ type: "text" as const, text }] };
  },
);

// ── Tool: list_actions ──────────────────────────────────────────────────────

server.registerTool(
  "list_actions",
  {
    description: "List all available FBDL actions with their signatures, parameters, and examples.",
    inputSchema: {
      name: z
        .string()
        .optional()
        .describe("Filter by action name (e.g. 'make_post_text'). Omit to list all."),
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category keyword (e.g. 'post', 'group', 'page', 'business', 'event', 'app').",
        ),
    },
  },
  ({ name, category }) => {
    let actions = [...getActions()];

    if (name !== undefined) {
      const exact = getAction(name);
      actions = exact !== undefined ? [exact] : [];
    } else if (category !== undefined) {
      const lower = category.toLowerCase();
      actions = actions.filter(
        (a) => a.name.toLowerCase().includes(lower) || a.description.toLowerCase().includes(lower),
      );
    }

    const text = actions
      .map((a) => {
        const kw = a.keywordParams
          .map((p) => {
            const req = p.required ? "(required)" : "(optional)";
            const vals = p.values !== undefined ? ` [${p.values.join(" | ")}]` : "";
            const list = p.isList === true ? " (list)" : "";
            return `    ${p.name} ${req}${vals}${list}: ${p.description}`;
          })
          .join("\n");
        return `## ${a.name}\n${a.description}\nSignature: ${a.signature}\nVoice switcher: ${a.supportsVoiceSwitcher ? "yes" : "no"}\nTarget types: ${a.targetTypes.join(", ")}\n${kw.length > 0 ? `Keyword params:\n${kw}` : "No keyword params."}\nExamples:\n${a.examples.map((e) => `  ${e}`).join("\n")}`;
      })
      .join("\n\n");

    return {
      content: [
        { type: "text" as const, text: text.length > 0 ? text : "No matching actions found." },
      ],
    };
  },
);

// ── Tool: explain_fbdl ──────────────────────────────────────────────────────

server.registerTool(
  "explain_fbdl",
  {
    description:
      "Explain what an FBDL script does in plain English. Parses the script and describes each setup entity and action step by step.",
    inputSchema: { script: z.string().describe("The FBDL script to explain.") },
  },
  ({ script }) => {
    const explanations: string[] = [];
    let section: "setup" | "action" | null = null;

    for (const raw of script.split("\n")) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith("#")) continue;

      if (line.startsWith("[setup]")) {
        const inline = line.slice("[setup]".length).trim();
        if (inline.length > 0) {
          explanations.push(explainSetup(`[setup] ${inline}`));
          section = "action";
        } else {
          explanations.push("**Setup block**: creates the test entities listed below.");
          section = "setup";
        }
        continue;
      }

      if (line.startsWith("[action]")) {
        explanations.push("**Action block**: performs the operations listed below.");
        section = "action";
        continue;
      }

      explanations.push(section === "setup" ? explainEntity(line) : explainAction(line));
    }

    return {
      content: [{ type: "text" as const, text: explanations.join("\n\n") }],
    };
  },
);

// ── Tool: FBDL API run management ───────────────────────────────────────────

server.registerTool(
  "create_fbdl_run",
  {
    description:
      "Submit an FBDL script to the FBDL API for asynchronous execution. " +
      "Only one create_fbdl_run can be in flight at a time, and a cooldown blocks " +
      "further submissions for 30s after success / 60s after failure. " +
      "Requires FBDL_API_TOKEN.",
    inputSchema: {
      fbdl_code: z.string().describe("The FBDL script to execute."),
      note: z.string().describe("Required note describing this run."),
    },
  },
  async ({ fbdl_code, note }) => {
    const validation = validate(fbdl_code);
    if (!validation.valid) {
      // Validation never hit the API — no slot taken, no cooldown.
      return jsonToolResult({
        ok: false,
        error: "Validation failed. The run was not submitted.",
        validation,
      });
    }

    const slot = tryAcquireCreateSlot();
    if (!slot.ok) {
      return jsonToolResult({
        ok: false,
        error: slot.message,
        reason: slot.reason,
        ...(slot.cooldownRemainingMs !== undefined
          ? { cooldownRemainingMs: slot.cooldownRemainingMs }
          : {}),
      });
    }

    try {
      const result = await createFbdlRun({ fbdlCode: fbdl_code, note });
      slot.slot.release("success");
      return jsonToolResult({ ok: true, result });
    } catch (error) {
      slot.slot.release("failure");
      return jsonToolResult(withMaxRunsHint(apiErrorResponse(error)));
    }
  },
);

server.registerTool(
  "list_fbdl_runs",
  {
    description:
      "List FBDL API runs for the configured token, most recent first. Requires FBDL_API_TOKEN.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe("Page size. API default is 25."),
      after: z.string().optional().describe("Cursor returned in paging.cursors.after."),
    },
  },
  async ({ limit, after }) => {
    try {
      const input: { limit?: number; after?: string } = {};
      if (limit !== undefined) input.limit = limit;
      if (after !== undefined) input.after = after;
      return jsonToolResult({ ok: true, result: await listFbdlRuns(input) });
    } catch (error) {
      return jsonToolResult(apiErrorResponse(error));
    }
  },
);

server.registerTool(
  "get_fbdl_run",
  {
    description: "Fetch one FBDL API run by id. Requires FBDL_API_TOKEN.",
    inputSchema: { id: z.string().min(1).describe("FBDL run id.") },
  },
  async ({ id }) => {
    try {
      return jsonToolResult({ ok: true, result: await getFbdlRun(id) });
    } catch (error) {
      return jsonToolResult(apiErrorResponse(error));
    }
  },
);

server.registerTool(
  "archive_fbdl_run",
  {
    description: "Archive one FBDL API run by id. Requires FBDL_API_TOKEN.",
    inputSchema: { id: z.string().min(1).describe("FBDL run id.") },
  },
  async ({ id }) => {
    try {
      return jsonToolResult({ ok: true, result: await archiveFbdlRun(id) });
    } catch (error) {
      return jsonToolResult(apiErrorResponse(error));
    }
  },
);

function explainSetup(line: string): string {
  const content = line.slice("[setup]".length).trim();
  return `**Setup block**: Creates test entities — \`${content}\``;
}

function explainEntity(line: string): string {
  const tokens = line.split(/\s+/);
  const type = tokens[0] ?? "Entity";
  const label = tokens[1] !== undefined && tokens[1] !== "with" ? tokens[1] : undefined;
  const entity = getSetupEntity(type);
  const desc = entity !== undefined ? `: ${entity.description}` : "";
  const heading = label !== undefined ? `${type} ${label}` : type;
  return `**${heading}** — creates a ${type}${desc}\n  Full line: \`${line}\``;
}

function explainAction(line: string): string {
  const tokens = line.split(/\s+/);
  const subject = tokens[0] ?? "Unknown";

  let voiceAs: string | undefined;
  let actionIdx = 1;
  if (tokens[1] === "as") {
    voiceAs = tokens[2];
    actionIdx = 3;
  }

  const actionName = tokens[actionIdx] ?? "unknown";
  const action = getAction(actionName);
  const voice = voiceAs !== undefined ? ` (acting as ${voiceAs})` : "";

  if (action !== undefined) {
    return `**${subject}${voice}** performs **${actionName}**: ${action.description}\n  Full line: \`${line}\``;
  }
  return `**${subject}${voice}** performs **${actionName}**\n  Full line: \`${line}\``;
}

function jsonToolResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/**
 * If the error response looks like the FBDL API rejecting a new run because
 * the account has too many active runs, attach a `hint` field pointing the
 * caller at the cleanup workflow. Matches conservatively on a mention of
 * "run" plus any of {max, limit, quota, exceeded, too many} across the
 * error/title/detail/body fields.
 */
export function withMaxRunsHint(response: Record<string, unknown>): Record<string, unknown> {
  const haystackParts = ["error", "title", "detail", "body"]
    .map((k) => response[k])
    .filter((v): v is string => typeof v === "string");
  if (haystackParts.length === 0) return response;
  const haystack = haystackParts.join(" ").toLowerCase();
  if (!haystack.includes("run")) return response;
  const triggers = ["max", "limit", "quota", "exceeded", "too many"];
  if (!triggers.some((t) => haystack.includes(t))) return response;
  return {
    ...response,
    hint: "You appear to have hit the max active FBDL runs limit. Call list_fbdl_runs to see your active runs, then archive_fbdl_run on the ones you no longer need to free up slots before retrying.",
  };
}

export function apiErrorResponse(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { ok: false, error: "Unknown FBDL API error." };
  }

  const response: Record<string, unknown> = {
    ok: false,
    error: error.message,
    name: error.name,
  };

  if ("status" in error && typeof error.status === "number") {
    response.status = error.status;
  }

  if ("body" in error && typeof error.body === "string") {
    const parsed = tryParseJson(error.body);
    if (isJsonObject(parsed)) {
      response.details = parsed;
      if (typeof parsed.title === "string") response.title = parsed.title;
      if (typeof parsed.detail === "string") response.detail = parsed.detail;
      const summary = [response.title, response.detail]
        .filter((s): s is string => typeof s === "string")
        .join(": ");
      if (summary.length > 0) response.error = summary;
    } else {
      response.body = error.body;
    }
  }

  if ("cause" in error && error.cause !== undefined) {
    response.cause = serializeCause(error.cause);
  }

  return response;
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    const obj: Record<string, unknown> = {
      name: cause.name,
      message: cause.message,
    };
    const fields = ["code", "errno", "syscall", "hostname", "address", "port"] as const;
    const indexed = cause as unknown as Record<string, unknown>;
    for (const key of fields) {
      const value = indexed[key];
      if (value !== undefined) obj[key] = value;
    }
    if ("cause" in cause && cause.cause !== undefined) {
      obj.cause = serializeCause(cause.cause);
    }
    return obj;
  }
  if (isJsonObject(cause)) {
    return cause;
  }
  return String(cause);
}

function tryParseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Resource: FBDL reference ────────────────────────────────────────────────

function buildReference(): string {
  const entitySection = getSetupEntities()
    .map((e) => {
      const params = e.params
        .map((p) => `  - ${p.name}${p.required ? "" : "?"}: ${p.description}`)
        .join("\n");
      return `### ${e.type}\n${e.description}\n${params}\nExample: ${e.example}`;
    })
    .join("\n\n");

  const actionSection = getActions()
    .map((a) => {
      const params = a.keywordParams
        .map((p) => `  - ${p.name}${p.required ? "" : "?"}: ${p.description}`)
        .join("\n");
      return `### ${a.name}\n${a.description}\nSignature: ${a.signature}\n${params}\nExamples: ${a.examples.join(" | ")}`;
    })
    .join("\n\n");

  return `# FBDL Reference\n\n## Setup Entities\n\n${entitySection}\n\n## Actions\n\n${actionSection}`;
}

server.registerResource(
  "fbdl-reference",
  "fbdl://reference",
  {
    description:
      "Current FBDL language reference, built from the spec loaded from api.facebook.com at startup.",
  },
  () => {
    return {
      contents: [
        {
          uri: "fbdl://reference",
          mimeType: "text/markdown",
          text: buildReference(),
        },
      ],
    };
  },
);

// ── Prompt: generate_fbdl ───────────────────────────────────────────────────

server.registerPrompt(
  "generate_fbdl",
  {
    description:
      "Generate an FBDL script from a natural language description of the desired test scenario.",
    argsSchema: {
      description: z.string().describe("Natural language description of the test scenario."),
    },
  },
  ({ description }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are an expert in FBDL (Facebook Developer Language), a DSL used for Meta's bug bounty program to create reproducible test scenarios.

## FBDL Syntax

### Setup Block
The script starts with a \`[setup]\` header on its own line, followed by ONE entity
declaration per line. Format:
\`\`\`
[setup]
  Type Label [with {key: value, ...}]
  Type Label [with {key: value, ...}]
\`\`\`

Available entity types:
${getSetupEntities()
  .map(
    (e) =>
      `- **${e.type}**: ${e.description} Params: ${e.params.map((p) => `${p.name}${p.required ? "" : "?"}${p.values !== undefined ? `(${p.values.join("|")})` : ""}`).join(", ") || "none"}`,
  )
  .join("\n")}

### Action Lines
After the setup block, an \`[action]\` header on its own line is followed by ONE
action per line. Format:
\`\`\`
[action]
  Subject [as VoiceSwitcher] action_name Label [with {key: value, ...}]
\`\`\`

Available actions:
${getActions()
  .map(
    (a) =>
      `- **${a.name}**: ${a.description} | Voice switcher: ${a.supportsVoiceSwitcher ? "yes" : "no"} | Params: ${a.keywordParams.map((p) => `${p.name}${p.required ? "" : "?"}${p.values !== undefined ? `(${p.values.join("|")})` : ""}`).join(", ") || "none"}`,
  )
  .join("\n")}

## Rules
1. All entities referenced in actions MUST be created in the setup block first.
2. Labels must be unique and descriptive (PascalCase).
3. Users must exist before being assigned roles.
4. Friendships must be established before friend-dependent actions.
5. Voice switcher (as) is only available for actions that support it.
6. The script is two blocks: a \`[setup]\` header then an \`[action]\` header, each on its own line.
7. Put each entity declaration and each action on its own line (one per line).
8. A setup-only script (no actions) is valid — omit the [action] block entirely.

## Task
Generate a valid FBDL script for the following scenario:

${description}

Output ONLY the FBDL script, no explanations.`,
        },
      },
    ],
  }),
);

// ── Start ───────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  // Node's global fetch ignores HTTP(S)_PROXY; install a proxy dispatcher first
  // so both the startup spec load and the run API can reach api.facebook.com.
  const proxy = configureProxyFromEnv();
  if (proxy !== null) {
    process.stderr.write(`fbdl-mcp: routing HTTP through proxy ${proxy}\n`);
  }

  const result = await loadSpec();
  logSpecLoadResult(result);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined || entry.length === 0) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  void main();
}
