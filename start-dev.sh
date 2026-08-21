#!/usr/bin/env bash
#
# KeepIt dev launcher — starts both servers, each in its own Terminal window:
#   • Backend  (FastAPI/uvicorn)  →  Backend/     on http://localhost:8000
#   • Frontend (Expo)             →  KeepIt/       via `npx expo start -c`
#
# Usage:  ./start-dev.sh   (from anywhere; paths resolve relative to this file)
# Requires macOS Terminal.app (uses osascript to open new windows).

set -euo pipefail

# Absolute path to this script's directory (the repo root), so the script works
# no matter what the current working directory is.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/Backend"
FRONTEND_DIR="$ROOT/KeepIt"

# Fail early with a helpful message if the backend venv isn't set up yet.
if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]; then
  echo "Backend venv not found. Set it up first:" >&2
  echo "  cd '$BACKEND_DIR' && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

# The commands each Terminal window will run. Single-quote the paths so any
# spaces are handled safely.
BACKEND_CMD="cd '$BACKEND_DIR' && ./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
FRONTEND_CMD="cd '$FRONTEND_DIR' && npx expo start -c"

# Open a command in a brand-new Terminal window via AppleScript.
open_in_terminal() {
  osascript -e "tell application \"Terminal\" to do script \"$1\"" >/dev/null
}

open_in_terminal "$BACKEND_CMD"
open_in_terminal "$FRONTEND_CMD"

# Bring Terminal to the foreground so the new windows are visible.
osascript -e 'tell application "Terminal" to activate' >/dev/null

echo "✅ Launched backend + frontend in separate Terminal windows."
echo "   Backend:  http://localhost:8000  (docs at /docs)"
echo "   Frontend: Expo dev server (cache cleared with -c)"
