---
name: use-fbdl-mcp
description: How to use the FBDL MCP server — tools, workflow, and the rules around submitting runs to the FBDL API.
---

# Using the FBDL MCP server

This skill is the operations manual for the `fbdl-mcp` server. It tells you which tool to call when, the rules the server enforces, and how to recover from common failures. For the FBDL **language** itself (entities, actions, grammar), use the `generate-fbdl` skill or the `fbdl://reference` resource.

## When this skill is relevant

Use it whenever the user wants to:

- Write or fix an FBDL script
- Submit a script to actually run it inside Meta's bug bounty platform
- See or manage previously-submitted runs
- Understand why a `create_fbdl_run` call was rejected

## Tools at a glance

Read-only tools — call freely:

- `list_entities` — browse the setup entity types the server's spec exposes (User, Page, Group, …). Filter with `type`.
- `list_actions` — browse FBDL actions with signatures and examples. Filter with `name` or `category` (e.g. `post`, `group`, `business`, `event`, `app`).
- `validate_fbdl` — parse a script and report structural errors before submission. Always call this before showing a script to the user, and **always** before `create_fbdl_run`.
- `explain_fbdl` — turn a script into a plain-English step-by-step.
- Resource `fbdl://reference` — the full spec, generated from whatever the server loaded at startup. Use as ground truth when `list_*` isn't enough.

Run-management tools — these hit Meta's API:

- `create_fbdl_run({fbdl_code, note})` — submit a validated script for execution. Read **the rules** below before calling.
- `list_fbdl_runs({?limit, ?after})` — most recent first. Use cursor pagination.
- `get_fbdl_run({id})` — fetch one run's status and results (created users, fbids, passwords, etc.). Polling pattern for async runs.
- `archive_fbdl_run({id})` — remove a run from your active list. Use when you hit the max-runs limit.

## Standard workflow

1. Understand what the user wants and identify the entities + actions needed.
2. (If unsure) call `list_entities` / `list_actions` to confirm names, params, and enum values.
3. Write the FBDL script — block grammar: `[setup]` header on its own line, one entity per line, then `[action]` header, one action per line. Lines starting with `#` are comments.
4. Call `validate_fbdl` and surface any errors. **Do not present an unvalidated script to the user.**
5. Only when the user explicitly asks to run it: call `create_fbdl_run`. Treat this as a side-effecting, real-world operation — it provisions actual whitehat test entities.
6. If polling for results, call `get_fbdl_run` until the run reaches a terminal state. Don't poll faster than every few seconds.
7. Hand back the created entities (uids, passwords, fbids) so the user can complete their test.

## Run-submission rules (the server enforces these)

The `create_fbdl_run` tool is gated by three rules. They protect both Meta's infrastructure and the researcher's run budget. The server returns a structured error explaining which rule fired — surface that to the user verbatim, don't silently retry.

1. **One run at a time.** Only one `create_fbdl_run` can be in flight per server process. A second call while one is running is rejected with `reason: "in_flight"`. **Do not parallelize** — chain submissions sequentially.

2. **Cooldown after every completed call.** Once a call finishes:
   - **30 seconds** after a successful submission
   - **60 seconds** after a failed one (longer to avoid hammering on errors)

   A further `create_fbdl_run` during the cooldown returns `reason: "cooldown"` with `cooldownRemainingMs`. Tell the user how long to wait — do **not** spin/poll/retry on your own.

   Validation failures (script is malformed and never reaches the API) do **not** trigger a cooldown; the user can fix and resubmit immediately.

3. **Max active runs.** Each account has a cap on concurrent active runs. If you hit it, the server attaches a `hint` field to the error pointing at the recovery path:
   - Call `list_fbdl_runs` to find old runs
   - Call `archive_fbdl_run` on each one the user is done with
   - Then retry `create_fbdl_run`

## Failure recovery cheatsheet

| Symptom | What to do |
|---|---|
| `validation.valid === false` from `validate_fbdl` | Fix the script and re-validate. Do not submit. |
| `reason: "in_flight"` on `create_fbdl_run` | Another submission is mid-flight. Wait for it to return before retrying. |
| `reason: "cooldown"` on `create_fbdl_run` | Tell the user the remaining time. Do not loop. |
| Response contains a `hint` field about archiving | The user is at the max-runs limit. Walk them through `list_fbdl_runs` → `archive_fbdl_run` → retry. |
| `name: "FbdlApiConfigError"` / message mentions `FBDL_API_TOKEN` | The MCP server has no token. Direct the user to put it in their shell rc file (see README) or in the MCP `env` block. |
| `cause.code: "ENETUNREACH"` / `ENOTFOUND` | Network problem from the server's host. If on Meta corp net, set `HTTPS_PROXY` and `NODE_USE_ENV_PROXY=1` in the MCP env. |

## Things not to do

- Don't call `create_fbdl_run` without `validate_fbdl` passing first.
- Don't call `create_fbdl_run` in a loop or in parallel — the mutex + cooldown will reject you and the run won't happen any faster.
- Don't paper over a rejection by silently retrying. The user needs to know why they were blocked.
- Don't archive runs the user hasn't seen results for — only archive what they're done with.
