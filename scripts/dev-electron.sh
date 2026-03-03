#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${DEV_HOST:-127.0.0.1}"
BASE_PORT="${DEV_PORT:-5174}"

release_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "${pids}" ]]; then
    return
  fi

  echo "[dev-electron] Releasing ${HOST}:${port} (PIDs: ${pids//$'\n'/, })"
  kill -CONT ${pids} 2>/dev/null || true
  kill -TERM ${pids} 2>/dev/null || true
  sleep 0.8

  if lsof -nP -tiTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[dev-electron] Force killing stuck process on ${HOST}:${port}"
    kill -KILL ${pids} 2>/dev/null || true
  fi
}

release_port "${BASE_PORT}"
release_port "$((BASE_PORT + 1))"
release_port "$((BASE_PORT + 2))"

exec node "${ROOT_DIR}/scripts/dev-electron.mjs"
