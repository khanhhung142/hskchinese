#!/usr/bin/env python3
"""Rebuild data/vocab.json from the books: data/textbook.json (Giáo trình) + data/workbook.json (Bài tập).

Lessons = textbook lessons (same ids) + workbook-only ones (mock exam). Words = every 生词/专有名词 of a
lesson (plus appendix-only words, e.g. numbers), filed under the first lesson that teaches them.
Sentences = textbook dialogue lines + grammar examples + workbook transcripts, filed under their lesson,
kept only when every piece is a known word (no digits/Latin).
English glosses live in data/book_en.json ({"w": {hanzi: en}, "s": {text: en}}); missing ones are listed
and the run fails, so fill them in and rerun. Usage: python3 tools/book_vocab.py  (then tools/publish.sh)
"""
import json, re, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'data'
tb = json.loads((D / 'textbook.json').read_text())
wb = json.loads((D / 'workbook.json').read_text())
old = json.loads((D / 'vocab.json').read_text())
en_path = D / 'book_en.json'
EN = json.loads(en_path.read_text()) if en_path.exists() else {'w': {}, 's': {}}
today = datetime.date.today().isoformat()
dates = {l['id']: l['date'] for l in old['lessons'] if l.get('date')}

# Lessons
lessons = [{'id': L['id'], 'title': f"Bài {L['id']}: {L['title']}"} for L in tb['lessons']]
ids = {l['id'] for l in lessons}
lessons += [{'id': L['id'], 'title': L['title']} for L in wb['lessons'] if L['id'] not in ids]
for l in lessons: l['date'] = dates.get(l['id'], today)
lessons = [{'id': l['id'], 'date': l['date'], 'title': l['title']} for l in sorted(lessons, key=lambda l: l['id'])]

# Words
PY_FIX = {'里': 'lǐ', '上': 'shàng'}  # book prints the neutral tone (家里, 桌子上)
def fix_py(zh, p):
    if zh in PY_FIX and p.replace('à', 'a') in ('li', 'shang'): return PY_FIX[zh]
    if zh[0] == '一': p = re.sub(r'^y[íì]', 'yī', p)  # sandhi: 一下 yíxià -> yīxià
    if zh[0] == '不': p = re.sub(r'^bú', 'bù', p)
    return p.replace(' ', '') if zh in ('不客气',) else p
words = {}
def add_word(zh, py, vi, lesson):
    zh = zh.lstrip('★').strip()
    if not re.fullmatch(r'[\u3400-\u9fff]+', zh): return
    w = words.setdefault(zh, {'hanzi': zh, 'pinyin': [], 'meanings': [], 'lesson': lesson})
    for p in py.split('/'):
        p = fix_py(zh, p.strip())
        if p and p not in w['pinyin']: w['pinyin'].append(p)
    if vi and vi not in w['meanings']: w['meanings'].append(vi)
    w.setdefault('senses', {}).setdefault(lesson, w['meanings'].index(vi) if vi else 0)
for L in tb['lessons']:
    for b in L['blocks']:
        for x in b.get('words', []) + b.get('names', []):
            add_word(x['zh'], x['py'], x.get('vi', ''), L['id'])
oldw = {w['hanzi']: w for w in old['words']}
for x in tb['vocab'] + tb['names']:
    zh = x['zh'].lstrip('★')
    if zh not in words:
        add_word(zh, x['py'], (oldw.get(zh) or {'meanings': ['']})['meanings'][0], x.get('lesson') or (x.get('lessons') or [1])[0])

# Sentences
PUNCT_KEEP = '，。？！'
def clean(zh):
    zh = re.sub(r'^(男|女|问)[：:]', '', zh.strip()).lstrip('★').strip()
    zh = re.sub(r'[：；、]', '，', zh)
    zh = re.sub(r'[“”‘’「」《》（）()]', '', zh).replace(' ', '')
    zh = re.sub(r'，+', '，', zh).strip('，')
    if zh and zh[-1] not in PUNCT_KEEP: zh += '。'
    return zh
