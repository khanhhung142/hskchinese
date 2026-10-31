// Pinyin helpers shared by the app and tools/validate.mjs.

const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };

function markSyllable(base, tone) {
  base = base.replace(/u:|v/g, 'ü');
  if (tone < 1 || tone > 4) return base;
  // Standard placement: a/e win, then "ou" marks o, else the last vowel.
  let idx = base.search(/[ae]/);
  if (idx < 0) idx = base.indexOf('ou');
  if (idx < 0) {
    for (let i = base.length - 1; i >= 0; i--) if ('iouü'.includes(base[i])) { idx = i; break; }
  }
  if (idx < 0) return base;
  return base.slice(0, idx) + MARKS[base[idx]][tone - 1] + base.slice(idx + 1);
}

/** "ni3 hao3" / "ni3hao3" / "lv4" -> "nǐ hǎo" / "nǐhǎo" / "lǜ". Text without digits passes through. */
export function toMarks(str) {
  return str.toLowerCase().replace(/([a-zü:]+?)([1-5])/g, (_, b, t) => markSyllable(b, +t));
}

/** Canonical form for comparing answers: tone marks, lowercase, letters only. */
export function normalize(str) {
  return toMarks(str.normalize('NFC').toLowerCase().replace(/v/g, 'ü'))
    .normalize('NFC')
    .replace(/[^\p{L}]/gu, '');
}
