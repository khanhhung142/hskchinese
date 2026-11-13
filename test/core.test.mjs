import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toMarks, normalize } from '../js/pinyin.js';
import { buildSession, tokenPinyin, parseToken, record, latestLesson, isPunct, sameHanzi, tokenize, enTokens, fromEnglish } from '../js/quiz.js';
import { parseCedict, validate, validateEnglish, format } from '../tools/check.mjs';

const data = JSON.parse(readFileSync(new URL('../data/vocab.json', import.meta.url), 'utf8'));

test('toMarks places tones by the standard rules', () => {
  assert.equal(toMarks('ni3 hao3'), 'nǐ hǎo');
  assert.equal(toMarks('zhong1wen2'), 'zhōngwén');
  assert.equal(toMarks('gou3 xiu1 liu2 lv4 nu:3 de5'), 'gǒu xiū liú lǜ nǚ de');
  assert.equal(toMarks('Xie4xie5'), 'xièxie');
});

test('normalize accepts numbers, marks, spaces, v for ü', () => {
  assert.equal(normalize('Zhōng wén'), normalize('zhong1wen2'));
  assert.equal(normalize('lv4'), normalize('lǜ'));
  assert.notEqual(normalize('ma3'), normalize('ma4'));
});

const CEDICT = parseCedict([
  '我 我 [wo3] /I/',
  '是 是 [shi4] /to be/',
  '誰 谁 [shei2] /who/also pr. [shui2]/',
  '朋 朋 [peng2] /friend/',
  '友 友 [you3] /friend/',
].join('\n'));
const mini = () => ({
  lessons: [{ id: 0, date: '', title: 'core' }, { id: 1, date: '2026-10-31', title: 'Bài 1' }],
  words: [
    { hanzi: '我', pinyin: ['wǒ'], meanings: ['tôi'], en: 'I', lesson: 0 },
    { hanzi: '是', pinyin: ['shì'], meanings: ['là'], en: 'to be', lesson: 0 },
    { hanzi: '谁', pinyin: ['shéi', 'shuí'], meanings: ['ai'], en: 'who', lesson: 1 },
  ],
  sentences: ['我 是 谁 ？', '谁 是 我 ？', '是 谁|shuí ？'].map((t, i) => ({
    id: `1-${i}`, tokens: t.split(' '), vi: 'x' + i, en: 'e' + i, focus: '谁', sense: 0, lesson: 1,
  })),
});

test('validate accepts clean data, incl. also-pr readings and per-char compounds', () => {
  const d = mini();
  d.words.push({ hanzi: '朋友', pinyin: ['péngyǒu'], meanings: ['bạn'], en: 'friend', lesson: 0 });
  assert.deepEqual(validate(d, CEDICT), []);
});

test('validate catches the mistakes an LLM makes', () => {
  const d = mini();
  d.words[0].pinyin = ['wo3'];
  d.words[1].pinyin = ['shí'];
  d.sentences[0].tokens = ['我', '是', '你', '？'];
  d.sentences[1].sense = 2;
  d.sentences[2].tokens = ['是', '谁|shuǐ'];
  const errs = validate(d, CEDICT).join('\n');
  assert.match(errs, /word 我: pinyin "wo3" must use tone marks/);
  assert.match(errs, /word 是: pinyin "shí" not in CC-CEDICT/);
  assert.match(errs, /token "你" is not in the word list/);
  assert.match(errs, /sense must index/);
  assert.match(errs, /reading must be one of/);
  const few = mini();
  few.sentences.pop();
  assert.match(validate(few, CEDICT).join(), /word 谁: needs at least 3 sentences/);
});

test('seed data formats canonically', () => {
  assert.equal(format(data), readFileSync(new URL('../data/vocab.json', import.meta.url), 'utf8'));
});

test('token pinyin uses the explicit reading, else the main one', () => {
  const words = new Map(mini().words.map((w) => [w.hanzi, w]));
  assert.deepEqual(['我', '谁', '谁|shuí'].map((t) => tokenPinyin(t, words)), ['wǒ', 'shéi', 'shuí']);
  assert.deepEqual(parseToken('还|huán'), { h: '还', p: 'huán' });
});

