# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "rigging",
#     "typer",
# ]
# ///

import asyncio
import subprocess
import typing as t

import rigging as rg
import typer


TRUNCATION_WARNING = (
    "\n---\n**Note**: Due to the large size of this diff, some content has been truncated."
)


@rg.prompt
def generate_pr_description(diff: str) -> t.Annotated[str, rg.Ctx("markdown")]:  # type: ignore[empty-body]
    """
    Analyze the provided git diff and create a PR description in markdown format.

    <guidance>
    - Keep the summary concise and informative.
    - Use bullet points to structure important statements.
    - Focus on key modifications and potential impact, if any.
    - Do not add general advice or best-practice information.
    - Write like a developer who authored the changes.
    - Prefer flat bullet lists over nested.
    - Do not include a title.
    - If there are no changes, just provide "No relevant changes."
    - Order your bullet points by importance.
    </guidance>
    """


def get_diff(base_ref: str, source_ref: str, *, exclude: list[str] | None = None) -> str:
    merge_base = subprocess.run(
        ["git", "merge-base", source_ref, base_ref],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()

    diff_command = ["git", "diff", "--no-color", merge_base, source_ref]
    if exclude:
        diff_command.extend(["--", ".", *[f":(exclude){path}" for path in exclude]])

    return subprocess.run(
        diff_command,
        capture_output=True,
        text=True,
        check=True,
    ).stdout


def main(
    base_ref: str = "origin/main",
    source_ref: str = "HEAD",
    generator_id: str = "groq/openai/gpt-oss-120b",
    max_diff_lines: int = 1000,
    exclude: list[str] | None = None,
) -> None:
    diff = get_diff(base_ref, source_ref, exclude=exclude)
    diff_lines = diff.split("\n")
    if len(diff_lines) > max_diff_lines:
        diff = "\n".join(diff_lines[:max_diff_lines]) + TRUNCATION_WARNING

    description = asyncio.run(generate_pr_description.bind(generator_id)(diff))
    print(description)


if __name__ == "__main__":
    typer.run(main)
