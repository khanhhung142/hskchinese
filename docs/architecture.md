# Architecture

How hskchinese works inside, for whoever changes the code or the data pipeline.
For setup and commands, see the [README](../README.md).

## Principles

- **Data in, exercises out.** The repo stores only words and example sentences.
  Every exercise is generated at runtime from them, so adding a lesson never touches code.
- **No build, no backend, no dependencies.** The browser loads ES modules directly from GitHub Pages.
  The same modules run in Node for tests and tooling.
- **The data file is the contract with Hermes.** Hermes edits only `data/vocab.json`; validation in `tools/check.mjs` is what keeps an LLM's output safe to ship.

## Files

| Path | Role |
| --- | --- |
| `index.html`, `css/app.css`, `manifest.webmanifest`, `icon*` | App shell and PWA metadata |
| `js/app.js` | UI: views, event handling, audio, progress storage |
| `js/quiz.js` | Pure functions: token parsing, sentence pinyin, session building, progress recording |
| `js/pinyin.js` | Tone numbers to tone marks (`ni3` to `nǐ`) and answer normalization |
| `data/vocab.json` | Lessons, words, sentences |
| `audio/` | One mp3 per word and per sentence, named by its Chinese text; `audio/en/` one per word and sentence `en` |
| `full/index.html` | Copy of `index.html` with `<base href="../">`; serves `/full/`, where the home screen also shows the old quizzes |
| `tools/check.mjs` | Format, validate, sync audio |
| `tools/publish.sh` | Check, commit, push; what Hermes runs |
| `hermes/hsk-vocab/SKILL.md` | Instructions Hermes follows; also the data format reference |
| `test/core.test.mjs` | Unit tests (`node --test`) |

## Data model

`data/vocab.json` has three arrays.
The full field reference and authoring rules live in [hermes/hsk-vocab/SKILL.md](../hermes/hsk-vocab/SKILL.md); this section covers what the code relies on.

- **Lesson** `{id, date, title}`.
  `id` is an integer; the highest `id` is the "latest lesson" the home screen offers.
  Lesson `0` ("Từ cơ bản") holds basic glue words (pronouns, 是, 不, 吗...) that sentences need but no class taught; it has no date and needs no example sentences.
- **Word** `{hanzi, pinyin[], meanings[], en, lesson}`.
  `hanzi` is the key everywhere: progress, audio file names, sentence tokens.
  `pinyin[0]` is the main reading.
- **Sentence** `{id, tokens[], vi, en, focus, sense, lesson}`.
  `tokens` is the sentence split into words that all exist in `words`, plus punctuation tokens.
  A token may carry an explicit reading for polyphones: `"还|huán"`.
  `focus` is the word the sentence practises and `sense` indexes into that word's `meanings`.

Because every token is a known word, the app can show pinyin for any sentence (`sentencePinyin`) and the learner never meets a word they have not studied.

## Validation (`tools/check.mjs`)

`validate()` returns a list of human-readable errors; the messages are written for Hermes to act on.
It checks:

- unique lesson ids, dated lessons (except lesson 0);
- each word: Han characters only, no duplicates, existing lesson, non-empty `meanings` and `en`, pinyin with tone marks;
- each pinyin reading exists in CC-CEDICT, either for the whole word, as an `also pr.` variant, or as a combination of per-character readings (covers compounds CC-CEDICT lacks);
- each sentence: unique id and text, `vi` and `en` present, every token a known word, token readings among the word's readings, `focus` appears in the sentence, `sense` in range;
- every word outside lesson 0 is the focus of at least 3 sentences (`SENTENCES_PER_WORD`).

`format()` writes one record per line so git diffs show exactly which words and sentences changed.

## Audio

`syncAudio()` wants one file per word `hanzi` and per sentence text, at `audio/<text>.mp3`, and one per word and sentence `en` at `audio/en/<en>.mp3` (voice `en-US-AriaNeural`; validation forbids `/` in `en` for this reason).
It generates missing files with edge-tts (voice `zh-CN-XiaoxiaoNeural`, rate -10%, 4 in parallel) and deletes files no word or sentence refers to.
Override the binary with `EDGE_TTS=/path/to/edge-tts`.

In the app, `say(text, next)` plays `audio/<encoded text>.mp3` and falls back to the browser's `speechSynthesis` (`zh-CN`, rate 0.85) if the file fails to load or play; `sayEn` does the same for `audio/en/`.
All playback goes through one reused `Audio` element, so `sayWord` can chain Chinese then English from the `ended` event, which iOS allows without a fresh tap.

## Study session (`buildSession` in `js/quiz.js`)

