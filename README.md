# hskchinese

Personal Chinese vocab trainer for Vietnamese speakers.
It is a static PWA (vanilla JS, no build step, no backend) served by GitHub Pages at <https://khanhhung142.github.io/hskchinese/>.

Practice data comes only from the books: `tools/book_vocab.py` rebuilds `data/vocab.json` from **Giáo trình** (`data/textbook.json`: each lesson's 生词/专有名词, dialogue lines, grammar examples) and **Bài tập** (`data/workbook.json` listening transcripts), filed by the book's lesson. English glosses live in `data/book_en.json`. When either book file changes, `tools/publish.sh` regenerates everything.

```text
textbook.json + workbook.json (+ book_en.json) -> tools/book_vocab.py -> data/vocab.json -> tools/check.mjs -> git push -> GitHub Pages -> app
```

How the app and data pipeline work inside: [docs/architecture.md](docs/architecture.md).

## Using the app

Open the URL on a phone and add it to the home screen.
The UI is in Vietnamese; every word and sentence shows a Vietnamese and an English translation.

The home screen's **Luyện tập** item opens the lesson picker plus Luyện viết chữ, Luyện viết câu, Luyện từ vựng and Luyện nghe; their back buttons return there.
The older quizzes (**Học bài mới**, **Ôn tất cả**) are hidden there and appear only at <https://khanhhung142.github.io/hskchinese/full/>.

- **Luyện viết chữ** is typing practice, separate from the quizzes and not counted in progress. Words/sentences already done in this session (tab still open) are not shown again, even after changing the lesson pick, until the rest of the pick is done (`sessionStorage['hsk-seen']`).
  It shows one random word (hanzi, pinyin, English, Vietnamese) and on open plays it in Chinese, then in English.
  Type the word with a Chinese keyboard; the answer must match the hanzi exactly (spaces and punctuation ignored).
  The pencil button opens a handwriting pad; strokes are recognized by Google Input Tools (needs network) and tapping a candidate appends it to the input.
- A correct **Kiểm tra** plays the answer and moves to the next item by itself; **Bỏ qua** skips at once.
- **Luyện nghe** reads every word, then every sentence, of the picked lessons one after another (Chinese, then English), with pause and previous/next. Reopening it mid-way offers Nghe tiếp (resume at the saved item, `hsk-listen`) or Nghe lại từ đầu. It keeps playing with the screen off and shows play/pause/previous/next on the lock screen (Media Session; gaps are a silent `silence.mp3`, since timers stall in the background).
- **Luyện viết câu** is the same, with a whole example sentence (pinyin, English, Vietnamese) instead of one word.
- **Đề TOEIC** (only on `/english/`): 10 ETS 2026 Listening + Reading tests, one block per question (Part 1 photos and Part 3–4 graphics cropped from the scan, questions, options and Part 6–7 passages as text with a "Nghĩa" Vietnamese toggle usable during the test), book audio cut per question (Part 1–2) or per set (Part 3–4, `toeic/tNN/q/<n>.mp3`) each with a Script toggle, answer key with translation and explanation after Nộp bài; rough /495 estimate) and 5 original Speaking + 5 Writing tests in ETS format (TTS prompts, mic recording kept on the device, sample answers, drafts saved in `eng-toeic-draft`). Data `data/toeic.json`, assets `toeic/`; latest scores in `eng-toeic`. Photos are openly licensed (credited under each).
- **Luyện từ vựng** is the same input, but shows only the English and Vietnamese meaning and plays the English.
  **Xem đáp án** reveals the hanzi and plays it.
- **Học bài mới** (`/full/` only) studies the newest lesson.
  Words never seen before get a flashcard first, then every word in the session gets one exercise.
