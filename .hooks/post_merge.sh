#!/bin/bash
set -euo pipefail

old_hash="$(git show ORIG_HEAD:package-lock.json 2>/dev/null | shasum -a 256 || true)"
new_hash="$(shasum -a 256 package-lock.json 2>/dev/null || true)"

if [ "$old_hash" != "$new_hash" ]; then
  echo "package-lock.json changed. Running npm install..."
  npm install
else
  echo "No npm dependency changes."
fi
