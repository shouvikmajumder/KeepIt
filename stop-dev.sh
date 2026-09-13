#!/usr/bin/env bash
# Stop this checkout's development servers and workers, including their children.
set -euo pipefail

KEEPIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
dry_run=false
case "${1:-}" in
  --dry-run) dry_run=true ;;
  --help|-h)
    echo "Usage: $0 [--dry-run]"
    echo "Stop KeepIt's web server, API, and worker for this checkout."
    exit 0
    ;;
  "") ;;
  *) echo "Usage: $0 [--dry-run]" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [--dry-run]" >&2
  exit 2
fi

command -v lsof >/dev/null || { echo "This script requires lsof." >&2; exit 1; }
current_uid="$(id -u)"
processes="$(ps -axo pid=,ppid=,uid=,command=)"
selected=" "

# Match app entry points, then verify their working directory belongs to this
# checkout. Never select processes solely because they occupy a familiar port.
while read -r pid parent owner command; do
  [[ "$owner" == "$current_uid" && "$pid" != "$$" ]] || continue
  if [[ "$command" =~ (^|[[:space:]/])(start-dev|start-plaid-dev)\.sh([[:space:]]|$) ]] ||
     [[ "$command" =~ (^|[[:space:]/])(uvicorn|gunicorn)[[:space:]].*app\.main:app ]] ||
     [[ "$command" =~ [[:space:]]-m[[:space:]]+app\.worker([[:space:]]|$) ]] ||
     [[ "$command" =~ (^|[[:space:]/])vite(/bin/vite\.js)?([[:space:]]|$) ]]; then
    cwd=""
    cwd_info="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null || true)"
    while IFS= read -r field; do
      [[ "$field" != n* ]] || cwd="${field#n}"
    done <<< "$cwd_info"
    if [[ "$cwd" == "$KEEPIT_ROOT" || "$cwd" == "$KEEPIT_ROOT/"* ]]; then
      selected+="$pid "
    fi
  fi
done <<< "$processes"

# Reloaders and launchers can spawn children with different command names.
changed=true
while $changed; do
  changed=false
  while read -r pid parent owner command; do
    [[ "$owner" == "$current_uid" && "$pid" != "$$" ]] || continue
    if [[ "$selected" == *" $parent "* && "$selected" != *" $pid "* ]]; then
      selected+="$pid "
      changed=true
    fi
  done <<< "$processes"
done

if [[ "$selected" == " " ]]; then
  echo "No KeepIt development processes are running for this checkout."
  exit 0
fi
read -r -a pids <<< "$selected"
if $dry_run; then
  echo "Would stop KeepIt process IDs: ${pids[*]}"
  exit 0
fi

echo "Stopping KeepIt process IDs: ${pids[*]}"
kill -TERM "${pids[@]}" 2>/dev/null || true

running() {
  local state
  state="$(ps -p "$1" -o stat= 2>/dev/null || true)"
  [[ -n "$state" && "$state" != *Z* ]]
}

# Give the API and worker five seconds to shut down before forcing stragglers.
for attempt in 1 2 3 4 5; do
  remaining=false
  for pid in "${pids[@]}"; do
    if running "$pid"; then remaining=true; fi
  done
  if ! $remaining; then
    echo "KeepIt development processes stopped."
    exit 0
  fi
  sleep 1
done

for pid in "${pids[@]}"; do
  if running "$pid"; then
    echo "Force-stopping process $pid."
    kill -KILL "$pid" 2>/dev/null || true
  fi
done
sleep 1
for pid in "${pids[@]}"; do
  if running "$pid"; then
    echo "Could not stop process $pid." >&2
    exit 1
  fi
done
echo "KeepIt development processes stopped."
