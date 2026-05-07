#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SETUP_ENTITIES, ACTIONS, getAction } from "./schema.js";
import { validate } from "./validator.js";

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
    const entities =
      type !== undefined ? SETUP_ENTITIES.filter((e) => e.type === type) : SETUP_ENTITIES;
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
    let actions = [...ACTIONS];

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
    const lines = script
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const explanations: string[] = [];

    for (const line of lines) {
      if (line.startsWith("[setup]")) {
        explanations.push(explainSetup(line));
      } else {
        explanations.push(explainAction(line));
      }
    }

    return {
      content: [{ type: "text" as const, text: explanations.join("\n\n") }],
    };
  },
);

function explainSetup(line: string): string {
  const content = line.slice("[setup]".length).trim();
  return `**Setup block**: Creates test entities — \`${content}\``;
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

// ── Resource: FBDL reference ────────────────────────────────────────────────

server.registerResource(
  "fbdl-reference",
  "fbdl://reference",
  { description: "Complete FBDL language reference" },
  () => {
    const entitySection = SETUP_ENTITIES.map((e) => {
      const params = e.params
        .map((p) => `  - ${p.name}${p.required ? "" : "?"}: ${p.description}`)
        .join("\n");
      return `### ${e.type}\n${e.description}\n${params}\nExample: ${e.example}`;
    }).join("\n\n");

    const actionSection = ACTIONS.map((a) => {
      const params = a.keywordParams
        .map((p) => `  - ${p.name}${p.required ? "" : "?"}: ${p.description}`)
        .join("\n");
      return `### ${a.name}\n${a.description}\nSignature: ${a.signature}\n${params}\nExamples: ${a.examples.join(" | ")}`;
    }).join("\n\n");

    return {
      contents: [
        {
          uri: "fbdl://reference",
          mimeType: "text/markdown",
          text: `# FBDL Reference\n\n## Setup Entities\n\n${entitySection}\n\n## Actions\n\n${actionSection}`,
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
The setup block creates test entities. Format:
\`[setup] Type Label [with {key: value, ...}] [Type Label ...]\`

Available entity types:
${SETUP_ENTITIES.map((e) => `- **${e.type}**: ${e.description} Params: ${e.params.map((p) => `${p.name}${p.required ? "" : "?"}${p.values !== undefined ? `(${p.values.join("|")})` : ""}`).join(", ") || "none"}`).join("\n")}

### Action Lines
Actions follow setup. Format:
\`Subject [as VoiceSwitcher] action_name Label [with {key: value, ...}]\`

Available actions:
${ACTIONS.map((a) => `- **${a.name}**: ${a.description} | Voice switcher: ${a.supportsVoiceSwitcher ? "yes" : "no"} | Params: ${a.keywordParams.map((p) => `${p.name}${p.required ? "" : "?"}${p.values !== undefined ? `(${p.values.join("|")})` : ""}`).join(", ") || "none"}`).join("\n")}

## Rules
1. All entities referenced in actions MUST be created in the setup block first.
2. Labels must be unique and descriptive (PascalCase).
3. Users must exist before being assigned roles.
4. Friendships must be established before friend-dependent actions.
5. Voice switcher (as) is only available for actions that support it.
6. The setup block is a SINGLE line starting with [setup].
7. Each action is on its own line.

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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
