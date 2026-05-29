#!/bin/bash
set -euo pipefail

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  exit 0
fi

npx prettier --write "$@"
