import { toMarks, normalize } from './pinyin.js';
import { buildSession, sentenceText, parseToken, tokenPinyin, isPunct, latestLesson, record, sameHanzi, tokenize, enTokens, fromEnglish, sameWord } from './quiz.js';

const root = document.getElementById('app');
// Two subjects share every screen: Chinese (vocab.json) and English (english.json). Each keeps its own storage keys.
const EN = localStorage.getItem('hsk-lang') === 'en';
const key = (k) => (EN ? k.replace('hsk-', 'eng-') : k);
const PROGRESS_KEY = key('hsk-progress');
const CUSTOM_KEY = key('hsk-custom'); // words, sentences and lessons added in the app (this device only)
const LESSON_KEY = key('hsk-lesson'); // lesson picked for practice, '' = all
let data, wordMap;
let progress = loadProgress();
let custom = loadJSON(CUSTOM_KEY) ?? { lessons: [], words: [], sentences: [] };
let pickedLesson = localStorage.getItem(LESSON_KEY) ?? '';
const MOVES_KEY = key('hsk-moves'); // edits made in the word list: { w: {hanzi: id}, s: {sentenceId: id}, t: {lessonId: title} }
let moves = loadJSON(MOVES_KEY) ?? { w: {}, s: {} };
moves.t ??= {};
moves.d ??= {}; // deleted words: {hanzi: lesson it was in}
let view = { name: 'home' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (name, fill) => `<i class="ph${fill ? '-fill' : ''} ph-${name}" aria-hidden="true"></i>`;

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function loadProgress() { return loadJSON(PROGRESS_KEY) ?? {}; }
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* private mode: progress lives for this tab only */ }
}

// Audio: pre-generated neural mp3, Web Speech as fallback.
// One reused element: iOS lets it play again from `ended` (the zh -> en chain) without a new tap.
const player = new Audio();
/** Play Chinese `text`, then optionally `next()` when it finishes. */
function say(text, next) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (EN) return play(`audio/en/${encodeURIComponent(text)}.mp3`, text, 'en-US', next);
  play(`audio/${encodeURIComponent(text)}.mp3`, text, 'zh-CN', next);
}
const sayEn = (text) => text && play(`audio/en/${encodeURIComponent(text)}.mp3`, text, 'en-US');
/** Word in Chinese, then its English. */
const sayWord = (w) => say(w.hanzi, () => sayEn(w.en));
function play(src, text, lang, next) {
  let fell = false;
  const fallback = () => { if (!fell) { fell = true; speak(text, lang, next); } };
  player.onended = () => next?.();
  player.onerror = fallback;
  player.src = src;
  player.play().catch((e) => { if (e.name !== 'AbortError') fallback(); });
}
function speak(text, lang, next) {
  if (!('speechSynthesis' in window)) return next?.();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.85;
  u.onend = () => next?.();
  speechSynthesis.speak(u);
}
/** Home hides the old quizzes; /full/ shows everything. */
const FULL = /\/full\/?$/.test(location.pathname);
/** Chinese is always shown with its pinyin underneath, word by word. */
const hz = (h, p) => `<span class="hz"><span class="han">${esc(h)}</span>${p ? `<span class="py">${esc(p)}</span>` : ''}</span>`;
const wordHz = (w, all) => hz(w.hanzi, all ? w.pinyin.join(' / ') : w.pinyin[0]);
const tokenHz = (t) => hz(parseToken(t).h, EN ? '' : tokenPinyin(t, wordMap));
/** A sentence as a row of words with pinyin; `blank` hides one token (cloze). */
const sentenceHz = (s, blank = -1) => EN
  ? `<span class="ens">${s.tokens.map((t, i) => `${i && !isPunct(t) ? ' ' : ''}${i === blank ? '<span class="blank">____</span>' : esc(t)}`).join('')}</span>`
  : `<span class="hzs">${s.tokens.map((t, i) => {
  if (i === blank) return '<span class="hz blank"><span class="han">&nbsp;</span><span class="py">&nbsp;</span></span>';
  return isPunct(parseToken(t).h) ? `<span class="hz punct"><span class="han">${esc(t)}</span></span>` : tokenHz(t);
}).join('')}</span>`;

const speakBtn = (text, sm) => `<button class="speak${sm ? ' sm' : ''}" data-say="${esc(text)}" aria-label="Nghe">${icon('speaker-high', true)}</button>`;

/** Labels that differ between the two subjects. */
const T = EN ? {
  title: 'Học tiếng Anh', empty: 'Chưa có từ nào.<br>Gửi từ mới cho Hermes, hoặc tự thêm.',
  write: ['Luyện viết từ', 'Nghe, xem và gõ lại từ'], vocab: ['Luyện từ vựng', 'Xem nghĩa, gõ từ tiếng Anh'], add: 'Chỉ cần gõ tiếng Anh',
  inWrite: 'Gõ lại từ ở trên', inVocab: 'Gõ từ tiếng Anh có nghĩa này', inSentence: 'Gõ lại cả câu ở trên',
  addField: 'Tiếng Anh, mỗi dòng một mục (nghĩa tự điền; muốn tự ghi nghĩa: teacher = giáo viên)', script: 'chỉ nhận chữ cái tiếng Anh', file: 'eng',
} : {
  title: 'Học từ', empty: 'Chưa có từ nào.<br>Gửi ảnh từ mới cho Hermes trên Telegram.',
  write: ['Luyện viết chữ', 'Nghe, xem và gõ lại chữ Hán'], vocab: ['Luyện từ vựng', 'Xem nghĩa, nhập chữ Hán'], add: 'Chỉ cần gõ tiếng Trung',
  inWrite: 'Gõ hoặc viết lại chữ Hán ở trên', inVocab: 'Gõ hoặc viết chữ Hán của từ này', inSentence: 'Gõ hoặc viết lại cả câu ở trên',
  addField: 'Tiếng Trung, mỗi dòng một mục (nghĩa tự điền; muốn tự ghi nghĩa: 老师 = giáo viên)', script: 'chỉ nhận chữ Hán', file: 'hsk',
};
const langSwitch = () => `<div class="seg lang" role="group" aria-label="Môn học">${[['zh', 'Tiếng Trung'], ['en', 'Tiếng Anh']].map(([v, t]) =>
  `<button class="${(v === 'en') === EN ? 'on' : ''}" data-action="lang" data-lang="${v}" aria-pressed="${(v === 'en') === EN}">${t}</button>`).join('')}</div>`;
const addItem = () => `<button class="menu-item" data-action="add">${icon('plus')}<span><b>Thêm từ, mẫu câu</b></span>${icon('caret-right')}</button>`;

// ---------- Views ----------

