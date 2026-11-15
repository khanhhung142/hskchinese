#!/usr/bin/env bash
# Validate data/vocab.json, regenerate audio, commit and push. Used by Hermes.
# Usage: tools/publish.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$HOME/.local/share/edge-tts-venv/bin:$PATH"
msg="${1:?usage: tools/publish.sh \"commit message\"}"

node tools/check.mjs
git add data/vocab.json audio
if git diff --cached --quiet; then echo "Published (nothing changed)"; exit 0; fi
git commit -q -m "$msg"
for attempt in 1 2 3; do
  git push -q origin HEAD:main && { echo "Published: $msg"; exit 0; }
  git pull -q --rebase origin main
done
echo "FAIL: push rejected 3 times" >&2
exit 1