1. **Pool.** Mode `latest` takes words of the highest lesson id; mode `all` takes every word.
2. **Pick up to 5 words**, sorted by `weight(stat) * random`.
   Unseen words weigh 3; seen words weigh `1 + 3 * wrong / (right + wrong)`, so a word always missed weighs 4 and one always right weighs 1.
3. **Flashcards** for picked words with no recorded answers, shown first.
   Flashcard grades are recorded in progress but do not count in the end-of-session score.
4. **One exercise per picked word.** Types are dealt from a shuffled deck of `listen, pinyin, cloze, order, meaning`, refilled when no remaining type fits, so a session covers every type instead of clumping.
   `listen` and `pinyin` fit any word; `cloze` and `meaning` need a sentence with that word; `order` needs one with at least 3 non-punctuation tokens.
   Sentences come from the word's focus sentences, else any sentence containing it.
5. Flashcards are shuffled among themselves, then exercises.

| Type | Shows | Answer |
| --- | --- | --- |
| `listen` | Plays the word | Pick its hanzi from 4 |
| `pinyin` | The hanzi | Type pinyin; marks, tone numbers, `v` for `ü` and spaces all accepted via `normalize()`, any listed reading is right |
| `cloze` | Sentence with the word blanked, plus translation | Pick the word from 4 |
| `order` | Translation and shuffled tokens | Tap tokens into the original order (only the source order counts) |
| `meaning` | Chinese sentence, played aloud | Pick its translation from 4 |

Chinese text is always rendered with the pinyin of each word underneath (`hz`/`sentenceHz` in `js/app.js`, reading from `tokenPinyin`), including flashcard fronts, options, order chips and the feedback sheet.
The one exception is the `pinyin` exercise, where it would give the answer away.

## Items added in the app

`addView` in `js/app.js` stores words, sentences and new lessons in `localStorage["hsk-custom"]`; `mergeData()` appends them to `vocab.json` at boot (a `vocab.json` word wins over a custom duplicate).
Sentences are cut by `tokenize` (`js/quiz.js`): longest known word first, unknown runs via `Intl.Segmenter`, and unknown tokens carry their reading (`北京|běijīng`), so the exercise code needs no change.
Custom sentences use the lesson's word as `focus` if present, else the longest known word. No audio file exists for them, so playback falls back to speech synthesis.
Lesson moves from the word list live in `localStorage["hsk-moves"]` (`{w: {hanzi: lesson}, s: {sentenceId: lesson}}`) and are applied by `mergeData()` on top of both sources; `latestLesson` is therefore the highest lesson that still has words.
The lesson picker (`localStorage["hsk-lesson"]`) filters the typing practice pools and passes `lesson` to `buildSession`.

## Progress

`progress` is `{ [hanzi]: { r, w } }` (right and wrong counts), saved to `localStorage["hsk-progress"]` after every answer.
There is no sync between devices and no server.
"Đã thuộc" on the home screen counts words with at least one right answer.

## UI

`js/app.js` keeps a single `view` object (`home`, `words`, `quiz`, `summary`, `write`) and re-renders the whole `#app` element from template strings on every change.
`write` is the typing practice, in mode `write` (word shown), `vocab` (only the meaning shown) or `sentence` (a whole sentence shown): a random word from lessons 1 and up or a random sentence, checked with `sameHanzi` (`js/quiz.js`), with no effect on `progress`.
`FULL` (path ends in `/full/`) decides whether the home screen shows the old quizzes; `test/core.test.mjs` keeps `full/index.html` in sync with `index.html`.
Its handwriting pad (`setupHand`) posts strokes to the unofficial Google Input Tools handwriting endpoint (`inputtools.google.com`, no key, CORS open); it is the app's only call to a third-party service.
One delegated `click` listener dispatches on `data-action`, `data-pick` and `data-say` attributes; one `submit` listener handles the pinyin form.
All data goes through `esc()` before it reaches HTML.

## Hermes pipeline

Hermes is a Telegram bot on a Raspberry Pi with a clone of this repo at `~/hskchinese` and push access through a deploy key.
Its skill directory symlinks to `hermes/hsk-vocab/`, so updating the skill is a `git pull` on the Pi.
For each batch of photos it pulls, edits `data/vocab.json`, and runs `tools/publish.sh` until it prints `Published`.
If something outside `vocab.json` breaks, the skill tells Hermes to report it instead of editing code.

## Tests

`npm test` covers pinyin conversion and normalization, validation (including the mistakes an LLM tends to make), canonical formatting of the real data file, sentence pinyin, and session building.
Validation tests use a small inline dictionary, so they need no network.
