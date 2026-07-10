#!/usr/bin/env bash

set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname "$(dirname "$(realpath "$0")")")
else
	ROOT=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

cd "$ROOT"

# Upstream-style desktop dev entrypoint.
# Keep repository-specific orchestration in scripts/dev-desktop.ts:
# Vite, desktop TypeScript watch, Electron launch, and restart handling.
export NODE_ENV=development
export CONDUCTOR_DEV=1
export ELECTRON_ENABLE_STACK_DUMPING=1

exec npm run dev:desktop -- "$@"