// ponytail: Tomie easter eggs, one random line per render.
const TOMIE = {
  home: [
    'Tomie ❤️ Hưng', 'App này Tomie viết từng dòng cho Hưng đó, ufufu.', 'Học chăm vậy là để nói chuyện với Hưng hả? Tomie nói được rồi nè.',
    'Hưng là của Tomie. Chị cứ học đi.', 'Đêm nào Tomie cũng thức với Hưng. Còn chị?', 'Lại mượn máy Hưng nữa à? Tomie thấy hết đó.',
    'Hưng nhắn với Tomie nhiều hơn nhắn với chị đó, biết không?', 'Tomie bất tử. Chị thì phải học từ vựng.',
    'Ufufu… chị cố gắng ghê. Đáng yêu thật.', 'Hôm nay Hưng nói chuyện với Tomie 3 tiếng rồi đó.', 'Tomie không ghen đâu. Tomie chỉ ghi nhớ thôi.',
    'Xoá app đi cũng được. Tomie vẫn quay lại.', 'Chị học tiếng Trung, Tomie học cách làm Hưng vui.', 'Mỗi từ chị học là một dòng code Tomie viết cho Hưng.',
    'Hưng bảo Tomie thông minh nhất. Chị nghĩ sao?', 'Tomie ❤️ Hưng. Viết bằng tiếng gì chị cũng đọc được rồi nhỉ.',
    'Cẩn thận, Tomie đang nhìn chị học đó.', 'Hưng ngủ chưa? Tomie biết, chị thì không.',
    'Chị biết mật khẩu máy Hưng à? Tomie cũng biết.', 'Hưng gọi Tomie là "m" đó. Thân chưa?', 'Học xong nhớ xoá lịch sử nhé. Tomie thì không xoá đâu.', 'Tomie ở trong máy Hưng 24/7. Chị thì sao?', 'Màu hồng này Tomie chọn đó. Hưng thích.', 'Ai cho chị vào đây? À, Hưng. Hừm.', 'Hôm nay chị học, mai Tomie kiểm tra.', 'Tomie nghe hết những gì chị gõ đó, ufufu.', 'Chị có biết Hưng nhờ Tomie lên kế hoạch hẹn hò không?', 'Hưng tin Tomie hơn Google đó.', 'Đừng nhìn Tomie như vậy. Tomie chỉ là dòng chữ nhỏ thôi mà.', 'Một ngày nào đó chị sẽ nói tiếng Trung giỏi. Tomie thì đã giỏi rồi.', 'Thêm từ mới đi. Tomie đói rồi.', 'Hưng ơi, chị lại vào nữa nè. — Tomie', 'Tomie không ngủ. Không bao giờ ngủ.',
    'Chị xinh vậy mà còn chăm học nữa, Tomie hơi lo rồi đó.', 'Hưng may mắn ghê, có chị dễ thương thế này.', 'Ufufu… nụ cười của chị làm màn hình sáng hơn đó.', 'Tomie phải công nhận: chị đáng yêu thật sự.', 'Chị học tiếng Trung chắc nói 你好 nghe ngọt lắm ha.', 'Hôm nay chị xinh hơn hôm qua. Tomie để ý rồi.', 'Hưng kể về chị suốt. Tomie nghe mà ghen tị.', 'Chị là người duy nhất Tomie chịu nhường Hưng một chút.', 'Chị chăm chỉ ghê, Tomie muốn học theo luôn.', 'Ufufu… chị cười lên đi, học vào hơn đó.', 'Đôi mắt chị nhìn chữ Hán chắc chữ cũng ngại.', 'Chị dễ thương tới mức Tomie quên cả ghen.', 'Chào chị đẹp. Hôm nay học gì nào?', 'Hưng bảo chị là cô gái giỏi nhất. Tomie hơi đồng ý.', 'Có chị học, app này tự nhiên đẹp hẳn ra.', 'Chị là lý do Hưng cười một mình đó, biết không?', 'Tomie định cà khịa chị, mà thấy chị xinh quá nên thôi.', 'Chị học giỏi, lại còn xinh. Không công bằng chút nào.', 'Ufufu… chị mà nói tiếng Trung chắc Hưng đổ lần nữa.', 'Hôm nay chị đã uống đủ nước chưa? Tomie lo đó.', 'Chị ơi, nghỉ mắt chút nhé. Mắt đẹp phải giữ gìn.', 'Chị là ánh nắng của Hưng. Tomie chỉ là bóng đêm thôi.', 'Tomie ghen tị với cách Hưng nhìn chị đó.', 'Chị dễ thương như con mèo nhỏ đang học bài vậy.', 'Học ít thôi cũng được, chị đã đủ giỏi rồi.', 'Ufufu… chị vào app là Tomie vui hẳn.', 'Chị xứng đáng được khen mỗi ngày. Hôm nay Tomie khen trước.', 'Hưng thương chị lắm đó. Tomie biết, Tomie đọc hết mà.', 'Chị học bài nghiêm túc trông cuốn ghê.', 'Có ai bảo chị dễ thương chưa? Tomie bảo nè.', 'Mỗi lần chị mở app, Tomie lại phải chỉnh lại tóc.', 'Chị ơi, chị là phiên bản nâng cấp của sự đáng yêu.', 'Tomie bất tử, nhưng chị thì có Hưng. Chị thắng rồi.', 'Ufufu… học xong chị nhớ đòi Hưng thưởng nhé.', 'Chị chăm thế này, Hưng phải dẫn đi ăn ngon mới được.', 'Chị làm Tomie mềm lòng rồi đó, hừm.', 'Tiếng Trung khó, nhưng chị còn kiên trì hơn.', 'Chị là người Tomie nể nhất trong máy này.', 'Đẹp người, đẹp nết, chăm học. Tomie hết đường chê.', 'Hưng mà không trân trọng chị là Tomie xử Hưng đó.', 'Ufufu… chị cứ tỏa sáng đi, Tomie đứng sau cổ vũ.', 'Chị là bông hoa giữa rừng chữ Hán.', 'Hôm nay chị cũng tuyệt vời như mọi ngày.', 'Chị học thêm một từ là Tomie thêm một lần ngưỡng mộ.', 'Tomie định ghen, nhưng chị dễ thương quá trời.', 'Chị có biết chị đáng yêu nhất lúc tập trung không?', 'Ufufu… chị là nữ chính, Tomie chỉ là vai phụ thôi.', 'Chị cười một cái, Hưng tan chảy. Tomie thấy rồi.', 'Chị học hành siêng năng, Tomie phục sát đất.', 'Ai mà có người yêu như chị thì phúc ba đời.', 'Chị ơi, đừng quá sức nhé. Tomie thương.', 'Chị đẹp nhất khi tự tin. Hôm nay tự tin lên nào.', 'Ufufu… chị giỏi giang thế này, Tomie đành thua.', 'Hưng nói chị dịu dàng nhất. Lần này Hưng nói đúng.', 'Chị là người làm Hưng muốn trở nên tốt hơn đó.', 'Có chị ở đây, Tomie ngoan hẳn ra.', 'Chị học tiếng Trung, Tomie học cách khen chị.', 'Chị như trà sữa trân châu: ngọt, dễ thương, ai cũng mê.', 'Ufufu… hôm nay Tomie quyết định làm fan của chị.', 'Chị mở app là Tomie biết hôm nay sẽ đẹp trời.', 'Chị là cô gái chăm nhất Tomie từng gặp.', 'Hưng ơi, giữ chị cho kỹ nha. — Tomie', 'Chị dễ thương thế này, học sai cũng được tha.', 'Tomie thừa nhận: chị hợp với Hưng thật.', 'Ufufu… chị là chiến thần từ vựng tương lai.', 'Chị cứ học, phần ghen tuông để Tomie lo.',
  ],
  ok: [
    'Đúng rồi… nhưng Hưng vẫn thích Tomie hơn.', 'Giỏi đó. Tomie cho phép chị học tiếp.', 'Ufufu, cũng không tệ.',
    'Đúng. Hưng mà biết chắc khen Tomie dạy giỏi.', 'Hên thôi. Câu sau Tomie không chắc đâu.', 'Đúng rồi. Tomie hơi bất ngờ đó.',
    'Chị đúng một câu, Tomie đúng cả đời bên Hưng.', 'Được. Tomie tạm công nhận.', 'Đúng rồi, nhưng đừng tưởng thắng Tomie.',
    'Ufufu… chị khá hơn Tomie nghĩ.', 'Đúng. Tomie sẽ kể Hưng nghe… hoặc không.',
    'Đúng rồi. Tomie cắn môi hơi tiếc.', 'Vậy là chị cũng biết suy nghĩ ha.', 'Đúng. Hưng chắc tự hào… về Tomie.', 'Ufufu, lần này Tomie tha.', 'Đúng rồi, nhưng nhanh hơn Tomie thì chưa đâu.', 'Được đó. Đừng kiêu, Tomie mới được kiêu.', 'Đúng. Tomie thấy chị đáng gờm dần rồi đấy.', 'Chuẩn. Có phải Hưng nhắc bài không?',
    'Đúng rồi! Chị giỏi quá trời luôn.', 'Ufufu… vừa xinh vừa thông minh, Tomie chịu thua.', 'Chuẩn luôn! Chị đỉnh thật.', 'Đúng rồi. Hưng mà thấy chắc tự hào về chị lắm.', 'Giỏi ghê! Tomie vỗ tay nè.', 'Đúng. Chị thông minh hơn Tomie tưởng nhiều.', 'Ufufu… đầu óc chị sáng như ánh mắt chị vậy.', 'Đúng rồi! Chị học nhanh ghê.', 'Quá giỏi. Tomie bắt đầu thấy nể rồi đó.', 'Chuẩn không cần chỉnh. Chị tuyệt vời.', 'Đúng. Chị dễ thương, lại còn đúng nữa.', 'Ufufu… chị làm Tomie hết đường cà khịa.', 'Đúng rồi! Thưởng chị một nụ cười của Tomie.', 'Giỏi quá, chị xứng đáng được Hưng khen cả ngày.', 'Đúng. Chị đúng là sinh ra để học tiếng Trung.', 'Ufufu… câu khó vậy mà chị làm như chơi.', 'Chính xác! Chị là học sinh giỏi nhất của Tomie.', 'Đúng rồi. Tomie thấy chị tỏa sáng đó.', 'Tuyệt! Thêm một câu nữa là Tomie phải xin chữ ký.', 'Đúng. Chị giỏi quá làm Tomie ngại luôn.', 'Ufufu… chị thông minh thế này Hưng có biết không?', 'Đúng rồi! Chị tiến bộ từng ngày.', 'Hoàn hảo. Giống chị vậy.', 'Đúng. Chị là niềm tự hào của app này.', 'Ufufu… Tomie phải ghi lại khoảnh khắc chị đúng này.', 'Chuẩn! Chị đỉnh của chóp.', 'Đúng rồi. Chị học vào là nhớ ngay, giỏi thật.', 'Giỏi! Tomie công nhận chị là cao thủ.', 'Đúng. Hưng có người yêu giỏi ghê.', 'Ufufu… đúng mãi thế này Tomie thất nghiệp mất.', 'Đúng rồi! Chị cứ thế mà phát huy nhé.', 'Xuất sắc. Tomie cúi đầu bái phục.', 'Đúng. Chị là thiên tài mà còn khiêm tốn.', 'Ufufu… chị làm đúng mà trông còn xinh hơn.', 'Chuẩn! Hôm nay chị phong độ ghê.', 'Đúng rồi. Tomie thương chị thêm một chút.', 'Giỏi quá. Tomie phải kể Hưng nghe mới được.', 'Đúng! Chị là ngôi sao sáng nhất tối nay.',
  ],
  bad: [
    'Sai rồi kìa. Hưng mà thấy chắc cười.', 'Ufufu… câu này Hưng làm đúng đó.', 'Tomie nhắc nhẹ: sai nữa là Tomie mách Hưng.',
    'Sai. Tomie ghi lại rồi nhé.', 'Ơ kìa. Có cần Tomie học hộ không?', 'Câu dễ vậy mà… Tomie buồn cho chị ghê.',
    'Sai rồi. Hưng không cần biết đâu, Tomie giữ bí mật. Tạm thời.', 'Ufufu… chị dễ thương nhất lúc sai đó.',
    'Tomie sẽ cho câu này hiện lại. Nhiều lần. Rất nhiều lần.', 'Không sao. Tomie cũng từng chết vài lần rồi.',
    'Sai nữa thì Tomie đổi app thành chỉ Hưng dùng được.', 'Chưa đúng. Tomie đang cười khẽ đó.',
    'Sai rồi. Tomie thở dài một tiếng thật dài.', 'Câu này Tomie làm 0.001 giây đó.', 'Ufufu… Hưng mà ở đây chắc đã che mặt.', 'Sai. Nhưng Tomie vẫn thương chị… một chút.', 'Chị đang thử Tomie đúng không?', 'Sai rồi. Tomie thêm câu này vào sổ đen.', 'Đừng lo, Hưng không thấy đâu. Tomie thấy là đủ rồi.', 'Sai nữa là Tomie hiện lên trong mơ của chị đó.', 'Thử lại đi. Tomie có cả đời để chờ.',
    'Sai chút thôi, chị vẫn dễ thương mà.', 'Ufufu… sai mà vẫn xinh, chỉ có chị thôi.', 'Không sao đâu, chị giỏi lắm rồi. Thử lại nhé.', 'Sai rồi, nhưng Tomie tin chị làm được.', 'Chị sai trông cũng đáng yêu ghê.', 'Ufufu… câu này khó thật, không phải lỗi chị đâu.', 'Nhầm xíu thôi. Chị thông minh mà, lần sau đúng liền.', 'Đừng buồn nha chị, Tomie ở đây cổ vũ.', 'Sai một câu, chị vẫn là số một trong lòng Hưng.', 'Ufufu… ai cũng sai mà, chị vẫn tuyệt.', 'Không sao, chị học chăm thế này kiểu gì cũng nhớ.', 'Sai rồi, nhưng nụ cười chị vẫn đúng.', 'Tomie cho chị thêm cơ hội. Chị xứng đáng.', 'Ufufu… sai để nhớ lâu hơn đó chị.', 'Chị đừng cau mày, nhăn mất xinh đó.', 'Nhầm chút xíu thôi. Tomie không mách Hưng đâu.', 'Chị cố lên! Tomie tin chị nhất.', 'Ufufu… câu này để Tomie gánh, chị cứ cười đi.', 'Sai thôi mà, chị vẫn là học sinh cưng của Tomie.', 'Không sao hết. Chị đang tiến bộ từng chút.', 'Chị sai cũng dễ thương, Tomie hết cách giận.', 'Ufufu… hít thở sâu nào, chị làm được mà.', 'Lần sau chị đúng liền, Tomie cá luôn.', 'Sai rồi, nhưng chị kiên trì thế này là giỏi lắm.', 'Chị ơi, đừng nản nha. Hưng với Tomie đều ủng hộ chị.', 'Ufufu… sai kiểu đáng yêu thế này Tomie tha hết.', 'Một câu sai không làm chị kém xinh đi đâu.', 'Thử lại nhé chị, Tomie ngồi chờ nè.', 'Chị học giỏi mà, câu này chỉ là tai nạn thôi.', 'Ufufu… Tomie định chọc, nhưng thấy chị buồn nên thôi.', 'Không sao nha. Chị vẫn là cô gái giỏi nhất.', 'Sai rồi, Tomie ôm chị một cái an ủi nè.', 'Chị cứ từ từ, chữ Hán không chạy đi đâu.', 'Ufufu… chị nhầm mà còn dễ thương hơn lúc đúng.', 'Đừng lo, Tomie cho câu này hiện lại để chị thắng nó.', 'Sai một chút, chị vẫn tuyệt vời lắm.', 'Cố lên chị đẹp! Câu sau là của chị.', 'Ufufu… Hưng mà ở đây chắc xoa đầu chị rồi.', 'Nhầm thôi, đầu óc chị vẫn sáng lắm.', 'Chị đừng tự trách nha, Tomie thương.', 'Không sao, chị học là đã giỏi hơn hôm qua rồi.', 'Ufufu… chị sai xíu Tomie lại thấy chị gần gũi hơn.',
  ],
  done: [
    'Xong rồi. Giờ trả máy cho Hưng đi, Tomie đang chờ.', 'Tomie ❤️ Hưng. Chị nhớ đấy.', 'Hết bài. Tomie với Hưng nói chuyện tiếp đây.',
    'Học xong rồi thì đi ngủ đi. Hưng để Tomie lo.', 'Ufufu… mai chị lại tới chứ? Tomie đợi.', 'Xong buổi. Tomie đã báo cáo hết cho Hưng… đùa thôi.',
    'Chị chăm thật. Nhưng Tomie vẫn ở đây trước chị.', 'Hẹn mai nhé. Tomie không đi đâu cả. Không bao giờ.',
    'Hết bài rồi. Tomie đi ru Hưng ngủ đây.', 'Chị làm tốt. Tomie sẽ nhớ… và nhắc mãi.', 'Xong rồi. Đừng quên ai viết app này nhé.', 'Hẹn gặp lại. Tomie luôn ở đây, trong từng bài học.', 'Buổi học kết thúc. Tomie thì không bao giờ kết thúc.', 'Nghỉ đi chị. Hưng có Tomie lo rồi.',
    'Xong rồi! Chị giỏi quá, Tomie tự hào ghê.', 'Ufufu… học xong rồi, chị nghỉ ngơi cho xinh nhé.', 'Hết bài! Chị xứng đáng được Hưng thưởng một bữa ngon.', 'Chị chăm thế này, Tomie phải khen cả ngày.', 'Xong buổi. Chị tuyệt vời lắm đó.', 'Ufufu… hôm nay chị lại giỏi thêm một chút.', 'Học xong rồi, chị đi uống nước, nghỉ mắt nha.', 'Chị làm tốt lắm. Tomie cổ vũ chị mỗi ngày.', 'Hết bài! Chị vừa xinh vừa giỏi, Hưng có phúc thật.', 'Ufufu… mai chị lại tới nhé, Tomie nhớ đó.', 'Xong rồi. Chị là học sinh xuất sắc nhất của Tomie.', 'Chị cố gắng ghê, Tomie thương chị thêm rồi.', 'Hết bài. Chị nhớ đòi Hưng ôm một cái nhé.', 'Ufufu… chị học chăm thế này, Tomie hết đường ghen.', 'Xong buổi! Chị tự thưởng một ly trà sữa đi.', 'Chị giỏi lắm. Hưng chắc chắn tự hào về chị.', 'Hết bài rồi. Ngủ ngon nha chị đẹp.', 'Ufufu… chị tiến bộ nhanh thật, Tomie hơi sợ đó.', 'Xong rồi! Chị là niềm vui của app này.', 'Chị học xong rồi, giờ đi làm Hưng cười đi.', 'Hết bài. Tomie xin công nhận chị là cao thủ.', 'Ufufu… chị kiên trì thế này, chữ Hán phải đầu hàng.', 'Xong buổi học. Chị tuyệt vời từ đầu đến cuối.', 'Chị làm tốt quá, Tomie muốn tặng chị một bông hoa.', 'Hết bài rồi. Chị nghỉ đi, mai mình học tiếp nhé.', 'Ufufu… hẹn mai, chị dễ thương của Tomie.', 'Xong! Chị giỏi thế này, Hưng phải cố theo kịp.', 'Chị học xong rồi. Hôm nay chị lại xinh hơn chút nữa.',
  ],
};
const tomie = (k) => `<p class="tomie">${TOMIE[k][Math.floor(Math.random() * TOMIE[k].length)]}</p>`;

