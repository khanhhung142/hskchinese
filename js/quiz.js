// Data helpers and exercise generation. Pure functions, shared with tools/ and tests.

export const isPunct = (t) => /^[\p{P}\s]+$/u.test(t);

/** Sentence token "还" or "还|huán" (explicit reading for polyphones). */
export function parseToken(t) {
  const [h, p = null] = t.split('|');
  return { h, p };
}

/** English sentences keep their `text`; Chinese ones are their tokens joined. */
export const sentenceText = (s) => s.text ?? s.tokens.map((t) => parseToken(t).h).join('');

/**
 * Cut an English sentence into tokens: words, punctuation runs; known multi-word entries
 * ("thank you", lowercase in `known`) stay one token, longest first.
 */
export function enTokens(text, known = new Set()) {
  const raw = text.match(/[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}'’-]+/gu) ?? [];
  const out = [];
  for (let i = 0; i < raw.length;) {
    let n = Math.min(4, raw.length - i);
    while (n > 1 && !known.has(raw.slice(i, i + n).join(' ').toLowerCase())) n--;
    out.push(raw.slice(i, i + n).join(' '));
    i += n;
  }
  return out;
}
/** english.json ({word, ipa, meanings, lesson} / {id, text, vi, focus, lesson}) -> the shape the exercises use. */
export function fromEnglish(raw) {
  const multi = new Set(raw.words.map((w) => w.word.toLowerCase()).filter((w) => w.includes(' ')));
  return {
    lessons: raw.lessons,
    words: raw.words.map((w) => ({ hanzi: w.word, pinyin: w.ipa ? [w.ipa] : [], meanings: w.meanings, en: '', lesson: w.lesson })),
    sentences: raw.sentences.map((s) => ({ ...s, tokens: enTokens(s.text, multi), en: '', sense: 0 })),
  };
}
/** Token equals word, ignoring case (English "Hello" at sentence start). */
export const sameWord = (t, w) => parseToken(t).h.toLowerCase() === w.toLowerCase();

/** Pinyin shown under a token: its explicit reading, else the word's main reading. */
export function tokenPinyin(t, wordMap) {
  const { h, p } = parseToken(t);
  return p ?? wordMap.get(h)?.pinyin[0] ?? '';
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

const TYPES = ['listen', 'pinyin', 'cloze', 'order', 'meaning'];

/** Newest lesson that has words (a lesson can be emptied by moving its words elsewhere). */
export function latestLesson(data) {
  return Math.max(0, ...data.words.map((w) => w.lesson));
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
export function buildSession(data, progress, mode, { rand = Math.random, size = 5, lesson = null } = {}) {
  const latest = latestLesson(data);
  // `lesson` (id or array of ids) narrows mode 'all'; distractors still come from every word.
  const only = mode === 'latest' ? [latest] : lesson == null ? null : [].concat(lesson);
  const pool = only == null ? data.words : data.words.filter((w) => only.includes(w.lesson));
  const chosen = pool
    .map((w) => ({ w, k: weight(progress[w.hanzi]) * rand() }))
    .sort((a, b) => b.k - a.k)
    .slice(0, size)
    .map((x) => x.w);

  // Sentences that practise a word: its focus sentences, else any sentence using it.
  const focusOf = new Map();
  const usedIn = new Map();
  for (const s of data.sentences) {
    (focusOf.get(s.focus) ?? focusOf.set(s.focus, []).get(s.focus)).push(s);
    for (const h of new Set(s.tokens.map((t) => parseToken(t).h.toLowerCase()))) (usedIn.get(h) ?? usedIn.set(h, []).get(h)).push(s);
  }

  // New words: flashcards first, then every chosen word gets one exercise in the same session.
  const isNew = (w) => !progress[w.hanzi] || progress[w.hanzi].r + progress[w.hanzi].w === 0;
  const flashes = chosen.filter(isNew).map((word) => ({ type: 'flash', word }));
  // Deal exercise types from a shuffled deck so one session covers every type, not a random clump.
  let deck = [];
  const questions = chosen.map((word) => {
    const sents = focusOf.get(word.hanzi) ?? usedIn.get(word.hanzi.toLowerCase()) ?? [];
    const orderable = sents.filter((s) => s.tokens.filter((t) => !isPunct(t)).length >= 3);
    const fits = (type) => ['listen', 'pinyin'].includes(type) || (type === 'order' ? orderable.length : sents.length);
    if (!deck.some(fits)) deck = [...deck, ...shuffle(TYPES, rand)];
    const type = deck.splice(deck.findIndex(fits), 1)[0];
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
    const blank = sentence.tokens.findIndex((t) => sameWord(t, word.hanzi));
    return { type, word, sentence, blank, options: wordOptions() };
  }
  if (type === 'meaning') {
    const wrong = pickN(data.sentences.filter((s) => s.vi !== sentence.vi), 3, rand);
    return { type, word, sentence, options: shuffle([sentence, ...wrong], rand) };
  }
  // order: tokens (readings kept for display) without punctuation, shuffled so it never starts solved.
  const pieces = sentence.tokens.filter((t) => !isPunct(parseToken(t).h));
  const text = (ts) => ts.map((t) => parseToken(t).h).join('');
  let shuffled = shuffle(pieces, rand);
  for (let i = 0; i < 10 && text(shuffled) === text(pieces); i++) shuffled = shuffle(pieces, rand);
  return { type, word, sentence, answer: pieces, pieces: shuffled };
}

/**
 * Cut typed Chinese into sentence tokens: longest known word first (`known` has hanzi),
 * runs of unknown characters go through `segment` (the app passes Intl.Segmenter).
 */
export function tokenize(text, known, segment = (s) => [s]) {
  const out = [];
  let unk = '';
  const flush = () => { if (unk) out.push(...segment(unk)); unk = ''; };
  const chars = [...text.replace(/\s+/g, '')];
  for (let i = 0; i < chars.length;) {
    let n = Math.min(8, chars.length - i);
    while (n > 0 && !known.has(chars.slice(i, i + n).join(''))) n--;
    if (n) { flush(); out.push(chars.slice(i, i + n).join('')); i += n; }
    else if (isPunct(chars[i])) { flush(); out.push(chars[i++]); }
    else unk += chars[i++];
  }
  flush();
  return out;
}

export function record(progress, hanzi, correct) {
  const s = (progress[hanzi] ??= { r: 0, w: 0 });
  correct ? s.r++ : s.w++;
  return progress;
}

/** Typed Chinese (IME output) matches the word or sentence, ignoring whitespace and punctuation. */
const bare = (t) => t.replace(/[\p{P}\s]/gu, '').toLowerCase();
export const sameHanzi = (typed, target) => bare(typed) === bare(target);
