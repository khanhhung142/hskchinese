# hskchinese

Personal Chinese vocab trainer for Vietnamese speakers.
It is a static PWA (vanilla JS, no build step, no backend) served by GitHub Pages at <https://khanhhung142.github.io/hskchinese/>.

New words arrive from class photos: Hung sends a photo of the lesson's word table to Hermes (a Telegram bot on a Raspberry Pi), Hermes writes the words and example sentences into `data/vocab.json` and pushes, and the app picks them up on next load.

```text
photo -> Telegram -> Hermes -> data/vocab.json -> tools/publish.sh -> git push -> GitHub Pages -> app
```

How the app and data pipeline work inside: [docs/architecture.md](docs/architecture.md).

## Using the app

Open the URL on a phone and add it to the home screen.
The UI is in Vietnamese; every word and sentence shows a Vietnamese and an English translation.

- **Học bài mới** studies the newest lesson.
  Words never seen before get a flashcard first, then every word in the session gets one exercise.
- **Ôn tất cả** reviews all words, favouring words you miss often.
- **Danh sách từ** lists every word by lesson; tap a row to see its example sentences, tap the speaker to hear it.

A session has up to 5 words.
Exercise types: listen and pick the hanzi, type the pinyin (tone numbers like `ni3` are fine), fill the blank, put words in order, pick the sentence meaning.
Every Chinese word is shown with its pinyin underneath, except in the type-the-pinyin exercise.

Progress is stored only in the browser's `localStorage` (key `hsk-progress`).
Clearing site data or switching devices starts from zero.

## Adding or fixing words

Normal path: send the photos to Hermes on Telegram.
To fix a word, message Hermes `sửa ...` with what is wrong.

Hermes follows [hermes/hsk-vocab/SKILL.md](hermes/hsk-vocab/SKILL.md), which is also the reference for the `data/vocab.json` format and the sentence rules.
To change how Hermes behaves, edit that file, push, and `git pull` in `~/hskchinese` on the Pi (the skill is symlinked from there).

To edit by hand instead, change `data/vocab.json`, then run `tools/publish.sh "commit message"` (see below), or `npm run check` and commit yourself.

## Development

Prerequisites: Node 22 or newer (tests use `node:test`; developed on Node 24), Python 3 for a local server, and [edge-tts](https://github.com/rany2/edge-tts) only if you need to generate audio.

```sh
npm test                          # unit tests, expect "pass 7" and "fail 0"
npm run check -- --no-audio       # format + validate data/vocab.json, skip audio
npm run check                     # same, then generate missing mp3s in audio/
python3 -m http.server            # serve the app at http://localhost:8000
```

There is no `npm install`: the project has no dependencies.
Icons load from the Phosphor CDN on unpkg, so the local app needs internet for icons.

`npm run check` does three things, in order:

1. Rewrites `data/vocab.json` in canonical form (one record per line, so diffs stay readable).
2. Validates it; on problems it prints `FAIL: <n> problem(s) in data/vocab.json` with one line per problem and exits 1.
   On success it prints `OK: <words> words, <sentences> sentences`.
3. Syncs `audio/`: generates one mp3 per word and per sentence that lacks one, and deletes mp3s nothing refers to.

The first run downloads the CC-CEDICT dictionary into `tools/.cache/` (git-ignored) to check pinyin.

### Publishing

`tools/publish.sh "message"` runs `node tools/check.mjs`, commits `data/vocab.json` and `audio/`, and pushes to `main`, retrying with `git pull --rebase` up to 3 times.
It prints `Published: <message>`, `Published (nothing changed)`, or exits non-zero on failure.
GitHub Pages serves `main` as is, so a push is a deploy.

The script prepends the Pi's install paths (`~/.local/node/bin`, `~/.local/share/edge-tts-venv/bin`) to `PATH`; elsewhere it uses whatever `node` and `edge-tts` are on `PATH`.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm run check` fails with `spawn edge-tts ENOENT` | edge-tts not installed | `pipx install edge-tts`, or set `EDGE_TTS=/path/to/edge-tts`, or pass `--no-audio` |
| `CC-CEDICT download failed` | No network on first run | Rerun with network; the file is cached afterwards |
| `pinyin "..." not in CC-CEDICT` | Typo in pinyin or hanzi | Fix the entry; the message lists the readings CC-CEDICT knows |
| `token "X" is not in the word list` | Sentence uses an unknown word | Split it into known words, or add the word (see SKILL.md rules) |
| `needs at least 3 sentences with focus "X"` | New word lacks example sentences | Add sentences with `"focus": "X"` |
| App shows "Không tải được dữ liệu" | `data/vocab.json` failed to load (offline, or opened via `file://`) | Serve over HTTP, check the network, tap "Thử lại" |
| A word plays robotic audio | Its mp3 is missing, so the browser's speech synthesis is used | Run `npm run check` and publish |
| New lesson does not show on the phone | Pages has not redeployed yet, or the browser cached the old page | Wait a minute and reload; data itself is fetched with `no-cache` |
