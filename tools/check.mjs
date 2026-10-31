#!/usr/bin/env node
// Formats data/vocab.json, validates it, then syncs audio/ (one mp3 per word and sentence).
// Usage: node tools/check.mjs [--no-audio]
import { readFile, writeFile, readdir, unlink, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { normalize } from '../js/pinyin.js';
import { parseToken, isPunct, sentenceText } from '../js/quiz.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data/vocab.json');
const AUDIO = path.join(ROOT, 'audio');
const CEDICT_GZ = path.join(ROOT, 'tools/.cache/cedict.txt.gz');
const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const VOICE = 'zh-CN-XiaoxiaoNeural';
export const SENTENCES_PER_WORD = 3;

/** CC-CEDICT text -> Map(simplified -> Set(normalized pinyin)). */
export function parseCedict(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = /^\S+ (\S+) \[([^\]]+)\]/.exec(line);
    if (!m) continue;
    if (!map.has(m[1])) map.set(m[1], new Set());
    map.get(m[1]).add(normalize(m[2]));
    // Variant readings live in the definition, e.g. 谁 [shei2] /.../also pr. [shui2]/
    for (const v of line.matchAll(/also pr\. \[([^\]]+)\]/g)) map.get(m[1]).add(normalize(v[1]));
  }
  return map;
}

/** Readings of a word: whole-word entries plus every per-character combination. */
function readingsFor(hanzi, cedict) {
  const out = new Set(cedict.get(hanzi) ?? []);
  const chars = [...hanzi];
  if (chars.length > 1) {
    let combos = [''];
    for (const c of chars) {
      const rs = [...(cedict.get(c) ?? [])];
      combos = combos.flatMap((pre) => rs.map((r) => pre + r)).slice(0, 4096);
    }
    combos.forEach((c) => out.add(c));
  }
  return out;
}

export function validate(data, cedict) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const lessonIds = new Set();
  for (const l of data.lessons ?? []) {
    if (!Number.isInteger(l.id) || lessonIds.has(l.id)) err(`lesson ${l.id}`, 'id must be a unique integer');
    if (typeof l.title !== 'string' || !l.title) err(`lesson ${l.id}`, 'title required');
    if (l.id > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(l.date ?? '')) err(`lesson ${l.id}`, 'date must be YYYY-MM-DD');
    lessonIds.add(l.id);
  }

  const words = new Map();
  for (const w of data.words ?? []) {
    const at = `word ${w.hanzi}`;
    if (typeof w.hanzi !== 'string' || !/^\p{Script=Han}+$/u.test(w.hanzi)) { err(at, 'hanzi must be Chinese characters only'); continue; }
    if (words.has(w.hanzi)) err(at, 'duplicate word (merge meanings/pinyin into one entry)');
    words.set(w.hanzi, w);
    if (!lessonIds.has(w.lesson)) err(at, `lesson ${w.lesson} does not exist`);
    if (!Array.isArray(w.meanings) || !w.meanings.length || w.meanings.some((m) => typeof m !== 'string' || !m)) err(at, 'meanings must be a non-empty array of strings');
    if (typeof w.en !== 'string' || !w.en) err(at, 'en gloss required');
    if (!Array.isArray(w.pinyin) || !w.pinyin.length) { err(at, 'pinyin must be a non-empty array'); continue; }
    const known = readingsFor(w.hanzi, cedict);
    for (const p of w.pinyin) {
      if (/\d/.test(p)) err(at, `pinyin "${p}" must use tone marks, not numbers`);
      else if (known.size && !known.has(normalize(p))) err(at, `pinyin "${p}" not in CC-CEDICT (known: ${[...cedict.get(w.hanzi) ?? []].join(', ') || 'per-char only'})`);
      else if (!known.size) err(at, 'not found in CC-CEDICT, check the characters');
    }
  }

  const ids = new Set();
  const texts = new Set();
  const focusCount = new Map();
  for (const s of data.sentences ?? []) {
    const at = `sentence ${s.id}`;
    if (typeof s.id !== 'string' || ids.has(s.id)) err(at, 'id must be a unique string');
    ids.add(s.id);
    if (!lessonIds.has(s.lesson)) err(at, `lesson ${s.lesson} does not exist`);
    if (typeof s.vi !== 'string' || !s.vi) err(at, 'vi translation required');
    if (typeof s.en !== 'string' || !s.en) err(at, 'en translation required');
    if (!Array.isArray(s.tokens) || !s.tokens.some((t) => !isPunct(t))) { err(at, 'tokens must contain words'); continue; }
    const text = sentenceText(s);
    if (texts.has(text)) err(at, `duplicate sentence ${text}`);
    texts.add(text);
    for (const t of s.tokens) {
      const { h, p } = parseToken(t);
      if (isPunct(h)) continue;
      const w = words.get(h);
      if (!w) { err(at, `token "${h}" is not in the word list (split it into known words, or add it as a word)`); continue; }
      if (p && !w.pinyin.some((wp) => normalize(wp) === normalize(p))) err(at, `token "${t}" reading must be one of ${w.pinyin.join(', ')}`);
    }
    const focus = words.get(s.focus);
    if (!focus) err(at, `focus "${s.focus}" is not a word`);
    else {
      if (!s.tokens.some((t) => parseToken(t).h === s.focus)) err(at, `focus "${s.focus}" must appear as a token`);
      if (!Number.isInteger(s.sense) || s.sense < 0 || s.sense >= focus.meanings.length) err(at, `sense must index ${s.focus}.meanings (0..${focus.meanings.length - 1})`);
      focusCount.set(s.focus, (focusCount.get(s.focus) ?? 0) + 1);
    }
  }
  for (const w of words.values()) {
    const n = focusCount.get(w.hanzi) ?? 0;
    if (w.lesson > 0 && n < SENTENCES_PER_WORD) err(`word ${w.hanzi}`, `needs at least ${SENTENCES_PER_WORD} sentences with focus "${w.hanzi}", has ${n}`);
  }
  return errors;
}