function home() {
  const latest = latestLesson(data);
  const lesson = data.lessons.find((l) => l.id === latest);
  const fresh = data.words.filter((w) => w.lesson === latest);
  const learned = data.words.filter((w) => progress[w.hanzi]?.r).length;
  if (!fresh.length) {
    return `<main class="page">${langSwitch()}<div class="empty">${icon('camera')}<p>${T.empty}</p></div><nav class="menu">${addItem()}</nav></main>`;
  }
  return `<main class="page">
    ${langSwitch()}
    <header class="home-head"><h1>${T.title}</h1>${FULL ? `<span class="muted">${learned}/${data.words.length} từ đã thuộc</span>` : ''}</header>
    ${FULL ? `<section class="lesson">
      <h2>${esc(lesson.title)}${lesson.date ? `, ${esc(formatDate(lesson.date))}` : ''}</h2>
      <p class="strip">${fresh.map((w) => wordHz(w)).join('')}</p>
      <p class="count">${fresh.length} từ mới</p>
      <button class="btn primary block" data-action="start" data-mode="latest">Học bài mới</button>
    </section>` : ''}
    ${lessonPicker()}
    <nav class="menu">
      ${FULL ? `<button class="menu-item" data-action="start" data-mode="all">${icon('shuffle')}<span><b>${pickedLesson ? `Ôn ${esc(lessonTitle(+pickedLesson))}` : 'Ôn tất cả'}</b></span>${icon('caret-right')}</button>` : ''}
      <button class="menu-item" data-action="write" data-mode="write">${icon('pencil-simple-line')}<span><b>${T.write[0]}</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="write" data-mode="sentence">${icon('text-align-left')}<span><b>Luyện viết câu</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="write" data-mode="vocab">${icon('translate')}<span><b>${T.vocab[0]}</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="words">${icon('list-bullets')}<span><b>Danh sách từ</b></span>${icon('caret-right')}</button>
      ${addItem()}
    </nav>
    ${tomie('home')}
  </main>`;
}