test('buildSession: new words get a flashcard then an exercise, seen words get valid exercises', () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fresh = buildSession(data, {}, 'latest', { rand });
  assert.equal(fresh.length, 10);
  assert.ok(fresh.slice(0, 5).every((q) => q.type === 'flash' && q.word.lesson === latestLesson(data)));
  assert.ok(fresh.slice(5).every((q) => q.type !== 'flash'));
  assert.deepEqual(new Set(fresh.slice(5).map((q) => q.word)), new Set(fresh.slice(0, 5).map((q) => q.word)));

  const progress = {};
  data.words.forEach((w) => record(progress, w.hanzi, true));
  for (let i = 0; i < 50; i++) {
    const session = buildSession(data, progress, 'all', { rand });
    assert.equal(new Set(session.map((q) => q.type)).size, 5, 'every session mixes all five exercise types');
    for (const q of session) {
      if (q.options && q.type !== 'meaning') assert.ok(q.options.includes(q.word) && new Set(q.options).size === q.options.length);
      if (q.type === 'meaning') assert.ok(q.options.includes(q.sentence));
      if (q.type === 'cloze') assert.equal(parseToken(q.sentence.tokens[q.blank]).h, q.word.hanzi);
      if (q.type === 'order') {
        assert.notEqual(q.pieces.join(''), q.answer.join(''));
        assert.equal([...q.pieces].sort().join(), [...q.answer].sort().join());
        assert.deepEqual(q.answer, q.sentence.tokens.filter((t) => !isPunct(parseToken(t).h)));
      }
    }
  }
});

test('tokenize: longest known word first, unknown runs segmented, punctuation split', () => {
  const known = new Set(['我', '老师', '老', '是', '中国']);
  assert.deepEqual(tokenize('我是 老师，北京人', known), ['我', '是', '老师', '，', '北京人']);
  assert.deepEqual(tokenize('中国北京', known, (s) => [...s]), ['中国', '北', '京']);
});

test('buildSession: lesson option limits picked words to that lesson', () => {
  const id = data.lessons.find((l) => l.id > 0).id;
  for (let i = 0; i < 20; i++) assert.ok(buildSession(data, {}, 'all', { lesson: id }).every((q) => q.word.lesson === id));
  // several lessons at once
  const two = [...new Set(data.words.map((w) => w.lesson))].slice(0, 2);
  for (let i = 0; i < 20; i++) assert.ok(buildSession(data, {}, 'all', { lesson: two }).every((q) => two.includes(q.word.lesson)));
});

test('sameHanzi matches typed Chinese exactly, ignoring spaces and punctuation', () => {
  assert.ok(sameHanzi(' 你好 ', '你好'));
  assert.ok(sameHanzi('你 好', '你好'));
  assert.ok(!sameHanzi('你', '你好'));
  assert.ok(!sameHanzi('nihao', '你好'));
  assert.ok(sameHanzi('我是学生', '我是学生。'));
  assert.ok(sameHanzi('你好吗?', '你好吗？'));
  assert.ok(!sameHanzi('我是', '我是学生。'));
});

test('english: tokens keep multi-word entries, validation catches bad focus', () => {
  assert.deepEqual(enTokens('Thank you, teacher!', new Set(['thank you'])), ['Thank you', ',', 'teacher', '!']);
  assert.deepEqual(enTokens("I'm a student."), ["I'm", 'a', 'student', '.']);
  const raw = { lessons: [{ id: 1, date: '2026-11-13', title: 'Bài 1' }], words: [{ word: 'hello', meanings: ['xin chào'], lesson: 1 }],
    sentences: [{ id: '1-01', text: 'Hello, Lan!', vi: 'Chào Lan!', focus: 'hello', lesson: 1 }, { id: '1-02', text: 'Hi.', vi: 'Chào.', focus: 'hello', lesson: 1 }] };
  const errs = validateEnglish(raw);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /1-02: focus "hello" must appear/);
  const d = fromEnglish(raw);
  assert.equal(d.sentences[0].tokens[0], 'Hello');
  assert.ok(sameHanzi('hello lan', 'Hello, Lan!'));
});

test('full/index.html is index.html plus a base tag', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const full = readFileSync(new URL('../full/index.html', import.meta.url), 'utf8');
  assert.equal(full, page.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="../">'));
});