/** Canonical layout: one record per line, so git diffs stay readable. */
export function format(data) {
  const arr = (xs) => '[\n' + xs.map((x) => '  ' + JSON.stringify(x)).join(',\n') + '\n]';
  return '{\n' + ['lessons', 'words', 'sentences'].map((k) => `"${k}": ${arr(data[k] ?? [])}`).join(',\n') + '\n}\n';
}

async function loadCedict() {
  try {
    await access(CEDICT_GZ);
  } catch {
    console.log('Downloading CC-CEDICT...');
    const res = await fetch(CEDICT_URL);
    if (!res.ok) throw new Error(`CC-CEDICT download failed: ${res.status}`);
    await mkdir(path.dirname(CEDICT_GZ), { recursive: true });
    await writeFile(CEDICT_GZ, Buffer.from(await res.arrayBuffer()));
  }
  return parseCedict(gunzipSync(await readFile(CEDICT_GZ)).toString('utf8'));
}

async function syncAudio(data) {
  await mkdir(AUDIO, { recursive: true });
  const wanted = new Set([...data.words.map((w) => w.hanzi), ...data.sentences.map(sentenceText)]);
  const existing = new Set((await readdir(AUDIO)).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
  for (const f of existing) if (!wanted.has(f)) await unlink(path.join(AUDIO, f + '.mp3'));
  const missing = [...wanted].filter((t) => !existing.has(t));
  const run = promisify(execFile);
  const bin = process.env.EDGE_TTS ?? 'edge-tts';
  // ponytail: 4 parallel edge-tts processes; fine for a few dozen files per lesson.
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(missing.slice(i, i + 4).map((text) =>
      run(bin, ['--voice', VOICE, '--rate=-10%', '--text', text, '--write-media', path.join(AUDIO, text + '.mp3')])));
  }
  return missing.length;
}

async function main() {
  const data = JSON.parse(await readFile(DATA, 'utf8'));
  await writeFile(DATA, format(data));
  const errors = validate(data, await loadCedict());
  if (errors.length) {
    console.error(`FAIL: ${errors.length} problem(s) in data/vocab.json\n- ` + errors.join('\n- '));
    process.exit(1);
  }
  console.log(`OK: ${data.words.length} words, ${data.sentences.length} sentences`);
  if (!process.argv.includes('--no-audio')) console.log(`Audio: ${await syncAudio(data)} file(s) generated`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
