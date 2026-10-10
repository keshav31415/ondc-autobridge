#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  bundled_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ -x "$bundled_node/node" ]; then export PATH="$bundled_node:$PATH"; fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13+ is required. Install it, then run this script again."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Run pnpm install --frozen-lockfile once before starting the app."
  exit 1
fi
exec node node_modules/tsx/dist/cli.mjs scripts/dev.ts
