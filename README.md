# fbdl-mcp

An MCP server for Meta's FBDL (Facebook Developer Language) — the DSL bug bounty researchers use to spin up reproducible test scenarios (whitehat users, pages, groups, posts, …) inside Meta's MMBRC platform.

The server lets AI agents:

- **Generate** FBDL scripts from natural language
- **Validate** scripts against the current language spec
- **Explain** what a script does in plain English
- **Run** validated scripts against the FBDL API and fetch the results (created users, fbids, passwords, …)

The language spec is pulled live from `https://api.facebook.com/bug_bounty/fbdl_reference/` at startup, so the server always reflects the current grammar (with an on-disk cache fallback for offline use).

---

- [What it exposes](#what-it-exposes)
- [Install](#install)
- [Configure the FBDL_API_TOKEN](#configure-the-fbdl_api_token)
- [Setup with Claude Code](#setup-with-claude-code)
- [Setup with OpenAI Codex / other MCP clients](#setup-with-openai-codex--other-mcp-clients)
- [Rules the server enforces on runs](#rules-the-server-enforces-on-runs)
- [Behind an HTTP proxy](#behind-an-http-proxy)
- [Standalone Claude Code skills (no MCP server)](#standalone-claude-code-skills-no-mcp-server)
- [Example workflow](#example-workflow)
- [FBDL quick reference](#fbdl-quick-reference)
- [Development](#development)
- [Project structure](#project-structure)

## What it exposes

**Tools** (read-only, no API calls):

- **`validate_fbdl`** — parse a script and report unknown entities/actions, missing required params, invalid enum values, and block-grammar errors. Always call this before showing a script to the user.
- **`list_entities`** — browse the loaded setup entity types and their params.
- **`list_actions`** — browse the loaded actions, filtered by `name` or `category` (e.g. `post`, `group`, `event`, `business`).
- **`explain_fbdl`** — turn a script into a plain-English step-by-step.

**Tools** (API-backed, require `FBDL_API_TOKEN`):

- **`create_fbdl_run`** — submit a validated script to the FBDL API. Gated by the [run rules](#rules-the-server-enforces-on-runs) below.
- **`list_fbdl_runs`** — list runs, most recent first, with cursor pagination (`limit`, `after`).
- **`get_fbdl_run`** — fetch one run's status and results.
- **`archive_fbdl_run`** — archive a run (use this to free slots when you hit the max-runs limit).

**Resource:**

- **`fbdl://reference`** — the current FBDL language reference, built from the spec the server loaded at startup.

**Prompt:**

- **`generate_fbdl`** — prompt template that gives the calling LLM the full FBDL grammar so it can generate valid scripts from a natural-language description.

## Install

```bash
git clone <repo-url> && cd fbdl-mcp
npm install
npm run build
```

Sanity check:

```bash
npm run check   # typecheck + lint + format + tests
```

## Configure the `FBDL_API_TOKEN`

The token is required for everything: the server fetches the language spec at startup, plus all run-management tools need it.

Generate one at **https://www.facebook.com/whitehat/fbdl/generate_api_token**.

You have two ways to give it to the server. Pick one:

### Option 1 — Put it in your shell rc (simpler, recommended)

Add this to `~/.bashrc`, `~/.zshrc`, or whichever shell rc your interactive shell loads:

```bash
export FBDL_API_TOKEN="<your-token>"
```

Open a new shell so it takes effect (or `source ~/.zshrc`). MCP clients launched from that shell inherit the env var — no per-client config needed.

> **Heads-up:** treat the token like a password. Don't commit shell rc files that contain it. If you ever paste the literal token into a config file the tool reads (e.g. `.mcp.json` checked into a repo), rotate it at the URL above.

### Option 2 — Per-client `env` block

If your shell doesn't export it (e.g. you launch Claude Code from a GUI launcher), put it in the MCP client config — see the snippets below.

## Setup with Claude Code

Add to `~/.claude/settings.json` (global) or `.claude/settings.json` (project):

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

If you went with **Option 2** for the token, add an `env` block:

```json
{
  "mcpServers": {
    "fbdl": {
      "command": "node",
      "args": ["/absolute/path/to/fbdl-mcp/dist/server.js"],
      "env": {
        "FBDL_API_TOKEN": "<your-token>"
      }
    }
  }
}
```

Then in Claude Code, things like these all work:

> "Generate an FBDL script where two users are friends, one owns a page, the other posts a photo and gets blocked."

> "Validate this FBDL script: …"

> "What FBDL actions are available for groups?"

> "Run this script as an FBDL run and tell me the resulting user IDs."

For the operational rules around running scripts, the repo also ships a `use-fbdl-mcp` skill that Claude Code will load automatically — see [Standalone Claude Code skills](#standalone-claude-code-skills-no-mcp-server).

## Setup with OpenAI Codex / other MCP clients

Point your client at the binary:

```bash
node /absolute/path/to/fbdl-mcp/dist/server.js
```

The server speaks MCP over stdio. Make sure `FBDL_API_TOKEN` is in the env of whatever process launches it (Option 1 covers most cases).

## Rules the server enforces on runs

`create_fbdl_run` is gated by three rules. The other API tools (`list`, `get`, `archive`) are not gated. The rules exist to protect the FBDL API and the researcher's run budget — the server returns a structured error explaining which rule fired, so agents should surface it to the user instead of retrying blindly.

1. **One run at a time.** Only one `create_fbdl_run` can be in flight per server process. A concurrent call is rejected with `reason: "in_flight"`.
2. **Cooldown after every completed call.**
   - **30 seconds** after a successful submission
   - **60 seconds** after a failed one (longer to avoid retry storms)

   During the cooldown, further calls return `reason: "cooldown"` with `cooldownRemainingMs`. Validation-only failures don't count — fix the script and resubmit immediately.

3. **Max active runs per account.** When the API rejects with a max-runs-style error, the server attaches a `hint` field guiding you to call `list_fbdl_runs` then `archive_fbdl_run` on old runs before retrying.

These constants live in `src/runGuard.ts`.

## Behind an HTTP proxy

Node's global `fetch` doesn't honor `HTTP_PROXY` / `HTTPS_PROXY` on its own. This server installs an `EnvHttpProxyAgent` automatically when either variable is set, so on a corp egress proxy you just need:

```bash
export HTTPS_PROXY="http://localhost:10054"
export HTTP_PROXY="http://localhost:10054"
```

(or include them in the MCP `env` block). No-op when no proxy is configured.

## Standalone Claude Code skills (no MCP server)

The repo ships three Claude Code skills under `.claude/skills/`. Copy them into any project:

```bash
cp -r /path/to/fbdl-mcp/.claude/skills/ your-project/.claude/skills/
```

- **`/generate-fbdl`** — generate scripts from natural language. Embeds the grammar in the prompt, so it works without the MCP server.
- **`/validate-fbdl`** — validate scripts against the grammar with a structural checklist.
- **`/use-fbdl-mcp`** — operations manual for this MCP server: which tool to call when, the run rules, recovery from common failures. Useful even with the server installed.

## Example workflow

1. User: "Create a test where a page admin blocks a group member, then run it."
2. Agent calls `list_actions` with `category: "block"` to confirm the action signature.
3. Agent writes the script:

   ```
   [setup]
     User OwnerOne
     User MemberOne
     Page PageOne with {owner: OwnerOne}
     Group GroupOne with {owner: OwnerOne, privacy: private, members: [MemberOne]}
   [action]
     OwnerOne as PageOne block MemberOne
   ```

4. Agent calls `validate_fbdl` — expects `valid: true`.
5. Agent calls `create_fbdl_run` with the script and a `note`.
6. Agent polls `get_fbdl_run` with the returned id until the run finishes, then hands the user the resulting user IDs / passwords / fbids.
7. After 30 seconds the agent can submit the next run, if needed.

## FBDL quick reference

Block grammar — the single-line `[setup]` form is **not** valid:

```
[setup]
  Type Label [with {key: value, ...}]
  Type Label [with {key: value, ...}]
[action]
  Subject [as VoiceSwitcher] action_name Label [with {key: value, ...}]
  Subject [as VoiceSwitcher] action_name Label [with {key: value, ...}]
```

- `[setup]` and `[action]` headers each sit on their own line; entities/actions go on their own lines below.
- The `[action]` block is optional — a setup-only script is valid.
- Lines starting with `#` are comments.
- Entity types: User, Page, Group, Album, Friendship, Business, App, Event (call `list_entities` for the current set + params).
- Voice switcher (`as PageLabel`) lets a user act as a page they own — only on actions that support it (check `list_actions`).
- Labels are PascalCase and must be unique within a script.

## Development

```bash
npm run build         # compile TypeScript to dist/ (excludes tests)
npm run test          # vitest
npm run lint          # eslint with strict TypeScript rules
npm run format        # prettier
npm run typecheck     # tsc --noEmit (covers tests too)
npm run check         # all of the above
```

## Project structure

```
src/
  schema.ts                  # FBDL Param / SetupEntity / Action types
  spec.ts                    # Runtime spec singleton (entities + actions)
  specParser.ts              # API JSON → SetupEntity[]/Action[] converter
  specLoader.ts              # Loads the spec from the API with disk-cache fallback
  validator.ts               # FBDL script parser and validator (block grammar)
  runGuard.ts                # Mutex + cooldown gating create_fbdl_run
  proxy.ts                   # Wires Node's global fetch through HTTP(S)_PROXY
  api.ts                     # FBDL API client (reference + runs)
  server.ts                  # MCP server (tools, resource, prompt)
  __tests__/
    fixtures/
      fbdl_reference.json    # Committed snapshot of the API response
      loadFixtureSpec.ts     # Helper that installs the snapshot into the spec
    schema.test.ts
    specParser.test.ts
    specLoader.test.ts
    validator.test.ts
    server.test.ts
    runGuard.test.ts
    proxy.test.ts
    api.test.ts
.claude/skills/
  generate-fbdl.md           # Standalone: NL → FBDL with grammar embedded
  validate-fbdl.md           # Standalone: validation checklist
  use-fbdl-mcp.md            # Operations manual for the MCP server
```
