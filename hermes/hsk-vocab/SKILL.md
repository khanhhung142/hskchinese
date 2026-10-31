---
name: hsk-vocab
description: "Hung's Chinese vocab app: turn photos of a lesson's new words (生词) into vocab + example sentences, publish to the app; fix vocab on request ('sửa ...')."
version: 1.0.0
author: hung
platforms: [linux]
metadata:
  hermes:
    tags: [Chinese, Vocabulary, Learning, Hung]
---

# HSK vocab app

Hung learns Chinese. After each class he sends photos of the new-word table (hanzi, pinyin, Vietnamese meaning).
You turn them into data for his study app at <https://khanhhung142.github.io/hskchinese/> and publish.
The app builds every exercise itself from the data; your job is the words and the example sentences.

Repo: `~/hskchinese`. You edit exactly one file, `data/vocab.json`.
Code, tests, `audio/` and everything else are owned by the app; `tools/publish.sh` regenerates audio for you.
When something outside `vocab.json` looks broken (a failing test, a script error), leave the file as it is and report it to Hung in your reply.

## Steps for new photos

1. `cd ~/hskchinese && git pull --rebase`. Done when it reports up to date or fast-forwarded.
2. Read every word row from every photo, copying hanzi, pinyin (tone marks) and Vietnamese exactly as printed.
   Done when your list has as many rows as the photos show; say the count in your reply.
3. Add a lesson: next integer `id`, today's `date`, `title` from the photo heading if it has a lesson name, else `"Bài <id>"`.
4. Add each word (format below). A hanzi already in the file stays one entry: append any new meaning or reading to it and keep its old `lesson`.
5. Write 3 example sentences per new word, plus 5 review sentences whose `focus` is an older word.
   Every sentence uses only words already in `words` (rules below).
6. Run `tools/publish.sh "Bài <id>: <n> từ mới"`.
   It formats, validates, makes audio, commits and pushes. On `FAIL` it prints each problem; fix them in `vocab.json` and rerun until it prints `Published`.
7. Reply on Telegram (format below).

## Steps for a correction ("sửa ...")

`git pull --rebase`, edit the entry or sentence Hung named, run `tools/publish.sh "Sửa: <what>"` until `Published`, reply with the before and after.

## Data format

`data/vocab.json` holds three arrays, one record per line:

```json
{"id": 2, "date": "2026-11-03", "title": "Bài 2"}
{"hanzi": "想", "pinyin": ["xiǎng"], "meanings": ["nhớ", "muốn"], "en": "to miss; to want", "lesson": 2}
{"id": "2-07", "tokens": ["我", "想", "去", "中国", "。"], "vi": "Tôi muốn đi Trung Quốc.", "en": "I want to go to China.", "focus": "想", "sense": 1, "lesson": 2}
```

- **Word.** `pinyin`: tone marks, first entry is the main reading, extra readings after it (`["shéi", "shuí"]`).
  `meanings`: one string per distinct sense; synonyms of the same sense share a string (`"quá, lắm"`), different senses are separate strings (`"nhớ"`, `"muốn"`).
  `en`: a short English gloss (required).
- **Sentence.** `id`: `"<lesson>-<nn>"`, unique. `lesson`: the lesson being added.
  `tokens`: the sentence cut into word entries, in order, punctuation (full-width `，。？！`) as its own token.
  A multi-character word is one token (`"中国"`); a phrase the list lacks is several tokens (`"哪", "国", "人"`).
  For a polyphone read differently from its main reading, write `"还|huán"`.
  `focus`: the word the sentence practises. `sense`: index into that word's `meanings` the sentence uses.
  `vi` and `en`: natural Vietnamese and English translations.

## Sentence rules

- Hung must understand 100% of every sentence, so every token is a word in `words`.
- Short and natural, the kind of thing a textbook dialogue says. Spread across the senses of multi-sense words.
- Mix in older words so they get reviewed.
- When a sentence needs a word the list lacks, rewrite it with known words.
  Only basic glue words (pronouns, 是, 不, 的-type particles, 吗, 了) may be added as new entries with `"lesson": 0`.

## Telegram reply

Short, in Vietnamese:

```text
Đã thêm Bài 2: 12 từ mới
哪 nǎ nào · 谁 shéi ai · ...
Câu mẫu:
我想去中国。 Tôi muốn đi Trung Quốc. / I want to go to China.
你是哪国人？ Bạn là người nước nào? / Which country are you from?
App: https://khanhhung142.github.io/hskchinese/
```

If a photo row was unreadable, list it and ask; publish the rest.