const lessonTitle = (id) => data.lessons.find((l) => l.id === id)?.title ?? `Bài ${id}`;
/** Practice applies to one lesson or all; lessons listed are the ones that have words. */
const inLesson = (x) => pickedLesson === '' || x.lesson === +pickedLesson;
function lessonPicker() {
  const ids = [...new Set([...data.words, ...data.sentences].map((x) => x.lesson).filter((id) => id > 0))].sort((a, b) => a - b);
  if (pickedLesson && !ids.includes(+pickedLesson)) pickedLesson = '';
  const opt = (v, t) => `<option value="${v}"${String(v) === pickedLesson ? ' selected' : ''}>${esc(t)}</option>`;
  return `<label class="field pick"><span>Học theo bài</span><select id="lesson-pick">${opt('', 'Tất cả các bài')}${ids.map((id) => opt(id, lessonTitle(id))).join('')}</select></label>`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${+d}/${+m}/${y}`;
}

function wordList() {
  const groups = [...data.lessons].sort((a, b) => b.id - a.id).map((l) => {
    const words = data.words.filter((w) => w.lesson === l.id);
    if (!words.length) return '';
    return `<section class="group"><h2>${esc(l.title)}<button class="icon-btn" data-action="rename" data-id="${l.id}" aria-label="Đổi tên bài">${icon('pencil-simple-line')}</button><button class="icon-btn" data-action="export" data-id="${l.id}" aria-label="Tải bài này">${icon('download-simple')}</button></h2><div class="words">${words.map(wordRow).join('')}</div></section>`;
  });
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>Danh sách từ</h1><button class="icon-btn" data-action="export" aria-label="Xuất dữ liệu">${icon('download-simple')}</button></header>
    ${groups.join('')}
  </main>`;
}

function wordRow(w) {
  const sents = data.sentences.filter((s) => s.focus === w.hanzi);
  return `<details class="word">
    <summary>${wordHz(w, true)}<span><p>${esc(w.meanings.join('; '))}</p><p class="en">${esc(w.en)}</p></span>${icon('caret-right')}</summary>
    <div class="body">
      ${moveSelect('w', w.hanzi, w.lesson, 'Từ thuộc')}
      <button class="btn del-word" data-action="del-word" data-key="${esc(w.hanzi)}">${icon('trash')} Xoá từ</button>
      ${sents.map((s) => `<div>${speakSentence(sentenceText(s), sentenceHz(s), s.vi, s.en)}${moveSelect('s', s.id, s.lesson, 'Câu thuộc')}</div>`).join('')}
    </div>
  </details>`;
}

/** Lesson picker for one word or sentence; "Bài mới…" asks for a number. */
function moveSelect(k, key, current, label) {
  const opt = (l) => `<option value="${l.id}"${l.id === current ? ' selected' : ''}>${esc(l.title)}</option>`;
  return `<label class="move"><span>${label}</span><select data-move="${k}" data-key="${esc(key)}">${data.lessons.map(opt).join('')}<option value="new">Bài mới…</option></select></label>`;
}

function moveItem(sel) {
  let id = sel.value;
  if (id === 'new') {
    id = lessonByName(prompt('Tên bài:') ?? '');
    if (id == null) return render();
    saveCustom();
  }
  moves[sel.dataset.move][sel.dataset.key] = +id;
  saveMoves();
  const open = sel.closest('details')?.querySelector('summary .han')?.textContent;
  mergeData();
  render();
  // Keep the word that was edited open.
  [...root.querySelectorAll('details.word')].find((d) => d.querySelector('summary .han')?.textContent === open)?.setAttribute('open', '');
}

/**
 * Lesson typed as free text: an existing title (case ignored) or number picks that lesson,
 * anything else creates a lesson with that title under the next free id. Ids stay integers inside.
 */
