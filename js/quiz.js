// Data helpers and exercise generation. Pure functions, shared with tools/ and tests.

export const isPunct = (t) => /^[\p{P}\s]+$/u.test(t);

/** Sentence token "还" or "还|huán" (explicit reading for polyphones). */
export function parseToken(t) {
  const [h, p = null] = t.split('|');
  return { h, p };
}

export const sentenceText = (s) => s.tokens.map((t) => parseToken(t).h).join('');

const ASCII_PUNCT = { '，': ',', '。': '.', '？': '?', '！': '!', '：': ':', '；': ';', '、': ',' };

export function sentencePinyin(s, wordMap) {
  let out = '';
  for (const t of s.tokens) {
    const { h, p } = parseToken(t);
    if (isPunct(h)) out += [...h].map((c) => ASCII_PUNCT[c] ?? c).join('');
    else out += (out ? ' ' : '') + (p ?? wordMap.get(h)?.pinyin[0] ?? h);
  }
  return out;
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pickN = (arr, n, rand) => shuffle(arr, rand).slice(0, n);
const pickOne = (arr, rand) => arr[Math.floor(rand() * arr.length)];

export function latestLesson(data) {
  return Math.max(0, ...data.lessons.map((l) => l.id));
}

/** Weak words float up: never seen, or high miss ratio. */
function weight(stat) {
  if (!stat || stat.r + stat.w === 0) return 3;
  return 1 + (3 * stat.w) / (stat.r + stat.w);
}

/**
 * Build one study session.
 * mode: 'latest' = words of the newest lesson, 'all' = everything, weighted to weak words.
 * progress: { [hanzi]: { r, w } }
 */
export function buildSession(data, progress, mode, { rand = Math.random, size = 10 } = {}) {
  const latest = latestLesson(data);
  const pool = mode === 'latest' ? data.words.filter((w) => w.lesson === latest) : data.words;
  const chosen = pool
    .map((w) => ({ w, k: weight(progress[w.hanzi]) * rand() }))
    .sort((a, b) => b.k - a.k)
    .slice(0, size)
    .map((x) => x.w);

  const byFocus = new Map();
  for (const s of data.sentences) {
    if (!byFocus.has(s.focus)) byFocus.set(s.focus, []);
    byFocus.get(s.focus).push(s);
  }

  // New words: flashcards first, then every chosen word gets one exercise in the same session.
  const isNew = (w) => !progress[w.hanzi] || progress[w.hanzi].r + progress[w.hanzi].w === 0;
  const flashes = chosen.filter(isNew).map((word) => ({ type: 'flash', word }));
  const questions = chosen.map((word) => {
    const sents = byFocus.get(word.hanzi) ?? [];
    const kinds = ['listen', 'pinyin'];
    if (sents.length) kinds.push('cloze', 'meaning');
    const orderable = sents.filter((s) => s.tokens.filter((t) => !isPunct(t)).length >= 3);
    if (orderable.length) kinds.push('order');
    const type = pickOne(kinds, rand);
    return makeQuestion(type, word, type === 'order' ? orderable : sents, data, rand);
  });
  return [...shuffle(flashes, rand), ...shuffle(questions, rand)];
}

function makeQuestion(type, word, sents, data, rand) {
  const others = data.words.filter((w) => w.hanzi !== word.hanzi);
  const wordOptions = () => shuffle([word, ...pickN(others, 3, rand)], rand);
  if (type === 'pinyin') return { type, word };
  if (type === 'listen') return { type, word, options: wordOptions() };
  const sentence = pickOne(sents, rand);
  if (type === 'cloze') {
    const blank = sentence.tokens.findIndex((t) => parseToken(t).h === word.hanzi);
    return { type, word, sentence, blank, options: wordOptions() };
  }
  if (type === 'meaning') {
    const wrong = pickN(data.sentences.filter((s) => s.vi !== sentence.vi), 3, rand);
    return { type, word, sentence, options: shuffle([sentence, ...wrong], rand) };
  }
  // order: tokens without punctuation, shuffled so it never starts solved.
  const pieces = sentence.tokens.map((t) => parseToken(t).h).filter((h) => !isPunct(h));
  let shuffled = shuffle(pieces, rand);
  for (let i = 0; i < 10 && shuffled.join('') === pieces.join(''); i++) shuffled = shuffle(pieces, rand);
  return { type, word, sentence, answer: pieces, pieces: shuffled };
}

export function record(progress, hanzi, correct) {
  const s = (progress[hanzi] ??= { r: 0, w: 0 });
  correct ? s.r++ : s.w++;
  return progress;
}