def clean_tr(t):  # matching prefix on vi/en
    return re.sub(r'^(Nam|Nữ|Hỏi|M|W|F|Q)\s*[:：]\s*', '', t.strip()).lstrip('★').strip()
def tokenize(zh):
    out, i = [], 0
    while i < len(zh):
        if zh[i] in PUNCT_KEEP: out.append(zh[i]); i += 1; continue
        for n in range(min(8, len(zh) - i), 0, -1):
            if zh[i:i + n] in words: out.append(zh[i:i + n]); i += n; break
        else: return None
    return out
raw = []
for L in tb['lessons']:
    for b in L['blocks']:
        for x in ([b['scene']] if b.get('scene') else []) + b.get('lines', []) + b.get('ex', []):
            raw.append((L['id'], x['zh'], x.get('vi', ''), None))
def walk(o, lid):
    if isinstance(o, dict):
        for x in o.get('tr', []):
            if not re.match(r'^[A-F]\s', x['zh']): raw.append((lid, x['zh'], clean_tr(x.get('vi', '')), clean_tr(x.get('en', ''))))
        for k, v in o.items():
            if k != 'tr': walk(v, lid)
    elif isinstance(o, list):
        for i in o: walk(i, lid)
for L in wb['lessons']: walk(L, L['id'])

sentences, seen, skipped, nums, focus_n = [], set(), 0, {}, {}
for lid, zh, vi, en in raw:
    if re.search(r'[A-Za-z0-9/~…—_=+]', zh) or not vi: skipped += 1; continue
    zh = clean(zh)
    key = re.sub(r'[，。？！]', '', zh)
    if not key or key in seen: continue
    toks = tokenize(zh)
    if not toks or sum(t not in PUNCT_KEEP for t in toks) < 1: skipped += 1; continue
    seen.add(key)
    known = sorted({t for t in toks if t in words}, key=len, reverse=True)
    mine = [h for h in known if words[h]['lesson'] == lid]
    focus = min(mine or known, key=lambda h: (focus_n.get(h, 0), -len(h)))
    focus_n[focus] = focus_n.get(focus, 0) + 1
    sense = words[focus].get('senses', {}).get(lid, 0)
    en = EN['s'].get(zh) or en
    n = nums.get(lid, 0) + 1; nums[lid] = n
    sentences.append({'id': f'{lid}-{n:02d}', 'tokens': toks, 'vi': vi, 'en': en, 'focus': focus, 'sense': sense, 'lesson': lid})

# English glosses
for w in words.values():
    w['en'] = EN['w'].get(w['hanzi'])
    w.pop('senses', None)
miss = {'w': {w['hanzi']: ' ; '.join(w['meanings']) for w in words.values() if not w['en']},
        's': {''.join(s['tokens']): s['vi'] for s in sentences if not s['en']}}
for s in sentences: s['en'] = (s['en'] or '').replace('/', ', ')
for w in words.values(): w['en'] = (w['en'] or '').replace('/', ', ')
if miss['w'] or miss['s']:
    (D.parent / 'tools/.cache').mkdir(exist_ok=True)
    (D.parent / 'tools/.cache/book_en_missing.json').write_text(json.dumps(miss, ensure_ascii=False, indent=1))
    sys.exit(f"FAIL: English missing for {len(miss['w'])} words, {len(miss['s'])} sentences; see tools/.cache/book_en_missing.json, add them to data/book_en.json")

out = {'lessons': lessons, 'words': [{k: w[k] for k in ('hanzi', 'pinyin', 'meanings', 'en', 'lesson')} for w in words.values()], 'sentences': sentences}
(D / 'vocab.json').write_text(json.dumps(out, ensure_ascii=False))  # check.mjs rewrites the canonical layout
print(f"OK: {len(lessons)} lessons, {len(words)} words, {len(sentences)} sentences ({skipped} book lines skipped: digits/Latin/unknown pieces)")
