#!/usr/bin/env python3
"""Rebuild data/english.json (/english/ Luyện tập + Tra cứu) from the TOEIC tests in data/toeic.json.

Lessons = the 4 skills: 1 Nghe, 2 Đọc, 3 Nói, 4 Viết. Words and sentences come only from the tests:
an LLM picks the TOEIC vocabulary of each test+skill and the test sentences that show it (verbatim),
with IPA and Vietnamese. Picks are cached per test in data/toeic_en.json, so a new or changed test
costs one LLM call and old picks stay put. A word found in several skills goes to the skill where it
is most frequent. Run by tools/publish.sh; needs 9Router (HERMES_9ROUTER_API_KEY) only for new tests.
"""
import json, re, os, hashlib, pathlib, urllib.request, concurrent.futures as cf
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'data'
toeic = json.loads((D / 'toeic.json').read_text())
CACHE = D / 'toeic_en.json'
cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
SKILLS = [(1, 'L', 'Nghe (Listening)'), (2, 'R', 'Đọc (Reading)'), (3, 'S', 'Nói (Speaking)'), (4, 'W', 'Viết (Writing)')]
N_WORDS = {'L': 30, 'R': 30, 'S': 15, 'W': 15}

def sents(text):
    text = re.sub(r'^\s*[A-Z][a-z]*\s*:\s*', '', text, flags=re.M)  # speaker tags W: / M: / Woman:
    out = []
    for line in text.split('\n'):
        for s in re.split(r'(?<!\bMr\.)(?<!\bMs\.)(?<!\bDr\.)(?<!\bSt\.)(?<!\bMrs\.)(?<=[.?!])\s+(?=[A-Z"“])', line.strip()):
            s = s.strip()
            if 4 <= len(s.split()) <= 28 and '/' not in s and '___' not in s and '---' not in s and re.search(r'[.?!]$', s):
                out.append(s)
    return out

def texts(skill, t):
    """All sentences of one test for one skill, in test order."""
    if skill in 'LR':
        lr, xs = t, []
        lo, hi = (1, 100) if skill == 'L' else (101, 200)
        for n in range(lo, hi + 1):
            it = lr['items'][str(n)]
            q = it['q']
            if '-------' in q: q = q.replace('-------', it['o']['ABCD'.index(it['a'])])  # Part 5: fill the answer
            xs += [q] + [o if re.search(r'[.?!]$', o) else '' for o in it['o']]
        xs += [g['sc'] for g in lr['groups'] if lo <= g['f'] <= hi]
        xs += [d['text'] for d in lr.get('docs', []) if lo <= d['f'] <= hi]
    elif skill == 'S':
        xs = [r['text'] for r in t['read']] + [p['sample'] for p in t['pics']] + [t['q57']['ctx']]
        xs += [x for q in t['q57']['qs'] + t['q810']['qs'] for x in (q['q'], q['sample'])] + [t['q810']['intro'], t['q11']['q'], t['q11']['sample']]
    else:
        xs = [p['sample'] for p in t['pics']] + [x for e in t['emails'] for x in (e['body'], e['task'], e['sample'])] + [t['essay']['q'], t['essay']['sample']]
    seen, out = set(), []
    for x in xs:
        for s in sents(x):
            if s not in seen: seen.add(s); out.append(s)
    return out

PROMPT = """You build a TOEIC vocabulary list for a Vietnamese learner from ONE real TOEIC test ({skill}).
Below are the test's sentences, numbered. Pick the {n} most useful TOEIC vocabulary items in them (business, office,
travel, shopping, meetings, etc.; single words or fixed phrases like "in charge of"). Skip names of people/companies/places,
numbers, and very basic words (the, is, go, good, man, woman...).
Rules:
- "word": lowercase, written EXACTLY as it appears in the chosen sentences (same form; prefer sentences with the base form). Letters, spaces, apostrophes, hyphens only.
- "ipa": American IPA in slashes. "meanings": Vietnamese meanings, one string per distinct sense (short).
- "s": 1 or 2 sentence numbers from the list where the word appears as a whole word. "vi": natural Vietnamese translation of each chosen sentence, same order.
Return ONLY a JSON array: [{{"word":"...","ipa":"/.../","meanings":["..."],"s":[3,17],"vi":["...","..."]}}]

Sentences:
{lines}"""

def llm(prompt):
    body = json.dumps({'model': 'cc/claude-sonnet-5-5', 'stream': False, 'messages': [{'role': 'user', 'content': prompt}]}).encode()
    req = urllib.request.Request('http://127.0.0.1:20128/v1/chat/completions', body, {
        'Authorization': 'Bearer ' + (os.environ.get('HERMES_9ROUTER_API_KEY') or re.search(r'^HERMES_9ROUTER_API_KEY=(.*)$', pathlib.Path('~/.hermes/.env').expanduser().read_text(), re.M)[1].strip()), 'Content-Type': 'application/json'})
    out = json.loads(urllib.request.urlopen(req, timeout=600).read())['choices'][0]['message']['content']
    return json.loads(out[out.index('['):out.rindex(']') + 1])