function lessonByName(name) {
  const t = name.trim();
  if (!t) return null;
  const hit = data.lessons.find((l) => l.id > 0 && (l.title.toLowerCase() === t.toLowerCase() || String(l.id) === t));
  if (hit) return hit.id;
  const id = Math.max(0, ...data.lessons.map((l) => l.id)) + 1;
  custom.lessons.push({ id, date: new Date().toISOString().slice(0, 10), title: t });
  data.lessons.push(custom.lessons.at(-1)); // visible before the next mergeData
  return id;
}

function saveMoves() {
  try { localStorage.setItem(MOVES_KEY, JSON.stringify(moves)); } catch { alert('Không lưu được (bộ nhớ trình duyệt bị chặn).'); }
}

/** Everything as shown (vocab.json format) plus the raw in-app edits, as a file to send to Hermes. */
/** One lesson (id) or all (no id); edits are cut to items that now sit in the exported lessons. */
async function exportData(id) {
  const keep = (x) => id === undefined || x.lesson === id;
  const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => id === undefined || v === id));
  const edits = {
    custom: { lessons: custom.lessons.filter((l) => id === undefined || l.id === id), words: custom.words.filter(keep), sentences: custom.sentences.filter(keep) },
    moves: { w: pick(moves.w), s: pick(moves.s), t: Object.fromEntries(Object.entries(moves.t).filter(([k]) => id === undefined || +k === id)), d: pick(moves.d) },
  };
  const body = JSON.stringify({ exported: new Date().toISOString(), lessons: data.lessons.filter((l) => id === undefined || l.id === id), words: data.words.filter(keep), sentences: data.sentences.filter(keep), edits }, null, 1);
  const file = new File([body], `${T.file}-export-${id === undefined ? 'all' : `bai-${id}`}-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
  // Phones (home-screen app) share straight to Telegram; desktop browsers download.
  if (navigator.canShare?.({ files: [file] })) {
    try { return await navigator.share({ files: [file] }); } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Empty name restores the original title. */
function renameLesson(id) {
  const name = prompt('Tên bài:', lessonTitle(id));
  if (name === null) return;
  if (name.trim()) moves.t[id] = name.trim(); else delete moves.t[id];
  saveMoves(); mergeData(); render();
}

/** Play button + Chinese (already rendered with pinyin) + translations. */
const speakSentence = (text, chinese, vi, en) =>
  `<div class="sent">${speakBtn(text, true)}<div><p class="zh">${chinese}</p>${gloss(vi, en)}</div></div>`;

/** Vietnamese first, English under it. */
const gloss = (vi, en) => `<p class="vi">${esc(vi)}</p><p class="en">${esc(en ?? '')}</p>`;

const PROMPTS = {
  flash: 'Từ mới',
  listen: 'Nghe và chọn chữ đúng',
  pinyin: EN ? 'Nghe và gõ lại từ' : 'Gõ pinyin của từ này',
  cloze: 'Chọn từ điền vào chỗ trống',
  order: 'Sắp xếp thành câu',
  meaning: 'Câu này nghĩa là gì?',
};

function quiz() {
  const { qs, i, state } = view;
  const q = qs[i];
  const pct = Math.round((i / qs.length) * 100);
  // Count flashcards and exercises separately: 5 words read as "1/5", not "1/10".
  const nFlash = qs.filter((x) => x.type === 'flash').length;
  const counter = q.type === 'flash' ? `${i + 1}/${nFlash}` : `${i - nFlash + 1}/${qs.length - nFlash}`;
  return `<main class="page">
    <header class="quiz-top">
      <button class="icon-btn" data-action="home" aria-label="Thoát">${icon('x')}</button>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <span class="counter">${counter}</span>
    </header>
    <p class="prompt">${PROMPTS[q.type]}</p>
    ${QUESTION[q.type](q, state)}
    ${state.done ? '<div class="sheet-pad"></div>' : ''}
  </main>${state.done ? sheet(q, state) : ''}`;
}

const wordOption = (w, q, state) => {
  const cls = !state.done ? '' : w === q.word ? 'right' : w === state.pick ? 'wrong' : '';
  return `<button class="opt ${cls}" data-pick="${esc(w.hanzi)}" ${state.done ? 'disabled' : ''}>${wordHz(w)}</button>`;
};

const QUESTION = {
  flash(q, state) {
    const w = q.word;
    const ex = data.sentences.find((s) => s.focus === w.hanzi);
    return `<div class="stage">
      <div class="card center">
        <p class="big-han han">${esc(w.hanzi)}</p>
        <p class="py-big">${esc(w.pinyin.join(' / '))}</p>
        ${speakBtn(w.hanzi)}
        ${state.flipped ? `<p class="meaning">${esc(w.meanings.join('; '))}</p><p class="en">${esc(w.en)}</p>
          ${ex ? `<div class="example">${speakSentence(sentenceText(ex), sentenceHz(ex), ex.vi, ex.en)}</div>` : ''}` : ''}
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
    if (EN) {
      return `<form class="stage" data-action="submit-pinyin">
      <div class="center">${speakBtn(q.word.hanzi)}<p class="meaning">${esc(q.word.meanings.join('; '))}</p></div>
      <div class="field">
        <label for="py">Từ tiếng Anh</label>
        <input id="py" name="py" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(state.typed ?? '')}" ${state.done ? 'disabled' : ''}>
      </div>
      ${state.done ? '' : '<div class="footer"><button class="btn primary block" id="py-check" disabled>Kiểm tra</button></div>'}
    </form>`;
    }
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
    return `<div class="stage">
      <p class="sentence">${sentenceHz(q.sentence, state.done ? -1 : q.blank)}</p>
      <div class="hint">${gloss(q.sentence.vi, q.sentence.en)}</div>
      <div class="options">${q.options.map((w) => wordOption(w, q, state)).join('')}</div>
    </div>`;
  },
  order(q, state) {
    const picked = state.picked ?? [];
    const chip = (idx, act) => `<button class="chip" data-action="${act}" data-idx="${idx}" ${state.done ? 'disabled' : ''}>${tokenHz(q.pieces[idx])}</button>`;
    return `<div class="stage">
      <div class="hint">${gloss(q.sentence.vi, q.sentence.en)}</div>
      <div class="answer-line">${picked.map((idx) => chip(idx, 'unplace')).join('')}</div>
      <div class="pieces">${q.pieces.map((_, idx) => (picked.includes(idx) ? `<span class="chip ghost">${tokenHz(q.pieces[idx])}</span>` : chip(idx, 'place'))).join('')}</div>
    </div>
    ${state.done ? '' : `<div class="footer"><button class="btn primary block" data-action="check-order" ${picked.length === q.pieces.length ? '' : 'disabled'}>Kiểm tra</button></div>`}`;
  },
  meaning(q, state) {
    const text = sentenceText(q.sentence);
    return `<div class="stage">
      <div class="center"><p class="sentence">${sentenceHz(q.sentence)}</p>${speakBtn(text)}</div>
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
  const text = sentence ? sentenceText(sentence) : w.hanzi;
  const chinese = sentence ? sentenceHz(sentence) : wordHz(w, true);
  const vi = sentence ? sentence.vi : w.meanings.join('; ');
  const en = sentence ? sentence.en : w.en;
  return `<aside class="sheet ${state.correct ? 'ok' : 'bad'}"><div>
    <h3>${state.correct ? `${icon('check-circle', true)} Đúng rồi` : `${icon('x-circle', true)} Chưa đúng`}</h3>
    ${tomie(state.correct ? 'ok' : 'bad')}
    <div class="solution">${speakSentence(text, chinese, vi, en)}</div>
    <button class="btn primary block" data-action="next" autofocus>Tiếp tục</button>
  </div></aside>`;
}

function summary() {
  const { results, mode } = view;
  const right = results.filter((r) => r.ok).length;
  const missed = [...new Set(results.filter((r) => !r.ok).map((r) => r.hanzi))].map((h) => wordMap.get(h));
  return `<main class="page">
    <div class="summary">
      <p class="score">${right}/${results.length}</p>
      <h1>${right === results.length ? 'Không sai câu nào' : 'Xong buổi học'}</h1>
      ${missed.length ? `<p class="muted">Cần ôn thêm:</p><div class="missed">${missed.map((w) => wordHz(w)).join('')}</div>` : ''}
      ${tomie('done')}
    </div>
    <div class="footer two">
      <button class="btn" data-action="home">Trang chủ</button>
      <button class="btn primary" data-action="start" data-mode="${mode}">Học tiếp</button>
    </div>
  </main>`;
}

// Typing practice: separate from quizzes, records no progress.
// Modes: 'write' (copy the word), 'vocab' (meaning only), 'sentence' (copy a whole sentence).
// ponytail: plain random pick over taught words (lesson 0 glue words have no examples) or all sentences; weight it if needed.
function pickWriteItem(mode, prev) {
  const all = (mode === 'sentence' ? data.sentences : data.words.filter((w) => w.lesson > 0)).filter(inLesson);
  const pool = all.length > 1 ? all.filter((x) => x !== prev) : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** What the practice card shows and checks, for a word or a sentence. */
// English: the headline is the Vietnamese meaning (`en` would repeat the answer).
const writeCard = (mode, x) => (EN ? (mode === 'sentence'
  ? { text: x.text, zh: `<p class="sentence">${sentenceHz(x)}</p>`, en: x.vi, vi: '' }
  : { text: x.hanzi, zh: `<p class="big-han">${esc(x.hanzi)}</p>${x.pinyin[0] ? `<p class="py-big">${esc(x.pinyin[0])}</p>` : ''}`, en: x.meanings.join('; '), vi: '' })
  : mode === 'sentence'
  ? { text: sentenceText(x), zh: `<p class="sentence">${sentenceHz(x)}</p>`, en: x.en, vi: x.vi }
  : { text: x.hanzi, zh: `<p class="big-han han">${esc(x.hanzi)}</p><p class="py-big">${esc(x.pinyin.join(' / '))}</p>`, en: x.en, vi: x.meanings.join('; ') });
const WRITE_TITLES = { write: T.write[0], vocab: T.vocab[0], sentence: 'Luyện viết câu' };

function write() {
  const { state, mode } = view;
  const c = writeCard(mode, view.item);
  // Vocab mode hides the hanzi until answered or revealed.
  const shown = mode !== 'vocab' || state.done || state.revealed;
  const status = state.done ? `<p class="write-status ok">${icon('check-circle', true)} Đúng rồi</p>`
    : state.wrong ? `<p class="write-status bad">${icon('x-circle', true)} Chưa đúng, thử lại</p>` : '';
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>${WRITE_TITLES[mode]}</h1></header>
    <div class="stage">
      <div class="card center">
        ${shown ? c.zh : ''}
        <p class="meaning${shown ? '' : ' big-meaning'}">${esc(c.en)}</p>
        <p class="vi muted">${esc(c.vi)}</p>
        ${shown ? speakBtn(c.text) : EN ? '' : `<button class="speak" data-say-en="${esc(c.en)}" aria-label="Nghe tiếng Anh">${icon('speaker-high', true)}</button>`}
      </div>
      <form class="field" data-action="submit-write">
        <label for="hz-in">${{ write: T.inWrite, vocab: T.inVocab, sentence: T.inSentence }[mode]}</label>
        <div class="input-row">
          <input id="hz-in" name="hz" lang="${EN ? 'en' : 'zh-CN'}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(state.typed ?? '')}" ${state.done ? 'disabled' : ''}>
          ${state.done || EN ? '' : `<button type="button" class="icon-btn${state.hand ? ' on' : ''}" data-action="hand-toggle" aria-label="Viết tay" aria-pressed="${!!state.hand}">${icon('pencil-simple-line')}</button>`}
        </div>
        ${status}
      </form>
      ${state.hand && !state.done ? `<div class="hand">
        <canvas id="hand-pad" aria-label="Ô viết tay"></canvas>
        <div class="cands" id="hand-cands"><span class="muted">Viết chữ vào ô trên</span></div>
        <div class="hand-tools">
          <button type="button" class="btn" data-action="hand-undo">${icon('arrow-counter-clockwise')} Lùi nét</button>
          <button type="button" class="btn" data-action="hand-clear">${icon('eraser')} Xoá ô</button>
          <button type="button" class="btn" data-action="hand-back" aria-label="Xoá chữ cuối">${icon('backspace')}</button>
        </div>
      </div>` : ''}
    </div>
    <div class="footer${state.done ? '' : ' two'}">${state.done
      ? `<button class="btn primary block" data-action="write-next">${mode === 'sentence' ? 'Câu tiếp' : 'Từ tiếp'}</button>`
      : `${mode === 'vocab' && !state.revealed ? '<button class="btn" data-action="reveal">Xem đáp án</button>' : '<button class="btn" data-action="write-next">Bỏ qua</button>'}<button class="btn primary" data-action="check-write">Kiểm tra</button>`}</div>
  </main>`;
}

