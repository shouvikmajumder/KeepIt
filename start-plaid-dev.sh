#!/usr/bin/env bash
# Run local web, API, and the durable Plaid discovery worker together.
set -euo pipefail
KEEPIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -x "$KEEPIT_ROOT/Backend/.venv/bin/uvicorn" ]]; then
  echo "Set up Backend/.venv and install Backend/requirements.txt first." >&2
  exit 1
fi
if [[ ! -f "$KEEPIT_ROOT/Web/node_modules/vite/bin/vite.js" ]]; then
  echo "Run npm ci in Web/ first." >&2
  exit 1
fi
api_pid=""
web_pid=""
worker_pid=""
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$api_pid" ]] || kill "$api_pid" 2>/dev/null || true
  [[ -z "$web_pid" ]] || kill "$web_pid" 2>/dev/null || true
  [[ -z "$worker_pid" ]] || kill "$worker_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
(cd "$KEEPIT_ROOT/Backend" && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log) &
api_pid=$!
(cd "$KEEPIT_ROOT/Web" && exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort) &
web_pid=$!
(cd "$KEEPIT_ROOT/Backend" && exec .venv/bin/python -m app.worker) &
worker_pid=$!
echo "KeepIt Plaid: http://localhost:5173 · API: http://localhost:8000 · worker running"
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null && kill -0 "$worker_pid" 2>/dev/null; do
  sleep 1
done
echo "A development process stopped; shutting down the others." >&2
exit 1