def has(s, w): return re.search(r"(?<![\w'’-])" + re.escape(w) + r"(?![\w'’-])", s, re.I)

def pick(skill, t):
    """Cached LLM pick for one test+skill, keyed by a hash of its sentences (test changed = re-pick)."""
    ss = texts(skill, t)
    k, h = f"{skill}{t['id']}", hashlib.sha1('\n'.join(ss).encode()).hexdigest()[:12]
    if cache.get(k, {}).get('h') == h: return k, cache[k]
    for attempt in range(3):
        try:
            raw = llm(PROMPT.format(skill=dict((s, n) for _, s, n in SKILLS)[skill], n=N_WORDS[skill], lines='\n'.join(f'{i}. {s}' for i, s in enumerate(ss))))
            items = []
            for x in raw:
                w = str(x['word']).strip().lower()
                if not re.fullmatch(r"[a-z][a-z '’-]*", w) or not x.get('meanings'): continue
                pairs = [(ss[i], v) for i, v in zip(x['s'], x['vi']) if isinstance(i, int) and 0 <= i < len(ss) and has(ss[i], w) and v]
                if pairs: items.append({'word': w, 'ipa': x.get('ipa', ''), 'meanings': [m for m in x['meanings'] if m], 's': pairs})
            assert len(items) >= N_WORDS[skill] // 2, (k, len(items))
            return k, {'h': h, 'items': items}
        except Exception as e:
            print('retry', k, e)
    raise SystemExit(f'FAIL: LLM pick {k}')

jobs = [(s, t) for _, s, _ in SKILLS for t in toeic['lr' if s in 'LR' else 'speak' if s == 'S' else 'write']]
with cf.ThreadPoolExecutor(4) as ex:
    for k, v in ex.map(lambda j: pick(*j), jobs):
        cache[k] = v
cache = {k: cache[k] for k in sorted(cache, key=lambda k: (k[0], int(k[1:]))) if any(f'{s}{t["id"]}' == k for s, t in jobs)}
CACHE.write_text('{\n' + ',\n'.join(f'{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in cache.items()) + '\n}\n')

# Merge: each word once, in the skill where it is most frequent (share of that skill's text).
corpus = {s: ' '.join(x for t in (toeic['lr'] if s in 'LR' else toeic['speak' if s == 'S' else 'write']) for x in texts(s, t)).lower() for _, s, _ in SKILLS}
size = {s: max(1, len(c.split())) for s, c in corpus.items()}
cand = {}
for k, v in cache.items():
    for it in v['items']:
        cand.setdefault(it['word'], {}).setdefault(k[0], []).append(it)
lid = {s: i for i, s, _ in SKILLS}
multi = {w for w in cand if ' ' in w}
def tokens(text):  # port of enTokens (js/quiz.js): greedy longest known multi-word item
    raw, out, i = re.findall(r"[\w'’-]+|[^\s\w'’-]+", text), [], 0
    while i < len(raw):
        n = min(4, len(raw) - i)
        while n > 1 and ' '.join(raw[i:i + n]).lower() not in multi: n -= 1
        out.append(' '.join(raw[i:i + n]).lower()); i += n
    return out
words, sentences, used = [], [], set()
for w in sorted(cand):
    sk = max(cand[w], key=lambda s: (len(re.findall(r"(?<![\w'’-])" + re.escape(w) + r"(?![\w'’-])", corpus[s])) / size[s], -lid[s]))
    its = cand[w][sk]
    words.append({'word': w, 'ipa': its[0]['ipa'], 'meanings': its[0]['meanings'], 'lesson': lid[sk]})
    n = 0
    for it in its:
        for text, vi in it['s']:
            if n < 3 and text not in used and w in tokens(text):
                used.add(text); n += 1
                sentences.append({'text': text, 'vi': vi, 'focus': w, 'lesson': lid[sk]})
seq = Counter()
for s in sorted(sentences, key=lambda s: (s['lesson'], s['focus'])):
    seq[s['lesson']] += 1; s['id'] = f"{s['lesson']}-{seq[s['lesson']]:04d}"
sentences.sort(key=lambda s: s['id'])
sentences = [{'id': s['id'], **{k: s[k] for k in ('text', 'vi', 'focus', 'lesson')}} for s in sentences]
old = json.loads((D / 'english.json').read_text())
dates = {l['id']: l.get('date') for l in old['lessons']}
import datetime
lessons = [{'id': i, 'date': dates.get(i) or datetime.date.today().isoformat(), 'title': name} for i, _, name in SKILLS]
words = [w for w in words if any(s['focus'] == w['word'] for s in sentences)]
(D / 'english.json').write_text(json.dumps({'lessons': lessons, 'words': words, 'sentences': sentences}))
print('english.json:', {name: (sum(w['lesson'] == i for w in words), sum(s['lesson'] == i for s in sentences)) for i, _, name in SKILLS})