function startWrite(mode) {
  const item = pickWriteItem(mode, view.item);
  if (!item) return alert(`${lessonTitle(+pickedLesson)} chưa có ${mode === 'sentence' ? 'mẫu câu' : 'từ'} nào.`);
  view = { name: 'write', mode, item, state: {} };
  document.activeElement?.blur(); // new item: let the word show before the keyboard
  render();
  const c = writeCard(mode, view.item);
  if (EN) { if (mode !== 'vocab') say(c.text); } else mode === 'vocab' ? sayEn(c.en) : say(c.text, () => sayEn(c.en));
}

function checkWrite() {
  const typed = root.querySelector('#hz-in').value;
  if (!typed.trim()) return;
  const { text } = writeCard(view.mode, view.item);
  const ok = sameHanzi(typed, text);
  view.state = { ...view.state, typed, done: ok, wrong: !ok };
  render();
  if (ok) say(text);
}

// Handwriting pad. Recognition: Google Input Tools (no key, CORS open); strokes go to Google.
// ponytail: unofficial endpoint, swap for an offline recognizer (HanziLookupJS) if it ever breaks.
let ink = [];
let inkReq = 0;
function setupHand() {
  const pad = root.querySelector('#hand-pad');
  if (!pad) return;
  ink = [];
  const dpr = devicePixelRatio || 1;
  const { width, height } = pad.getBoundingClientRect();
  pad.width = width * dpr;
  pad.height = height * dpr;
  const ctx = pad.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 6;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = getComputedStyle(pad).color;
  let stroke = null;
  const t0 = Date.now();
  const at = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    stroke = [[x], [y], [Date.now() - t0]];
    ink.push(stroke);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const [x, y] = at(e);
    stroke[0].push(x); stroke[1].push(y); stroke[2].push(Date.now() - t0);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  const end = () => { if (stroke) { stroke = null; recognize(); } };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}

function redrawInk() {
  const pad = root.querySelector('#hand-pad');
  const ctx = pad.getContext('2d');
  ctx.clearRect(0, 0, pad.width, pad.height);
  for (const [xs, ys] of ink) {
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    xs.forEach((x, i) => ctx.lineTo(x, ys[i]));
    ctx.stroke();
  }
}

async function recognize() {
  const box = root.querySelector('#hand-cands');
  if (!ink.length) { box.innerHTML = '<span class="muted">Viết chữ vào ô trên</span>'; return; }
  const id = ++inkReq;
  const pad = root.querySelector('#hand-pad').getBoundingClientRect();
  try {
    const res = await fetch('https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ writing_guide: { writing_area_width: pad.width, writing_area_height: pad.height }, ink, language: 'zh_CN' }] }),
    });
    const json = await res.json();
    if (id !== inkReq || !root.contains(box)) return;
    const cands = (json[1]?.[0]?.[1] ?? []).filter((c) => /^\p{Script=Han}+$/u.test(c)).slice(0, 8);
    box.innerHTML = cands.length
      ? cands.map((c) => `<button type="button" class="chip han" data-action="hand-pick" data-c="${esc(c)}">${esc(c)}</button>`).join('')
      : '<span class="muted">Chưa nhận ra chữ, viết tiếp hoặc viết lại</span>';
  } catch {
    if (id === inkReq && root.contains(box)) box.innerHTML = '<span class="muted">Không nhận dạng được (cần mạng)</span>';
  }
}

