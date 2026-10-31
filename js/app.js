import { toMarks, normalize } from './pinyin.js';
import { buildSession, sentencePinyin, sentenceText, parseToken, latestLesson, record } from './quiz.js';

const root = document.getElementById('app');
const PROGRESS_KEY = 'hsk-progress';
let data, wordMap;
let progress = loadProgress();
let view = { name: 'home' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (name, fill) => `<i class="ph${fill ? '-fill' : ''} ph-${name}" aria-hidden="true"></i>`;

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) ?? {}; } catch { return {}; }
}
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* private mode: progress lives for this tab only */ }
}

// Audio: pre-generated neural mp3, Web Speech as fallback.
let current;
function say(text) {
  current?.pause();
  current = new Audio(`audio/${encodeURIComponent(text)}.mp3`);
  current.play().catch(() => speak(text));
  current.onerror = () => speak(text);
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
const speakBtn = (text, sm) => `<button class="speak${sm ? ' sm' : ''}" data-say="${esc(text)}" aria-label="Nghe">${icon('speaker-high', true)}</button>`;

// ---------- Views ----------

function home() {
  const latest = latestLesson(data);
  const lesson = data.lessons.find((l) => l.id === latest);
  const fresh = data.words.filter((w) => w.lesson === latest);
  const learned = data.words.filter((w) => progress[w.hanzi]?.r).length;
  if (!fresh.length) {
    return `<main class="page"><div class="empty">${icon('camera')}<p>Chưa có từ nào.<br>Gửi ảnh từ mới cho Hermes trên Telegram.</p></div></main>`;
  }
  return `<main class="page">
    <header class="home-head"><h1>Học từ</h1><span class="muted">${learned}/${data.words.length} từ đã thuộc</span></header>
    <section class="lesson">
      <h2>${esc(lesson.title)}${lesson.date ? `, ${esc(formatDate(lesson.date))}` : ''}</h2>
      <p class="strip han">${fresh.map((w) => `<span>${esc(w.hanzi)}</span>`).join('')}</p>
      <p class="count">${fresh.length} từ mới</p>
      <button class="btn primary block" data-action="start" data-mode="latest">Học bài mới</button>
    </section>
    <nav class="menu">
      <button class="menu-item" data-action="start" data-mode="all">${icon('shuffle')}<span><b>Ôn tất cả</b><small>Ưu tiên từ hay sai</small></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="words">${icon('list-bullets')}<span><b>Danh sách từ</b><small>${data.words.length} từ, bấm để nghe</small></span>${icon('caret-right')}</button>
    </nav>
  </main>`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${+d}/${+m}/${y}`;
}

function wordList() {
  const groups = [...data.lessons].sort((a, b) => b.id - a.id).map((l) => {
    const words = data.words.filter((w) => w.lesson === l.id);
    if (!words.length) return '';
    return `<section class="group"><h2>${esc(l.title)}</h2><div class="words">${words.map(wordRow).join('')}</div></section>`;
  });
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>Danh sách từ</h1></header>
    ${groups.join('')}
  </main>`;
}

function wordRow(w) {
  const sents = data.sentences.filter((s) => s.focus === w.hanzi);
  return `<details class="word">
    <summary><span class="han">${esc(w.hanzi)}</span><span><p class="py">${esc(w.pinyin.join(' / '))}</p><p>${esc(w.meanings.join('; '))}</p><p class="en">${esc(w.en)}</p></span>${icon('caret-right')}</summary>
    <div class="body">${speakSentence(w.hanzi, w.pinyin.join(' / '), w.meanings.join('; '), w.en)}${sents.map((s) => speakSentence(sentenceText(s), sentencePinyin(s, wordMap), s.vi, s.en)).join('')}</div>
  </details>`;
}

const speakSentence = (han, py, vi, en) =>
  `<div class="sent">${speakBtn(han, true)}<p class="han">${esc(han)}</p><p class="py">${esc(py)}</p>${gloss(vi, en)}</div>`;

/** Vietnamese first, English under it. */
const gloss = (vi, en) => `<p class="vi">${esc(vi)}</p><p class="en">${esc(en ?? '')}</p>`;

const PROMPTS = {
  flash: 'Từ mới',
  listen: 'Nghe và chọn chữ đúng',
  pinyin: 'Gõ pinyin của từ này',
  cloze: 'Chọn từ điền vào chỗ trống',
  order: 'Sắp xếp thành câu',
  meaning: 'Câu này nghĩa là gì?',
};

function quiz() {
  const { qs, i, state } = view;
  const q = qs[i];
  const pct = Math.round((i / qs.length) * 100);
  return `<main class="page">
    <header class="quiz-top">
      <button class="icon-btn" data-action="home" aria-label="Thoát">${icon('x')}</button>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <span class="counter">${i + 1}/${qs.length}</span>
    </header>
    <p class="prompt">${PROMPTS[q.type]}</p>
    ${QUESTION[q.type](q, state)}
    ${state.done ? '<div class="sheet-pad"></div>' : ''}
  </main>${state.done ? sheet(q, state) : ''}`;
}

const wordOption = (w, q, state) => {
  const cls = !state.done ? '' : w === q.word ? 'right' : w === state.pick ? 'wrong' : '';
  return `<button class="opt ${cls}" data-pick="${esc(w.hanzi)}" ${state.done ? 'disabled' : ''}><span class="han">${esc(w.hanzi)}</span>${q.type === 'cloze' && state.done ? `<span class="py">${esc(w.pinyin[0])}</span>` : ''}</button>`;
};

const QUESTION = {
  flash(q, state) {
    const w = q.word;
    const ex = data.sentences.find((s) => s.focus === w.hanzi);
    return `<div class="stage">
      <div class="card center">
        <p class="big-han han">${esc(w.hanzi)}</p>
        ${speakBtn(w.hanzi)}
        ${state.flipped ? `<p class="py-big">${esc(w.pinyin.join(' / '))}</p><p class="meaning">${esc(w.meanings.join('; '))}</p><p class="en">${esc(w.en)}</p>
          ${ex ? `<div class="example">${speakBtn(sentenceText(ex), true)}<p class="han">${esc(sentenceText(ex))}</p><p class="py">${esc(sentencePinyin(ex, wordMap))}</p>${gloss(ex.vi, ex.en)}</div>` : ''}` : ''}
      </div>
    </div>
    <div class="footer${state.flipped ? ' two' : ''}">
      ${state.flipped
        ? `<button class="btn" data-action="grade" data-ok="0">Chưa nhớ</button><button class="btn primary" data-action="grade" data-ok="1">Đã nhớ</button>`
        : `<button class="btn primary block" data-action="flip">Lật thẻ</button>`}
    </div>`;
  },
  listen(q, state) {
    return `<div class="stage">
      <div class="center">${speakBtn(q.word.hanzi)}<span class="muted">Bấm để nghe lại</span></div>
      <div class="options">${q.options.map((w) => wordOption(w, q, state)).join('')}</div>
    </div>`;
  },
  pinyin(q, state) {
    return `<form class="stage" data-action="submit-pinyin">
      <p class="big-han han">${esc(q.word.hanzi)}</p>
      <div class="field">
        <label for="py">Pinyin (gõ số cho thanh điệu, ví dụ ni3)</label>
        <input id="py" name="py" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(state.typed ?? '')}" ${state.done ? 'disabled' : ''}>
        <span class="preview py" id="py-preview">${esc(toMarks(state.typed ?? ''))}</span>
      </div>
      ${state.done ? '' : '<div class="footer"><button class="btn primary block" id="py-check" disabled>Kiểm tra</button></div>'}
    </form>`;
  },
  cloze(q, state) {
    const parts = q.sentence.tokens.map((t, idx) => {
      const h = parseToken(t).h;
      if (idx !== q.blank) return esc(h);
      return state.done ? `<span class="blank">${esc(h)}</span>` : '<span class="blank">&nbsp;</span>';
    });
    return `<div class="stage">
      <p class="sentence han">${parts.join('')}</p>
      <div class="hint">${gloss(q.sentence.vi, q.sentence.en)}</div>
      <div class="options">${q.options.map((w) => wordOption(w, q, state)).join('')}</div>
    </div>`;
  },
  order(q, state) {
    const picked = state.picked ?? [];
    const chip = (idx, act) => `<button class="chip han" data-action="${act}" data-idx="${idx}" ${state.done ? 'disabled' : ''}>${esc(q.pieces[idx])}</button>`;
    return `<div class="stage">
      <div class="hint">${gloss(q.sentence.vi, q.sentence.en)}</div>
      <div class="answer-line">${picked.map((idx) => chip(idx, 'unplace')).join('')}</div>
      <div class="pieces">${q.pieces.map((_, idx) => (picked.includes(idx) ? `<span class="chip ghost">${esc(q.pieces[idx])}</span>` : chip(idx, 'place'))).join('')}</div>
    </div>
    ${state.done ? '' : `<div class="footer"><button class="btn primary block" data-action="check-order" ${picked.length === q.pieces.length ? '' : 'disabled'}>Kiểm tra</button></div>`}`;
  },
  meaning(q, state) {
    const text = sentenceText(q.sentence);
    return `<div class="stage">
      <div class="center"><p class="sentence han">${esc(text)}</p>${speakBtn(text)}</div>
      <div class="options list">${q.options.map((s) => {
        const cls = !state.done ? '' : s === q.sentence ? 'right' : s === state.pick ? 'wrong' : '';
        return `<button class="opt ${cls}" data-pick="${esc(s.id)}" ${state.done ? 'disabled' : ''}>${gloss(s.vi, s.en)}</button>`;
      }).join('')}</div>
    </div>`;
  },
};

function sheet(q, state) {
  const w = q.word;
  const sentence = q.sentence;
  const han = sentence ? sentenceText(sentence) : w.hanzi;
  const py = sentence ? sentencePinyin(sentence, wordMap) : w.pinyin.join(' / ');
  const vi = sentence ? sentence.vi : w.meanings.join('; ');
  const en = sentence ? sentence.en : w.en;
  return `<aside class="sheet ${state.correct ? 'ok' : 'bad'}"><div>
    <h3>${state.correct ? `${icon('check-circle', true)} Đúng rồi` : `${icon('x-circle', true)} Chưa đúng`}</h3>
    <div class="solution">${speakBtn(han, true)}<p class="han">${esc(han)}</p><p class="py">${esc(py)}</p>${gloss(vi, en)}</div>
    <button class="btn primary block" data-action="next" autofocus>Tiếp tục</button>
  </div></aside>`;
}

function summary() {
  const { results, mode } = view;
  const right = results.filter((r) => r.ok).length;
  const missed = [...new Set(results.filter((r) => !r.ok).map((r) => r.hanzi))];
  return `<main class="page">
    <div class="summary">
      <p class="score">${right}/${results.length}</p>
      <h1>${right === results.length ? 'Không sai câu nào' : 'Xong buổi học'}</h1>
      ${missed.length ? `<p class="muted">Cần ôn thêm:</p><div class="missed han">${missed.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="footer two">
      <button class="btn" data-action="home">Trang chủ</button>
      <button class="btn primary" data-action="start" data-mode="${mode}">Học tiếp</button>
    </div>
  </main>`;
}

// ---------- Controller ----------

function render() {
  const views = { home, words: wordList, quiz, summary };
  root.innerHTML = views[view.name]();
  if (view.name === 'quiz') onQuestionShown();
}

function onQuestionShown() {
  const q = view.qs[view.i];
  if (view.state.done) return root.querySelector('[data-action="next"]')?.focus();
  if (q.type === 'pinyin') {
    const input = root.querySelector('#py');
    input.focus();
    input.addEventListener('input', () => {
      view.state.typed = input.value;
      root.querySelector('#py-preview').textContent = toMarks(input.value);
      root.querySelector('#py-check').disabled = !input.value.trim();
    });
  }
}

function startSession(mode) {
  const qs = buildSession(data, progress, mode);
  view = { name: 'quiz', mode, qs, i: 0, state: {}, results: [] };
  render();
  autoplay();
}

function autoplay() {
  const q = view.qs[view.i];
  if (q.type === 'listen' || q.type === 'flash') say(q.word.hanzi);
  if (q.type === 'meaning') say(sentenceText(q.sentence));
}

function grade(ok) {
  const q = view.qs[view.i];
  record(progress, q.word.hanzi, ok);
  saveProgress();
  if (q.type !== 'flash') view.results.push({ hanzi: q.word.hanzi, ok });
}

function answer(ok, extra = {}) {
  grade(ok);
  Object.assign(view.state, extra, { done: true, correct: ok });
  render();
  const q = view.qs[view.i];
  say(q.sentence ? sentenceText(q.sentence) : q.word.hanzi);
}

function next() {
  if (view.i + 1 >= view.qs.length) {
    view = { name: 'summary', mode: view.mode, results: view.results };
    return render();
  }
  view.i++;
  view.state = {};
  render();
  autoplay();
}

root.addEventListener('click', (e) => {
  const sayBtn = e.target.closest('[data-say]');
  if (sayBtn) {
    e.preventDefault(); // keep <details> from toggling when tapping its play button
    return say(sayBtn.dataset.say);
  }
  const pick = e.target.closest('[data-pick]');
  if (pick && view.name === 'quiz' && !view.state.done) {
    const q = view.qs[view.i];
    const chosen = q.type === 'meaning' ? q.options.find((s) => s.id === pick.dataset.pick) : wordMap.get(pick.dataset.pick);
    return answer(chosen === (q.type === 'meaning' ? q.sentence : q.word), { pick: chosen });
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const act = el.dataset.action;
  if (act === 'home') { view = { name: 'home' }; render(); }
  else if (act === 'words') { view = { name: 'words' }; render(); }
  else if (act === 'start') startSession(el.dataset.mode);
  else if (act === 'flip') { view.state.flipped = true; render(); }
  else if (act === 'grade') { grade(el.dataset.ok === '1'); next(); }
  else if (act === 'next') next();
  else if (act === 'place') { (view.state.picked ??= []).push(+el.dataset.idx); render(); }
  else if (act === 'unplace') { view.state.picked = view.state.picked.filter((i) => i !== +el.dataset.idx); render(); }
  else if (act === 'check-order') {
    const q = view.qs[view.i];
    // ponytail: only the source word order counts; add alternates to the data if a lesson needs them.
    answer(view.state.picked.map((i) => q.pieces[i]).join('') === q.answer.join(''));
  }
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = view.qs[view.i];
  const typed = view.state.typed ?? '';
  if (!typed.trim()) return;
  answer(q.word.pinyin.some((p) => normalize(p) === normalize(typed)));
});

async function boot() {
  try {
    const res = await fetch('data/vocab.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    wordMap = new Map(data.words.map((w) => [w.hanzi, w]));
    render();
  } catch (err) {
    root.innerHTML = `<main class="page"><div class="empty">${icon('wifi-slash')}<p>Không tải được dữ liệu (${esc(err.message)}).</p><button class="btn" onclick="location.reload()">Thử lại</button></div></main>`;
  }
}
boot();
