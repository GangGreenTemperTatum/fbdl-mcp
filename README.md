# fbdl-mcp

MCP server for Meta's FBDL (Facebook Developer Language). Lets AI agents generate, validate, and explore FBDL scripts used in Meta's bug bounty program (MMBRC).

No auth required -- FBDL is a text format. This server runs locally and never talks to Meta's infrastructure.

- [fbdl-mcp](#fbdl-mcp)
  - [What it does](#what-it-does)
  - [Install](#install)
  - [Setup with Claude Code](#setup-with-claude-code)
  - [Setup with OpenAI Codex / agents](#setup-with-openai-codex--agents)
    - [AGENTS.md snippet](#agentsmd-snippet)
  - [Example workflow](#example-workflow)
  - [FBDL quick reference](#fbdl-quick-reference)
    - [Setup block](#setup-block)
    - [Action lines](#action-lines)
    - [Rules](#rules)
  - [Development](#development)
  - [Project structure](#project-structure)

## What it does

- **validate_fbdl** -- Parse and validate FBDL scripts. Catches unknown entities/actions, missing required params, invalid enum values, bad syntax.
- **list_entities** -- Browse all setup entity types (User, Page, Group, Album, Friendship, Business, App, Event) with their params and examples.
- **list_actions** -- Browse all 70+ FBDL actions with signatures, params, and examples. Filter by name or category.
- **explain_fbdl** -- Turn an FBDL script into a plain-English step-by-step explanation.
- **generate_fbdl** (prompt) -- Prompt template that gives the calling LLM the full FBDL grammar so it can generate valid scripts from natural language.

## Install

```bash
git clone <repo-url> && cd fbdl-mcp
npm install
npm run build
```

Verify everything works:

```bash
npm run check   # typecheck + lint + format + tests
```

## Setup with Claude Code

Add to your Claude Code MCP config (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "fbdl": {
      "command": "node",
      "args": ["/absolute/path/to/fbdl-mcp/dist/server.js"]
    }
  }
}
```

Then in Claude Code you can say things like:

> "Generate an FBDL script where two users are friends, one owns a page, the other posts a photo and gets blocked"

> "Validate this FBDL script: [setup] User UserOne Page PageOne with {owner: UserOne}"

> "What FBDL actions are available for groups?"

## Setup with OpenAI Codex / agents

For Codex or any MCP-compatible agent, point it at the server binary:

```bash
node /absolute/path/to/fbdl-mcp/dist/server.js
```

The server communicates over stdio using the MCP protocol. It exposes:

- 4 tools: `validate_fbdl`, `list_entities`, `list_actions`, `explain_fbdl`
- 1 resource: `fbdl://reference` (full language spec as markdown)
- 1 prompt: `generate_fbdl` (NL-to-FBDL prompt template)

### AGENTS.md snippet

If your agent framework uses `AGENTS.md` for tool discovery, add:

```markdown
## FBDL MCP Server

Tools for working with Meta's FBDL (Facebook Developer Language) scripts:

- Use `validate_fbdl` after generating a script to check it for errors
- Use `list_entities` and `list_actions` to discover available FBDL constructs
- Use `explain_fbdl` to understand what an existing script does
- Use the `generate_fbdl` prompt to produce scripts from natural language

The server runs on stdio. Start with: `node /path/to/fbdl-mcp/dist/server.js`
```

## Example workflow

1. Agent receives: "Create a test scenario where a page admin blocks a group member"

2. Agent calls `list_entities` to check what setup is needed

3. Agent calls `list_actions` with `category: "block"` to find the right action

4. Agent uses the `generate_fbdl` prompt to produce:

```
[setup] User OwnerOne User MemberOne Page PageOne with {owner: OwnerOne} Group GroupOne with {owner: OwnerOne, privacy: private, members: [MemberOne]}
OwnerOne as PageOne block MemberOne
```

5. Agent calls `validate_fbdl` to verify the script is correct

6. Researcher pastes the script into Meta's MMBRC platform

## FBDL quick reference

### Setup block

```
[setup] Type Label [with {key: value, ...}] [Type Label ...]
```

Entity types: User, Page, Group, Album, Friendship, Business, App, Event

### Action lines

```
Subject [as VoiceSwitcher] action_name Label [with {key: value, ...}]
```

Voice switcher (`as`) lets a user act as a page they own.

### Rules

- All entities must be created in setup before use in actions
- The setup block is a single line starting with `[setup]`
- Each action goes on its own line
- Labels are PascalCase and must be unique

## Development

```bash
npm run build         # compile TypeScript
npm run test          # run tests
npm run lint          # eslint with strict TypeScript rules
npm run format        # prettier
npm run check         # all of the above
```

## Project structure

```
src/
  schema.ts           # FBDL language spec as typed data (entities + actions)
  validator.ts        # FBDL script parser and validator
  server.ts           # MCP server (tools, resources, prompts)
  __tests__/
    schema.test.ts    # Schema integrity tests
    validator.test.ts # Validator correctness tests
    server.test.ts    # MCP tool integration tests
```