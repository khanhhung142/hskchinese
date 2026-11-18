#!/usr/bin/env bash
# Rebuild data/vocab.json from the textbook + workbook and data/english.json from data/toeic.json, validate it, regenerate audio, commit and push. Used by Hermes.
# Usage: tools/publish.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$HOME/.local/share/edge-tts-venv/bin:$PATH"
msg="${1:?usage: tools/publish.sh \"commit message\"}"

python3 tools/book_vocab.py
python3 tools/toeic_vocab.py
node tools/check.mjs
git add data/chinext.json data/vocab.json data/book_en.json data/radicals.json data/english.json data/toeic_en.json audio
if git diff --cached --quiet; then echo "Published (nothing changed)"; exit 0; fi
git commit -q -m "$msg"
for attempt in 1 2 3; do
  git push -q origin HEAD:main && { echo "Published: $msg"; exit 0; }
  git pull -q --rebase origin main
done
echo "FAIL: push rejected 3 times" >&2
exit 1