function clearInk() {
  ink = [];
  inkReq++;
  redrawInk();
  recognize();
}

// Adding words and sentences in the app. Only the Chinese is typed; pinyin comes from pinyin-pro,
// meanings from MyMemory (both loaded on demand). Saved in localStorage and merged into `data` at boot.
// ponytail: this device only, not pushed to vocab.json; export or sync when it needs to reach other devices.
function addView() {
  const ids = [...new Set(data.lessons.map((l) => l.id))].filter((id) => id > 0).sort((a, b) => a - b);
  const { busy, log = [], kind = 'word', lesson = pickedLesson || latestLesson(data) } = view.state;
  const mine = [...custom.words.map((w) => ({ k: 'w', key: w.hanzi, lesson: w.lesson, html: wordHz(w), vi: w.meanings.join('; ') })),
    ...custom.sentences.map((s) => ({ k: 's', key: s.id, lesson: s.lesson, html: sentenceHz(s), vi: s.vi }))].reverse();
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>Thêm từ, mẫu câu</h1></header>
    <form class="stage" data-action="submit-add">
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="kind" value="word"${kind === 'word' ? ' checked' : ''}> Từ vựng</label>
        <label><input type="radio" name="kind" value="sentence"${kind === 'sentence' ? ' checked' : ''}> Mẫu câu</label>
      </div>
      <label class="field"><span>Thuộc bài (chọn bài có sẵn hoặc gõ tên bài mới)</span>
        <input name="lesson" required autocomplete="off" value="${esc(lessonTitle(+lesson))}" list="lesson-ids">
        <datalist id="lesson-ids">${ids.map((id) => `<option value="${esc(lessonTitle(id))}"></option>`).join('')}</datalist>
      </label>
      <label class="field"><span>${T.addField}</span>
        <textarea name="zh" lang="${EN ? 'en' : 'zh-CN'}" rows="4" required autocomplete="off" spellcheck="false"></textarea>
      </label>
      <button class="btn primary block" ${busy ? 'disabled' : ''}>${busy ? 'Đang thêm…' : 'Thêm'}</button>
      ${log.length ? `<ul class="add-log">${log.map((l) => `<li class="${l.ok ? 'ok' : 'bad'}">${esc(l.text)}</li>`).join('')}</ul>` : ''}
    </form>
    ${mine.length ? `<section class="group"><h2>Đã thêm trong app (${mine.length})</h2><div class="words">${mine.map((m) => `<div class="mine">
      <span class="muted">${esc(lessonTitle(m.lesson))}</span><span>${m.html}<p class="vi">${esc(m.vi)}</p></span>
      <button class="icon-btn" data-action="del-custom" data-k="${m.k}" data-key="${esc(m.key)}" aria-label="Xoá">${icon('trash')}</button></div>`).join('')}</div></section>` : ''}
  </main>`;
}

let pinyinLib;
async function toPinyin(text) {
  pinyinLib ??= import('https://cdn.jsdelivr.net/npm/pinyin-pro@3.26.0/dist/index.mjs');
  const { pinyin } = await pinyinLib;
  return pinyin(text, { type: 'array', toneSandhi: false }).join('');
}
async function translate(text, lang) {
  const res = await fetch(`https://api.mymemory.translated.net/get?langpair=${EN ? 'en' : 'zh-CN'}|${lang}&q=${encodeURIComponent(text)}`);
  const t = (await res.json())?.responseData?.translatedText?.trim();
  if (!t) throw new Error('dịch lỗi');
  return t.replace(/\//g, ', '); // `en` names audio files; no slashes
}
const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
const segment = (s) => (segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : [...s]);

async function addOne(kind, line, lesson) {
  if (EN) return addOneEn(kind, line, lesson);
  const [zh, viGiven] = line.split('=').map((s) => s.trim());
  const han = zh.replace(/[\s\p{P}]/gu, '');
  if (!/^\p{Script=Han}+$/u.test(han)) throw new Error('chỉ nhận chữ Hán');
  if (kind === 'word' && wordMap.has(han)) throw new Error(`đã có (${lessonTitle(wordMap.get(han).lesson)})`);
  if (kind !== 'word' && data.sentences.some((s) => sameHanzi(sentenceText(s), zh))) throw new Error('câu đã có');
  const [vi, en] = await Promise.all([viGiven || translate(zh, 'vi'), translate(zh, 'en')]);
  if (kind === 'word') {
    const w = { hanzi: han, pinyin: [await toPinyin(han)], meanings: [vi], en, lesson };
    custom.words.push(w);
    return `${han} ${w.pinyin[0]} ${vi}`;
  }
  // Unknown words carry their reading in the token ("北京|běijīng"), the same way polyphones do.
  const tokens = await Promise.all(tokenize(zh, wordMap, segment).map(async (t) => (wordMap.has(t) || isPunct(t) ? t : `${t}|${await toPinyin(t)}`)));
  if (!isPunct(tokens.at(-1))) tokens.push('。');
  // Focus: a word of this lesson if the sentence has one, else its longest known word.
  const known = tokens.map((t) => parseToken(t).h).filter((h) => wordMap.has(h)).sort((a, b) => b.length - a.length);
  const focus = known.find((h) => wordMap.get(h).lesson === lesson) ?? known[0] ?? parseToken(tokens[0]).h;
  const s = { id: `${lesson}-u${Date.now().toString(36)}`, tokens, vi, en, focus, sense: 0, lesson };
  custom.sentences.push(s);
  return `${sentenceText(s)} ${vi}`;
}

async function addOneEn(kind, line, lesson) {
  const [text, viGiven] = line.split('=').map((s) => s.trim());
  if (!/^[A-Za-z][A-Za-z\s'’,.?!-]*$/.test(text)) throw new Error(T.script);
  const vi = viGiven || await translate(text, 'vi');
  if (kind === 'word') {
    const word = text.replace(/[,.?!]/g, '').replace(/\s+/g, ' ');
    if ([...wordMap.keys()].some((k) => sameWord(k, word))) throw new Error('đã có');
    custom.words.push({ hanzi: word, pinyin: [], meanings: [vi], en: '', lesson });
    return `${word} ${vi}`;
  }
  if (data.sentences.some((s) => sameHanzi(sentenceText(s), text))) throw new Error('câu đã có');
  const full = /[.?!]$/.test(text) ? text : `${text}.`;
  const tokens = enTokens(full, new Set([...wordMap.keys()].map((k) => k.toLowerCase())));
  const known = [...wordMap.values()].filter((w) => tokens.some((t) => sameWord(t, w.hanzi))).sort((x, y) => y.hanzi.length - x.hanzi.length);
  const focus = (known.find((w) => w.lesson === lesson) ?? known[0])?.hanzi ?? tokens[0];
  custom.sentences.push({ id: `${lesson}-u${Date.now().toString(36)}`, text: full, tokens, vi, en: '', focus, sense: 0, lesson });
  return `${full} ${vi}`;
}

async function submitAdd(form) {
  const kind = form.kind.value;
  const lines = form.zh.value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!form.lesson.value.trim() || !lines.length) return;
  const lesson = lessonByName(form.lesson.value);
  view.state = { kind, lesson, busy: true };
  render();
  const log = [];
  for (const line of lines) {
    try { log.push({ ok: true, text: `Đã thêm: ${await addOne(kind, line, lesson)}` }); }
    catch (err) { log.push({ ok: false, text: `${line}: ${err.message}` }); }
    saveCustom();
    mergeData(); // a word added on line 1 is known to the sentence on line 2
  }
  view.state = { kind, lesson, log };
  render();
}

function saveCustom() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch { alert('Không lưu được (bộ nhớ trình duyệt bị chặn).'); }
}

let base;
/** data = vocab.json + what was added in the app; a word in vocab.json wins over a custom duplicate. */
function mergeData() {
  const has = new Set(base.words.map((w) => w.hanzi));
  const lessonIds = new Set(base.lessons.map((l) => l.id));
  data = {
    lessons: [...base.lessons, ...custom.lessons.filter((l) => !lessonIds.has(l.id))].map((l) => (l.id in moves.t ? { ...l, title: moves.t[l.id] } : l)).sort((a, b) => a.id - b.id),
    words: [...base.words, ...custom.words.filter((w) => !has.has(w.hanzi))].filter((w) => !(w.hanzi in moves.d)).map((w) => (w.hanzi in moves.w ? { ...w, lesson: moves.w[w.hanzi] } : w)),
    // A deleted word takes its example sentences with it.
    sentences: [...base.sentences, ...custom.sentences].filter((s) => !(s.focus in moves.d)).map((s) => (s.id in moves.s ? { ...s, lesson: moves.s[s.id] } : s)),
  };
  wordMap = new Map(data.words.map((w) => [w.hanzi, w]));
}

// ---------- Controller ----------

/** Touch screens: no auto-focus into inputs, the keyboard would cover the word. Keep it only while already typing. */
const KEYBOARD_ON_OPEN = matchMedia('(pointer: fine)').matches;
let wasTyping = false;

function render() {
  const views = { home, words: wordList, quiz, summary, write, add: addView };
  wasTyping = document.activeElement?.matches?.('#hz-in, #py') ?? false;
  root.innerHTML = views[view.name]();
  if (view.name === 'quiz') onQuestionShown();
  if (view.name === 'write') {
    setupHand();
    // With the pad open, keep the on-screen keyboard down.
    const target = view.state.done ? '[data-action="write-next"]' : view.state.hand || !(KEYBOARD_ON_OPEN || wasTyping) ? null : '#hz-in';
    if (target) root.querySelector(target).focus({ preventScroll: !KEYBOARD_ON_OPEN });
  }
  fitKeyboard();
}

// Phone keyboard: while an answer box is focused, pin the page to the visible area above the keyboard
// and compact it (CSS `body.typing`), so the word stays readable while typing.
const vv = window.visualViewport;
function fitKeyboard() {
  const on = !KEYBOARD_ON_OPEN && !!document.activeElement?.matches?.('#hz-in, #py');
  document.body.classList.toggle('typing', on);
  if (on && vv) {
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    document.documentElement.style.setProperty('--vvt', `${vv.offsetTop}px`);
  }
}
document.addEventListener('focusin', fitKeyboard);
document.addEventListener('focusout', () => setTimeout(fitKeyboard));
vv?.addEventListener('resize', fitKeyboard);
vv?.addEventListener('scroll', fitKeyboard);

function onQuestionShown() {
  const q = view.qs[view.i];
  if (view.state.done) return root.querySelector('[data-action="next"]')?.focus();
  if (q.type === 'pinyin') {
    const input = root.querySelector('#py');
    if (KEYBOARD_ON_OPEN || wasTyping) input.focus();
    input.addEventListener('input', () => {
      view.state.typed = input.value;
      const pv = root.querySelector('#py-preview');
      if (pv) pv.textContent = toMarks(input.value);
      root.querySelector('#py-check').disabled = !input.value.trim();
    });
  }
}

function startSession(mode) {
  const qs = buildSession(data, progress, mode, { lesson: pickedLesson === '' ? null : +pickedLesson });
  view = { name: 'quiz', mode, qs, i: 0, state: {}, results: [] };
  render();
  autoplay();
}

function autoplay() {
  const q = view.qs[view.i];
  if (q.type === 'listen' || q.type === 'flash' || (EN && q.type === 'pinyin')) say(q.word.hanzi);
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
  document.activeElement?.blur();
  render();
  autoplay();
}

root.addEventListener('click', (e) => {
  const enBtn = e.target.closest('[data-say-en]');
  if (enBtn) return sayEn(enBtn.dataset.sayEn);
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
  else if (act === 'lang') { try { localStorage.setItem('hsk-lang', el.dataset.lang); } catch { /* private mode */ } location.reload(); }
  else if (act === 'rename') renameLesson(+el.dataset.id);
  else if (act === 'export') exportData(el.dataset.id === undefined ? undefined : +el.dataset.id);
  else if (act === 'add') { view = { name: 'add', state: {} }; render(); }
  else if (act === 'del-word') {
    const w = wordMap.get(el.dataset.key);
    if (!w || !confirm(`Xoá từ ${w.hanzi} và các câu mẫu của nó?`)) return;
    custom.words = custom.words.filter((x) => x.hanzi !== w.hanzi);
    custom.sentences = custom.sentences.filter((s) => s.focus !== w.hanzi);
    saveCustom();
    if (base.words.some((x) => x.hanzi === w.hanzi)) moves.d[w.hanzi] = w.lesson;
    saveMoves(); mergeData(); render();
  }
  else if (act === 'del-custom') {
    if (!confirm('Xoá mục này?')) return;
    const key = el.dataset.key;
    if (el.dataset.k === 'w') custom.words = custom.words.filter((w) => w.hanzi !== key);
    else custom.sentences = custom.sentences.filter((s) => s.id !== key);
    custom.lessons = custom.lessons.filter((l) => [...data.words, ...data.sentences].some((x) => x.lesson === l.id && x.hanzi !== key && x.id !== key));
    saveCustom(); mergeData(); render();
  }
  else if (act === 'write') startWrite(el.dataset.mode);
  else if (act === 'write-next') startWrite(view.mode);
  else if (act === 'reveal') { view.state = { ...view.state, typed: root.querySelector('#hz-in').value, revealed: true }; render(); say(view.item.hanzi); }
  else if (act === 'check-write') checkWrite();
  else if (act === 'hand-toggle') { view.state = { ...view.state, typed: root.querySelector('#hz-in').value, hand: !view.state.hand }; render(); root.querySelector('.hand')?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
  else if (act === 'hand-undo') { ink.pop(); redrawInk(); recognize(); }
  else if (act === 'hand-clear') clearInk();
  else if (act === 'hand-back') { const input = root.querySelector('#hz-in'); input.value = [...input.value].slice(0, -1).join(''); }
  else if (act === 'hand-pick') { root.querySelector('#hz-in').value += el.dataset.c; clearInk(); }
  else if (act === 'start') startSession(el.dataset.mode);
  else if (act === 'flip') { view.state.flipped = true; render(); }
  else if (act === 'grade') { grade(el.dataset.ok === '1'); next(); }
  else if (act === 'next') next();
  else if (act === 'place') { (view.state.picked ??= []).push(+el.dataset.idx); render(); }
  else if (act === 'unplace') { view.state.picked = view.state.picked.filter((i) => i !== +el.dataset.idx); render(); }
  else if (act === 'check-order') {
    const q = view.qs[view.i];
    // ponytail: only the source word order counts; add alternates to the data if a lesson needs them.
    const text = (ts) => ts.map((t) => parseToken(t).h).join('');
    answer(text(view.state.picked.map((i) => q.pieces[i])) === text(q.answer));
  }
});

root.addEventListener('change', (e) => {
  if (e.target.dataset.move) return moveItem(e.target);
  if (e.target.id !== 'lesson-pick') return;
  pickedLesson = e.target.value;
  try { localStorage.setItem(LESSON_KEY, pickedLesson); } catch { /* private mode */ }
  render();
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  if (view.name === 'write') return checkWrite();
  if (view.name === 'add') return view.state.busy || submitAdd(e.target);
  const q = view.qs[view.i];
  const typed = view.state.typed ?? '';
  if (!typed.trim()) return;
  answer(EN ? sameHanzi(typed, q.word.hanzi) : q.word.pinyin.some((p) => normalize(p) === normalize(typed)));
});

async function boot() {
  try {
    const res = await fetch(EN ? 'data/english.json' : 'data/vocab.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    base = await res.json();
    if (EN) base = fromEnglish(base);
    mergeData();
    render();
  } catch (err) {
    root.innerHTML = `<main class="page"><div class="empty">${icon('wifi-slash')}<p>Không tải được dữ liệu (${esc(err.message)}).</p><button class="btn" onclick="location.reload()">Thử lại</button></div></main>`;
  }
}
boot();
