---
name: use-fbdl-mcp
description: |
  How to use the FBDL MCP server — tool selection, submission
  workflow, and run-management rules for the live API.
---

# Using the FBDL MCP server

This skill is the operations manual for `fbdl-mcp`.

## When to use it

Use it whenever the user wants to:

- write or fix an FBDL script
- submit a script as a real FBDL run
- inspect or archive previous runs
- understand why `create_fbdl_run` was rejected

## Tools

Read-only:

- `list_entities`
- `list_actions`
- `validate_fbdl`
- `explain_fbdl`
- resource `fbdl://reference`

API-backed:

- `create_fbdl_run({fbdl_code, note})`
- `list_fbdl_runs({?limit, ?after})`
- `get_fbdl_run({id})`
- `archive_fbdl_run({id})`

## Standard workflow

1. Understand the scenario.
2. Use `list_entities` / `list_actions` if names or params are unclear.
3. Write the script with block grammar.
4. Call `validate_fbdl` before presenting or submitting it.
5. Only when the user explicitly wants a real run, call `create_fbdl_run`.
6. Poll with `get_fbdl_run` if results are needed.
7. Archive old runs when the user is done with them.

## Run-submission rules

`create_fbdl_run` is rate-limited by the server itself:

1. Only one `create_fbdl_run` can be in flight at a time.
2. After success there is a 30 second cooldown.
3. After failure there is a 60 second cooldown.
4. Validation failures do not trigger cooldown because they never hit the API.
5. If the account is at the max active-runs limit, the server may return a `hint` telling the caller to list and archive old runs first.

Do not silently retry or parallelize submissions.
