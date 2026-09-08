#!/bin/sh
# Review the staged diff before calling this helper. Count both added and removed
# lines so a large rewrite cannot hide behind a small net change.
set -eu
changed=$(git diff --cached --numstat | awk '{if ($1 == "-") exit 1; n += $1 + $2} END {print n+0}')
if [ "$changed" -eq 0 ] || [ "$changed" -gt 100 ]; then
  echo "Commit refused: $changed changed lines (allowed: 1–100)." >&2
  exit 1
fi
git diff --cached --check
git commit -m "$1"