- **Ôn tất cả** (`/full/` only) reviews all words, favouring words you miss often.
- **Giáo trình HSK1**: the 15 lessons of 新HSK教程1 (Vietnamese edition) — goals, dialogues (课文) with pinyin, Vietnamese and a speaker button per line, new words, grammar notes (小语讲堂) with examples, plus the appendix part-of-speech table and the searchable 319-entry vocabulary list. Each lesson has a done-sticker (`localStorage["hsk-tb-done"]`, device-only); it is not tappable — a lesson turns done when you tap **Đã học** at the bottom of the lesson or go to the next lesson, and the Tomie comment shows then. Data in `data/textbook.json`, edge-tts mp3s in `textbook/` (not managed by `check.mjs`).
- **Bài tập HSK1** (Chinese only): the 模拟测练 test of each lesson of the SBT HSK1 (3.0) workbook, plus the mock exam. 20 questions per lesson: listening (speaker button plays that question's clip of the book audio) and reading; **Nộp bài** grades it, marks the lesson done (sticker on the HSK1 list, not tappable) and saves the latest score shown under its title (`hsk-wb-done`/`hsk-wb-score`, device-only). Data in `data/workbook.json`, scans and audio in `workbook/`. Lessons without audio yet are greyed out. After submitting, each question gets a **Transcript & dịch** toggle (Chinese, pinyin, English, Vietnamese; source `tools/wb_tr/<id>.json`, merged by `tools/workbook.py`).
- **Bộ thủ** lists the Kangxi radicals (form, variants, Hán Việt name, meaning, pinyin, strokes, examples, memory tip) in two tabs: the 50 most common, or all 214. Data in `data/radicals.json`.
- In **Luyện viết chữ** / **Luyện từ vựng**, a collapsed **Bộ thủ & mẹo nhớ** box under the shown word splits each character into components and gives a memory story, Hán Việt reading and stroke hint (`radicals.json` → `chars`; a test asserts every vocab character has one). Most entries come from the [Kai Hanzi HSK × Sino-Vietnamese dataset](https://github.com/binhbuithithanh/hanzi-sino-vietnamese) (CC BY 4.0; attribution shown in the box); characters it lacks keep hand-written tips.
- **Tra cứu** has two tabs. **Tra cứu từ** lists every word by book lesson. **Tra cứu câu** lists every example sentence by lesson. The search box filters the open tab by hanzi, pinyin (tones and spaces optional: `nihao`), Vietnamese (accents optional) or English.
- **Học theo bài** (picker on the home screen) limits every practice mode and **Ôn** to the ticked lessons (one or several), or all lessons; saved as comma-separated ids in `localStorage` key `hsk-lesson`.

A session has up to 5 words.
Exercise types: listen and pick the hanzi, type the pinyin (tone numbers like `ni3` are fine), fill the blank, put words in order, pick the sentence meaning.
Every Chinese word is shown with its pinyin underneath, except in the type-the-pinyin exercise.

Progress is stored only in the browser's `localStorage` (key `hsk-progress`).
Clearing site data or switching devices starts from zero.

## English

[`/english/`](https://khanhhung142.github.io/hskchinese/english/) is the same app for English: same screens, same exercises, data from `data/english.json`.
Pinyin becomes IPA (optional), handwriting is off, and "type the pinyin" becomes "listen and type the word".
Progress, lesson pick, in-app additions and edits are kept apart (`eng-*` keys instead of `hsk-*`); exports are named `eng-export-*.json`.

## Adding or fixing words

Normal path: send the photos to Hermes on Telegram.
To fix a word, message Hermes `sửa ...` with what is wrong.

Hermes follows [hermes/hsk-vocab/SKILL.md](hermes/hsk-vocab/SKILL.md), which is also the reference for the `data/vocab.json` format and the sentence rules.
To change how Hermes behaves, edit that file, push, and `git pull` in `~/hskchinese` on the Pi (the skill is symlinked from there).

To edit by hand instead, change `data/vocab.json`, then run `tools/publish.sh "commit message"` (see below), or `npm run check` and commit yourself.

## Development

Prerequisites: Node 22 or newer (tests use `node:test`; developed on Node 24), Python 3 for a local server, and [edge-tts](https://github.com/rany2/edge-tts) only if you need to generate audio.

```sh
npm test                          # unit tests, expect "pass 11" and "fail 0"
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
3. Syncs `audio/`: generates one mp3 per word and per sentence that lacks one (plus one English mp3 per word gloss and sentence translation in `audio/en/`), and deletes mp3s nothing refers to.

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
