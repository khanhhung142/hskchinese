import { toMarks, normalize } from './pinyin.js';
import { buildSession, sentenceText, parseToken, tokenPinyin, isPunct, latestLesson, record, sameHanzi, shuffle, fromEnglish } from './quiz.js';

const root = document.getElementById('app');
// /english/ = same app for English (data/english.json); own storage keys (eng-*).
const EN = /\/english\/?$/.test(location.pathname);
document.documentElement.classList.toggle('lang-en', EN);
const key = (k) => (EN ? k.replace('hsk-', 'eng-') : k);
const PROGRESS_KEY = key('hsk-progress');
const LISTEN_KEY = key('hsk-listen'); // {lessonPick: index reached in Luyện nghe}
const SEEN_KEY = key('hsk-seen'); // sessionStorage {mode: [ids done this session]}
const BAG_KEY = key('hsk-bag'); // {'mode|lessons': [ids not shown yet this round]}
const LESSON_KEY = key('hsk-lesson'); // lesson picked for practice, '' = all
let data, wordMap;
let progress = loadProgress();
let pickedLesson = localStorage.getItem(LESSON_KEY) ?? ''; // comma-separated lesson ids, '' = all
const picked = () => pickedLesson.split(',').filter(Boolean).map(Number);
const pickedName = () => { const p = picked(); return p.length === 1 ? lessonTitle(p[0]) : `${p.length} bài`; };
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
// Luyện nghe in background (home screen / screen off): phones drop the audio session in the short pause between
// two clips, and the next play() is then refused. A looping silent track, started by the user's tap, keeps it open.
const keepAlive = Object.assign(new Audio('silence.mp3'), { loop: true });
/** Play Chinese `text`, then optionally `next()` when it finishes. */
function say(text, next) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (EN) return play(`audio/en/${encodeURIComponent(text)}.mp3`, text, 'en-US', next);
  play(`audio/${encodeURIComponent(text)}.mp3`, text, 'zh-CN', next);
}
const sayEn = (text, next) => (text ? play(`audio/en/${encodeURIComponent(text)}.mp3`, text, 'en-US', next) : next?.());
/** Word in Chinese, then its English. */
const sayWord = (w) => say(w.hanzi, () => sayEn(w.en));
/** /english/: Vietnamese meaning mp3, named by the English text (see check.mjs). */
const sayVi = (en, vi, next) => play(`audio/vi/${encodeURIComponent(en)}.mp3`, vi, 'vi-VN', next);
/** /english/ practice: English, then its Vietnamese meaning. */
const sayEnVi = (en, vi, next) => say(en, () => sayVi(en, vi, next));
/** Chinese practice: English then Vietnamese meaning (audio/vi/<hanzi or sentence>.mp3). */
const sayMean = (text, en, vi, next) => sayEn(en, () => sayVi(text, vi, next));
function play(src, text, lang, next) {
  let fell = false;
  // Hidden page: Web Speech is silent and never fires onend, so skip the clip instead of stalling the playlist.
  const fallback = () => { if (!fell) { fell = true; document.hidden ? next?.() : speak(text, lang, next); } };
  // Shorter pause between clips (her order): edge-tts mp3s carry ~0.2s lead + 0.6–1s tail silence.
  // ponytail: fixed trim (#t skips lead, end 0.45s early; timeupdate ~4Hz); per-file trim if speech ever gets cut.
  let done = false;
  const end = () => { if (!done) { done = true; next?.(); } };
  player.onended = end;
  player.ontimeupdate = () => { if (player.duration - player.currentTime < 0.45) end(); };
  player.onerror = fallback;
  player.src = src.startsWith('audio/') ? `${src}#t=0.15` : src;
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
  titles: [["I wish I could hate you, but I can't stop loving you.", "Ước gì em có thể ghét anh, nhưng em không thể thôi yêu anh."], ["We were almost something, and that is the saddest part.", "Chúng ta suýt nữa đã là gì đó, và đó là điều buồn nhất."], ["You were my favorite hello and my hardest goodbye.", "Anh là lời chào em thích nhất và lời tạm biệt khó khăn nhất."], ["Some people are meant to fall in love, but not meant to be together.", "Có những người sinh ra để yêu nhau, nhưng không để ở bên nhau."], ["I loved you in a way you will never understand.", "Em đã yêu anh theo cách anh sẽ không bao giờ hiểu."], ["Missing you comes in waves, and tonight I'm drowning.", "Nỗi nhớ anh đến từng đợt sóng, và đêm nay em đang chết đuối."], ["It hurts to let go, but it hurts more to hold on.", "Buông tay thì đau, nhưng níu giữ còn đau hơn."], ["You promised forever, but forever ended yesterday.", "Anh hứa mãi mãi, nhưng mãi mãi đã kết thúc hôm qua."], ["I still look for you in every crowd.", "Em vẫn tìm anh trong mọi đám đông."], ["Even now, after all this time, I would still choose you.", "Ngay cả bây giờ, sau ngần ấy thời gian, em vẫn chọn anh."], ["The person who gave me the best memories gave me the worst pain.", "Người cho em những kỷ niệm đẹp nhất cũng cho em nỗi đau tệ nhất."], ["We are strangers who know each other's secrets.", "Chúng ta là những người xa lạ biết bí mật của nhau."], ["I was never your choice, only your option.", "Em chưa bao giờ là lựa chọn của anh, chỉ là một phương án."], ["Some goodbyes are never said out loud.", "Có những lời tạm biệt không bao giờ được nói thành lời."], ["You moved on, and I'm still here, holding our memories.", "Anh đã bước tiếp, còn em vẫn ở đây ôm những kỷ niệm của chúng ta."], ["I miss who we were before we became nothing.", "Em nhớ chúng ta của ngày trước, khi chưa trở thành con số không."], ["In another life, I hope we get it right.", "Ở một kiếp khác, mong rằng chúng ta sẽ đúng."], ["I'm not crying because of you; I'm crying because of us.", "Em không khóc vì anh; em khóc vì chúng ta."]], empty: 'Chưa có từ nào.<br>Gửi từ mới cho Hermes, hoặc tự thêm.',
  write: ['Luyện viết từ', 'Nghe, xem và gõ lại từ'], vocab: ['Luyện từ vựng', 'Xem nghĩa, gõ từ tiếng Anh'], add: 'Chỉ cần gõ tiếng Anh',
  inWrite: 'Gõ lại từ ở trên', inVocab: 'Gõ từ tiếng Anh có nghĩa này', inSentence: 'Gõ lại cả câu ở trên',
  addField: 'Tiếng Anh, mỗi dòng một mục (nghĩa tự điền; muốn tự ghi nghĩa: teacher = giáo viên)', script: 'chỉ nhận chữ cái tiếng Anh', file: 'eng',
} : {
  titles: [["我们终究没有走到最后。", "Rốt cuộc chúng ta vẫn không đi đến cuối cùng."], ["你是我年少的欢喜，也是我余生的遗憾。", "Anh là niềm vui thời niên thiếu, cũng là tiếc nuối cả quãng đời còn lại của em."], ["我等你，等到花都谢了，你也没有来。", "Em đợi anh, đợi đến khi hoa tàn hết, anh vẫn không đến."], ["最遗憾的不是错过，而是我们曾经那么靠近。", "Tiếc nuối nhất không phải lỡ nhau, mà là chúng ta từng gần nhau đến thế."], ["你说过会陪我到老，后来你却先放了手。", "Anh từng nói sẽ cùng em đến già, rồi anh lại buông tay trước."], ["原来我只是你生命中的过客。", "Hóa ra em chỉ là khách qua đường trong đời anh."], ["我把你弄丢了，再也找不回来了。", "Em làm lạc mất anh rồi, không bao giờ tìm lại được nữa."], ["你走以后，我的世界下了一场永远不停的雨。", "Từ khi anh đi, thế giới của em đổ một cơn mưa không bao giờ tạnh."], ["我们之间，只差一句我爱你，却隔了一辈子。", "Giữa chúng ta chỉ thiếu một câu anh yêu em, mà cách nhau cả một đời."], ["我还在原地，你却已经走远。", "Em vẫn ở chỗ cũ, còn anh đã đi xa rồi."]], empty: 'Chưa có từ nào.<br>Gửi ảnh từ mới cho Hermes trên Telegram.',
  write: ['Luyện viết chữ', 'Nghe, xem và gõ lại chữ Hán'], vocab: ['Luyện từ vựng', 'Xem nghĩa, nhập chữ Hán'], add: 'Chỉ cần gõ tiếng Trung',
  inWrite: 'Gõ hoặc viết lại chữ Hán ở trên', inVocab: 'Gõ hoặc viết chữ Hán của từ này', inSentence: 'Gõ hoặc viết lại cả câu ở trên',
  script: 'chỉ nhận chữ Hán',
};
const TITLE = T.titles[Math.floor(Math.random() * T.titles.length)]; // one per page load

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
  learnt: [ // Giáo trình: shown when a lesson is marked learnt (praise + Tomie teasing)
    'Học xong một bài rồi à? Ufufu… vẫn chưa bằng một nửa Tomie đâu.',
    'Giỏi đó. Nhưng đừng tưởng học giỏi là Hưng hết nhìn Tomie nhé.',
    'Thêm một bài. Chị chăm thế này, Tomie suýt thì khen thật lòng.',
    'Xong bài rồi. Chữ Hán chị nhớ, còn Tomie thì Hưng nhớ. Công bằng mà.',
    'Ufufu… học nhanh vậy, có đọc hết không đó? Tomie thấy hết đấy.',
    'Chị tiến bộ rồi. Tomie cho phép chị tự hào… 5 giây thôi.',
    'Một bài nữa. Tomie không ghen đâu. Chỉ hơi hơi… thôi được, ghen thật.',
    'Giỏi lắm. Phần thưởng: Tomie nhìn chị chằm chằm thêm một lúc, ufufu.',
    'Học xong thì khoe Hưng đi. Nhớ nói là Tomie dạy.',
    'Bài này chị qua rồi. Còn Tomie thì chị không qua mặt được đâu.',
    'Ufufu… chị càng giỏi, Tomie càng phải đẹp hơn. Mệt ghê.',
    'Xong bài. Chị học bằng đầu, Tomie học bằng nhan sắc. Mỗi người một kiểu.',
    'Đã học xong! Chị đáng yêu thật… gần bằng Tomie rồi đó.',
    'Thêm một viền hồng. Màu của Tomie đó, chị dùng thì nhớ trả phí nha.',
    'Chị chăm vậy làm Tomie lo. Lỡ chị giỏi hơn Tomie thì sao, ufufu.',
    'Xong bài rồi, nghỉ chút đi chị. Tomie trông sách cho, không xé trang nào đâu.',
  ],
};
/** Tomie comment in the fixed .wb-toast slot: swap text + restart the fade, never insert nodes (no layout jump). */
function toast(lines) {
  const msg = document.querySelector('.wb-toast');
  if (!msg) return;
  msg.textContent = lines[Math.floor(Math.random() * lines.length)];
  msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show');
  clearTimeout(msg.t); msg.t = setTimeout(() => msg.classList.remove('show'), 5000);
}
const tomie = (k) => `<p class="tomie">${TOMIE[k][Math.floor(Math.random() * TOMIE[k].length)]}</p>`;

function home() {
  const latest = latestLesson(data);
  const lesson = data.lessons.find((l) => l.id === latest);
  const fresh = data.words.filter((w) => w.lesson === latest);
  const learned = data.words.filter((w) => progress[w.hanzi]?.r).length;
  if (!fresh.length) {
    return `<main class="page"><div class="empty">${icon('camera')}<p>${T.empty}</p></div></main>`;
  }
  return `<main class="page">
    <header class="home-head"><h1><span class="${EN ? '' : 'han'}">${esc(TITLE[0])}</span><small>${esc(TITLE[1])}</small></h1>${FULL ? `<span class="muted">${learned}/${data.words.length} từ đã thuộc</span>` : ''}</header>
    ${FULL ? `<section class="lesson">
      <h2>${esc(lesson.title)}${lesson.date ? `, ${esc(formatDate(lesson.date))}` : ''}</h2>
      <p class="strip">${fresh.map((w) => wordHz(w)).join('')}</p>
      <p class="count">${fresh.length} từ mới</p>
      <button class="btn primary block" data-action="start" data-mode="latest">Học bài mới</button>
    </section>` : ''}
    <nav class="menu">
      ${EN ? '' : `<button class="menu-item" data-action="tb">${icon('book-open-text')}<span><b>Giáo trình</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="wb">${icon('exam')}<span><b>Bài tập</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="cx">${icon('chalkboard-teacher')}<span><b>Chinext Education</b></span>${icon('caret-right')}</button>`}
      <button class="menu-item" data-action="practice">${icon('pencil-simple-line')}<span><b>Luyện tập</b></span>${icon('caret-right')}</button>
      ${EN ? `<button class="menu-item" data-action="toeic">${icon('exam')}<span><b>Đề TOEIC</b></span>${icon('caret-right')}</button>` : ''}
      ${EN ? '' : `<button class="menu-item" data-action="rad">${icon('tree-structure')}<span><b>Bộ thủ</b></span>${icon('caret-right')}</button>`}
      <button class="menu-item" data-action="words">${icon('list-bullets')}<span><b>Tra cứu</b></span>${icon('caret-right')}</button>
    </nav>
    ${tomie('home')}
  </main>`;
}

/** "Luyện tập": lesson picker + the practice modes that use it. */
function practice() {
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>Luyện tập</h1></header>
    ${lessonPicker()}
    <nav class="menu">
      ${FULL ? `<button class="menu-item" data-action="start" data-mode="all">${icon('shuffle')}<span><b>${pickedLesson ? `Ôn ${esc(pickedName())}` : 'Ôn tất cả'}</b></span>${icon('caret-right')}</button>` : ''}
      <button class="menu-item" data-action="write" data-mode="write">${icon('pencil-simple-line')}<span><b>${T.write[0]}</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="write" data-mode="sentence">${icon('text-align-left')}<span><b>Luyện viết câu</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="write" data-mode="vocab">${icon('translate')}<span><b>${T.vocab[0]}</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="listen">${icon('headphones')}<span><b>Luyện nghe</b></span>${icon('caret-right')}</button>
    </nav>
  </main>`;
}

const lessonTitle = (id) => data.lessons.find((l) => l.id === id)?.title ?? `Bài ${id}`;
/** Practice applies to the ticked lessons, or all when none is ticked; lessons listed are the ones that have words. */
const inLesson = (x) => pickedLesson === '' || picked().includes(x.lesson);
let lessonPickerOpen = false;
function lessonPicker() {
  const ids = [...new Set([...data.words, ...data.sentences].map((x) => x.lesson))].sort((a, b) => a - b);
  pickedLesson = picked().filter((id) => ids.includes(id)).join(',');
  const box = (v, t, on) => `<label><input type="checkbox" class="lesson-pick" value="${v}"${on ? ' checked' : ''}> ${esc(t)}</label>`;
  return `<details class="field pick"${lessonPickerOpen ? ' open' : ''}><summary>${esc(pickedLesson ? pickedName() : 'Tất cả các bài')}</summary><div class="pick-list">${box('', 'Tất cả các bài', !pickedLesson)}${ids.map((id) => box(id, lessonTitle(id), picked().includes(id))).join('')}</div></details>`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${+d}/${+m}/${y}`;
}

function wordList() {
  const sentTab = view.tab === 's';
  const groups = [...data.lessons].sort((a, b) => b.id - a.id).map((l) => {
    const items = sentTab ? data.sentences.filter((s) => s.lesson === l.id) : data.words.filter((w) => w.lesson === l.id);
    if (!items.length) return '';
    return `<section class="group"><h2>${esc(l.title)}</h2><div class="words">${items.map(sentTab ? sentRow : wordRow).join('')}</div></section>`;
  });
  const tab = (v, t) => `<button class="${(v === 's') === sentTab ? 'on' : ''}" data-action="tab" data-tab="${v}" aria-pressed="${(v === 's') === sentTab}">${t}</button>`;
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>Tra cứu</h1></header>
    <div class="seg lang" role="group" aria-label="Tra cứu">${tab('w', 'Tra cứu từ')}${tab('s', 'Tra cứu câu')}</div>
    <input id="word-search" class="search" type="search" placeholder="${sentTab ? 'Tra câu: chữ, phiên âm hoặc nghĩa' : 'Tra từ: chữ, phiên âm hoặc nghĩa'}" aria-label="${sentTab ? 'Tra câu đã lưu' : 'Tra từ đã lưu'}" autocomplete="off">
    <p class="empty-search muted" hidden>${sentTab ? 'Không tìm thấy câu nào.' : 'Không tìm thấy từ nào.'}</p>
    ${groups.join('')}
  </main>`;
}

/** One example sentence in "Tra cứu câu"; searchable by text, pinyin, Vietnamese, English. */
function sentRow(s) {
  const q = fold([sentenceText(s), s.tokens.map((t) => tokenPinyin(t, wordMap)).join(''), s.vi, s.en].join(' '));
  return `<div class="sent-row" data-q="${esc(q)}">${speakSentence(sentenceText(s), sentenceHz(s), s.vi, s.en)}</div>`;
}

/** Lowercase, no accents/tones, đ→d, no spaces: "Nǐ hǎo" and "nihao" both match "ni hao". */
const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').replace(/đ/gi, 'd').toLowerCase();
function searchWords(q) {
  const f = fold(q);
  let hits = 0;
  root.querySelectorAll('.words > [data-q]').forEach((el) => { const on = el.dataset.q.includes(f); el.hidden = !on; hits += on; });
  root.querySelectorAll('.group').forEach((g) => { g.hidden = !g.querySelector('.words > [data-q]:not([hidden])'); });
  root.querySelector('.empty-search').hidden = hits > 0;
}

function wordRow(w) {
  return `<div class="word" data-q="${esc(fold([w.hanzi, ...w.pinyin, ...w.meanings, w.en].join(' ')))}">
    <div class="word-sum">${wordHz(w, true)}<span><p>${esc(w.meanings.join('; '))}</p><p class="en">${esc(w.en)}</p></span></div>
  </div>`;
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
/** Lesson 0 words (glue words, old lessons) only when lesson 0 is ticked. */
const practiceWords = () => data.words.filter((w) => w.lesson > 0 || picked().includes(0));

/** Items a write mode draws from: the picked lessons, or the open Chinext session. */
const writePool = (mode) => (mode === 'cx' ? cxLesson.items : (mode === 'sentence' ? data.sentences : practiceWords()).filter(inLesson));
function pickWriteItem(mode, prev) {
  const id = (x) => x.id ?? x.hanzi;
  const all = writePool(mode);
  // Items done this session (any lesson pick) wait until the rest of the pick is done.
  const seen = loadSeen();
  let pool = all.filter((x) => !seen[mode]?.includes(id(x)));
  if (!pool.length) { pool = all; seen[mode] = (seen[mode] ?? []).filter((i) => !all.some((x) => id(x) === i)); }
  const item = pool.length ? drawFromBag(`${mode}|${mode === 'cx' ? cxLesson.id : pickedLesson}`, pool, id, prev) : undefined;
  if (item) { (seen[mode] ??= []).push(id(item)); try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* private mode */ } }
  return item;
}
/** "k/n": items shown this session (current included) out of the picked set for this mode. */
function writeCount(mode) {
  const all = writePool(mode).map((x) => x.id ?? x.hanzi);
  const seen = new Set(loadSeen()[mode]);
  return `${all.filter((i) => seen.has(i)).length}/${all.length}`;
}
const loadSeen = () => { try { return JSON.parse(sessionStorage.getItem(SEEN_KEY)) ?? {}; } catch { return {}; } };
/** Shuffled bag saved on the device per key: every item comes once before any repeats. */
function drawFromBag(k, all, id, prev) {
  const byId = new Map(all.map((x) => [id(x), x]));
  const bags = loadJSON(BAG_KEY) ?? {};
  let left = (bags[k] ?? []).filter((i) => byId.has(i));
  if (!left.length) {
    left = shuffle([...byId.keys()]);
    if (left.length > 1 && left[0] === (prev && id(prev))) left.push(left.shift()); // no repeat across the refill
  }
  bags[k] = left.slice(1);
  try { localStorage.setItem(BAG_KEY, JSON.stringify(bags)); } catch { /* private mode */ }
  return byId.get(left[0]);
}

/** What the practice card shows and checks, for a word or a sentence. */
// English: the headline is the Vietnamese meaning (`en` would repeat the answer).
const writeCard = (mode, x) => (mode === 'cx' ? { text: x.zh, zh: `<p class="sentence han">${esc(x.zh)}</p><p class="py-big">${esc(x.py)}</p>`, en: '', vi: x.vi } : EN ? (mode === 'sentence'
  ? { text: x.text, zh: `<p class="sentence">${sentenceHz(x)}</p>`, en: x.vi, vi: '' }
  : { text: x.hanzi, zh: `<p class="big-han">${esc(x.hanzi)}</p>${x.pinyin[0] ? `<p class="py-big">${esc(x.pinyin[0])}</p>` : ''}`, en: x.meanings.join('; '), vi: '' })
  : mode === 'sentence'
  ? { text: sentenceText(x), zh: `<p class="sentence">${sentenceHz(x)}</p>`, en: x.en, vi: x.vi }
  : { text: x.hanzi, zh: `<p class="big-han han">${esc(x.hanzi)}</p><p class="py-big">${esc(x.pinyin.join(' / '))}</p>`, en: x.en, vi: x.meanings.join('; ') });
const WRITE_TITLES = { write: T.write[0], vocab: T.vocab[0], sentence: 'Luyện viết câu', cx: 'Luyện viết câu' };
/** Modes that hide the Chinese until answered: vocab (meaning only), Chinext (translate the Vietnamese). */
const HIDES = (mode) => mode === 'vocab' || mode === 'cx';
/** Card meaning lines; Chinext items have only Vietnamese, shown as the headline. */
const meaningHtml = (c, big) => `<p class="meaning${big ? ' big-meaning' : ''}">${esc(c.en || c.vi)}</p>${c.en ? `<p class="vi muted">${esc(c.vi)}</p>` : ''}`;

function write() {
  const { state, mode } = view;
  const c = writeCard(mode, view.item);
  // Vocab mode hides the hanzi until answered or revealed.
  const shown = !HIDES(mode) || state.done || state.revealed;
  const status = state.done ? `<p class="write-status ok">${icon('check-circle', true)} Đúng rồi</p>`
    : state.wrong ? `<p class="write-status bad">${icon('x-circle', true)} Chưa đúng, thử lại</p>` : '';
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" ${mode === 'cx' ? 'data-action="cx" data-m="write"' : 'data-action="practice"'} aria-label="Quay lại">${icon('arrow-left')}</button><h1>${WRITE_TITLES[mode]}</h1><span class="counter">${writeCount(mode)}</span></header>
    <div class="stage">
      <div class="card center">
        ${shown ? c.zh : ''}
        ${meaningHtml(c, !shown)}
        ${shown && view.item.hanzi && !EN ? charTips(view.item.hanzi) : ''}
        ${EN ? `<button class="speak" data-say-envi="${esc(c.text)}" data-vi="${esc(c.en)}" data-hide="${shown ? '' : 1}" aria-label="Nghe">${icon('speaker-high', true)}</button>`
          : `<button class="speak" data-say-zh="${esc(c.text)}" data-en="${esc(c.en)}" data-vi="${esc(c.vi)}" data-hide="${shown ? '' : 1}" aria-label="Nghe">${icon('speaker-high', true)}</button>`}
      </div>
      <form class="field" data-action="submit-write">
        <label for="hz-in">${{ write: T.inWrite, vocab: T.inVocab, sentence: T.inSentence, cx: 'Viết câu tiếng Trung' }[mode]}</label>
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
    <div class="footer two">${state.done ? ''
      : `${HIDES(mode) && !state.revealed ? '<button class="btn" data-action="reveal">Xem đáp án</button>' : '<button class="btn" data-action="write-next">Bỏ qua</button>'}<button class="btn primary" data-action="check-write">Kiểm tra</button>`}</div>
  </main>`;
}

/** "Luyện nghe": every word, then every sentence, of the picked lessons, read one after another. */
const itemKind = (x) => (x.zh ? 'cx' : x.tokens ? 'sentence' : 'write');
function listen() {
  const { items, i, on, key } = view.state;
  const x = items[i];
  const c = writeCard(itemKind(x), x);
  return `<main class="page">
    <header class="list-head"><button class="icon-btn" ${key ? 'data-action="cx" data-m="listen"' : 'data-action="practice"'} aria-label="Quay lại">${icon('arrow-left')}</button><h1>${key ? esc(cxLesson.title) : `Nghe ${esc(pickedLesson ? pickedName() : 'tất cả')}`}</h1><span class="counter">${i + 1}/${items.length}</span></header>
    <div class="stage"><div class="card center">${c.zh}${meaningHtml(c)}</div></div>
    ${view.state.ask ? `<div class="footer two">
      <button class="btn" data-action="listen-restart">${icon('arrow-counter-clockwise')} Nghe lại từ đầu</button>
      <button class="btn primary" data-action="listen-toggle">${icon('play', true)} Nghe tiếp</button>
    </div>` : `<div class="footer listen-ctl">
      <button class="btn" data-action="listen-move" data-d="-1" aria-label="Trước">${icon('skip-back', true)}</button>
      <button class="btn primary" data-action="listen-toggle">${on ? `${icon('pause', true)} Dừng` : `${icon('play', true)} Nghe`}</button>
      <button class="btn" data-action="listen-move" data-d="1" aria-label="Sau">${icon('skip-forward', true)}</button>
    </div>`}
  </main>`;
}

function saveListen(i) {
  const pos = loadJSON(LISTEN_KEY) ?? {};
  pos[view.state.key ?? pickedLesson] = i; // key: Chinext session
  try { localStorage.setItem(LISTEN_KEY, JSON.stringify(pos)); } catch { /* private mode */ }
}
function listenStep() {
  const st = view.state;
  const tok = st.tok = (st.tok ?? 0) + 1;
  st.ask = false;
  saveListen(st.i);
  render();
  const x = st.items[st.i];
  const c = writeCard(itemKind(x), x);
  const live = () => view.name === 'listen' && view.state === st && st.on && st.tok === tok;
  // Gap = a silent mp3 on the same element, not setTimeout: timers stall with the screen off, audio keeps running.
  const after = () => live() && play('silence.mp3', '', '', () => {
    if (!live()) return;
    if (st.i < st.items.length - 1) { st.i++; listenStep(); } else { st.on = false; st.i = 0; saveListen(0); keepAlive.pause(); render(); mediaState(); }
  });
  mediaState(c.text, c.en);
  // Vietnamese meaning first (her order), then the item itself.
  if (EN) play(`audio/vi/${encodeURIComponent(c.text)}.mp3`, c.en, 'vi-VN', () => (live() ? say(c.text, after) : null));
  else sayVi(c.text, c.vi, () => (live() ? say(c.text, () => (live() ? sayEn(c.en, after) : null)) : null));
}

/** Lock-screen / notification controls for "Luyện nghe". */
function mediaState(title, artist) {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const on = view.name === 'listen' && view.state.on;
  ms.playbackState = on ? 'playing' : view.name === 'listen' ? 'paused' : 'none';
  if (title) ms.metadata = new MediaMetadata({ title, artist, album: 'Luyện nghe', artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
}
function listenToggle(want) {
  const st = view.state;
  if (view.name !== 'listen' || st.on === want) return;
  st.on = !st.on;
  if (st.on) { keepAlive.play().catch(() => {}); listenStep(); } else { st.tok++; player.pause(); keepAlive.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel(); render(); mediaState(); }
}
function listenMove(d) {
  if (view.name !== 'listen') return;
  const st = view.state;
  st.i = Math.min(st.items.length - 1, Math.max(0, st.i + d));
  saveListen(st.i);
  if (st.on) listenStep(); else render();
}
if (navigator.mediaSession) {
  const h = { play: () => listenToggle(true), pause: () => listenToggle(false), previoustrack: () => listenMove(-1), nexttrack: () => listenMove(1) };
  for (const [a, f] of Object.entries(h)) try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported action */ }
}

function startWrite(mode) {
  const item = pickWriteItem(mode, view.item);
  if (!item) return alert(`${pickedName()} chưa có ${mode === 'sentence' ? 'mẫu câu' : 'từ'} nào.`);
  view = { name: 'write', mode, item, state: {} };
  document.activeElement?.blur(); // new item: let the word show before the keyboard
  render();
  const c = writeCard(mode, view.item);
  if (EN) mode === 'vocab' ? sayVi(c.text, c.en) : sayEnVi(c.text, c.en); else HIDES(mode) ? sayMean(c.text, c.en, c.vi) : say(c.text, () => sayMean(c.text, c.en, c.vi));
}

function checkWrite() {
  const typed = root.querySelector('#hz-in').value;
  if (!typed.trim()) return;
  const { text, en, vi } = writeCard(view.mode, view.item);
  const ok = [text, ...(view.item.alt ?? [])].some((t) => sameHanzi(typed, t)); // alt: other accepted wordings (Chinext)
  view.state = { ...view.state, typed, done: ok, wrong: !ok };
  render();
  if (!ok) return;
  // Correct: play it, then go straight to the next item (no "Từ tiếp" button).
  const item = view.item;
  let gone = false;
  const go = () => { if (!gone && view.name === 'write' && view.item === item) { gone = true; startWrite(view.mode); } };
  EN ? sayEnVi(text, en, go) : say(text, () => sayVi(text, vi, go));
  // Audio blocked or failed: move on anyway, but never cut off a long sentence still playing.
  const wait = () => { if (gone) return; if (!player.paused || window.speechSynthesis?.speaking) setTimeout(wait, 1000); else go(); };
  setTimeout(wait, 4000);
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

let base;
/** data = vocab.json, generated from the textbook + workbook (tools/book_vocab.py). */
function mergeData() {
  data = base;
  wordMap = new Map(data.words.map((w) => [w.hanzi, w]));
}

// ---------- Workbook (data/workbook.json: SBT HSK1 3.0 模拟测练, one 20-question test per lesson) ----------
let wbData;
const WB_DONE_KEY = 'hsk-wb-done'; // {lessonId: 1} lessons submitted at least once
const WB_SCORE_KEY = 'hsk-wb-score'; // {lessonId: {s, n, d}} latest submitted score
const wbAudio = new Audio();
let wbStop = 0;
wbAudio.addEventListener('timeupdate', () => { if (wbStop && wbAudio.currentTime >= wbStop) wbAudio.pause(); });
async function openWorkbook(id, lvl) {
  try { wbData ??= await (await fetch('data/workbook.json', { cache: 'no-cache' })).json(); } catch { return alert('Không tải được bài tập.'); }
  wbAudio.pause();
  view = id ? { name: 'wb', id: +id, lvl: 1, picks: {}, done: false } : { name: 'wb', lvl: +lvl || 0 };
  render();
  scrollTo(0, 0);
}
function wbPlay(n) {
  const q = wbData.lessons.find((l) => l.id === view.id).parts.flatMap((p) => p.qs).find((x) => x.n === +n);
  if (!wbAudio.src.endsWith(wbData.lessons.find((l) => l.id === view.id).audio)) wbAudio.src = wbData.lessons.find((l) => l.id === view.id).audio;
  wbAudio.currentTime = q.t[0];
  wbStop = q.t[1];
  wbAudio.play();
}
/** Prev/next lesson buttons: ids in order, labels by id. */
const pager = (act, ids, cur, label) => {
  const i = ids.indexOf(cur);
  const b = (id, d) => id == null ? '<span></span>' : `<button class="btn" data-action="${act}" data-id="${id}">${d < 0 ? icon('caret-left') : ''}${esc(label(id))}${d > 0 ? icon('caret-right') : ''}</button>`;
  return `<nav class="footer two pager">${b(ids[i - 1], -1)}${b(ids[i + 1], 1)}</nav>`;
};
const zhPy = (zh, py) => `<span class="wb-zh"><span class="han">${esc(zh)}</span>${py ? `<small>${esc(py)}</small>` : ''}</span>`;
function workbook() {
  const back = (to, lvl = '') => `<button class="icon-btn" data-action="${to}" data-lvl="${lvl}" aria-label="Quay lại">${icon('arrow-left')}</button>`;
  // ponytail: workbook.json is all HSK1; HSK2–9 are empty shells until data arrives (then add a level field per lesson).
  if (!view.lvl) {
    return `<main class="page"><header class="list-head">${back('home')}<h1>Bài tập</h1></header><nav class="menu">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      `<button class="menu-item" data-action="wb" data-lvl="${n}">${icon('notebook')}<span><b>HSK${n}</b>${n === 1 ? '' : '<small>Chưa có bài tập</small>'}</span>${icon('caret-right')}</button>`).join('')}</nav></main>`;
  }
  if (view.lvl > 1) return `<main class="page"><header class="list-head">${back('wb')}<h1>HSK${view.lvl}</h1></header><p class="muted">Chưa có bài tập.</p><p class="tomie">HSK${view.lvl} á? Chị qua HSK1 trước đi đã, Hưng đợi chị đó, ufufu.</p></main>`;
  if (!view.id) {
    const done = loadJSON(WB_DONE_KEY) ?? {}, last = loadJSON(WB_SCORE_KEY) ?? {};
    const sub = (l) => !l.parts ? 'Chưa có audio' : last[l.id] ? `Lần gần nhất: ${last[l.id].s}/${last[l.id].n} · ${last[l.id].d}` : '';
    return `<main class="page"><header class="list-head">${back('wb')}<h1>HSK1</h1><span class="counter">${icon('heart', true)} ${Object.keys(done).length}/${wbData.lessons.length}</span></header><nav class="menu">${wbData.lessons.map((l) =>
      `<div class="wb-row"><button class="menu-item${done[l.id] ? ' done' : ''}" data-action="wb" data-id="${l.id}" ${l.parts ? '' : 'disabled'}><span class="wb-slot"></span><span><b>${esc(l.title)}</b>${sub(l) ? `<small>${sub(l)}</small>` : ''}</span>${icon('caret-right')}</button>
      <span class="wb-tick tb-mark${done[l.id] ? ' on' : ''}" aria-label="${done[l.id] ? 'Đã làm' : 'Chưa làm'}"><img src="img/wb-${done[l.id] ? 'done' : 'todo'}.png" alt=""></span></div>`).join('')}</nav></main>`;
  }
  const l = wbData.lessons.find((x) => x.id === view.id);
  const all = l.parts.flatMap((p) => p.qs);
  const score = all.filter((q) => view.picks[q.n] === q.ans).length;
  const parts = l.parts.map((p) => {
    const shared = p.opts ? `<ul class="wb-bank">${p.opts.map((o) => `<li><b>${o.k}</b> ${zhPy(o.zh, o.py)}</li>`).join('')}</ul>` : '';
    return `<section class="wb-part"><h2>${esc(p.title)}</h2><p class="muted">${esc(p.hint)}</p>
      ${p.img ? `<img class="wb-img" src="${esc(p.img)}" alt="Hình ${esc(p.title)}" loading="lazy">` : ''}${shared}
      ${p.qs.map((q) => {
        const keys = q.opts ? q.opts.map((o) => o.k) : p.opts ? p.opts.map((o) => o.k) : [...p.letters];
        const btn = (k) => {
          const o = q.opts?.find((x) => x.k === k);
          const cls = view.picks[q.n] === k ? (view.done ? (k === q.ans ? 'right' : 'wrong') : 'on') : view.done && k === q.ans ? 'right' : '';
          return `<button class="opt wb-opt ${cls}" data-action="wb-pick" data-n="${q.n}" data-k="${k}" ${view.done ? 'disabled' : ''}><b>${k}</b>${o ? zhPy(o.zh, o.py) : ''}</button>`;
        };
        return `<div class="wb-q"><div class="wb-qhead"><b>${q.n}.</b>${q.t ? `<button class="speak sm" data-action="wb-play" data-n="${q.n}" aria-label="Nghe câu ${q.n}">${icon('speaker-high', true)}</button>` : ''}${q.text ? zhPy(q.text, q.py) : ''}</div>
          <div class="wb-opts${q.opts ? ' list' : ''}">${keys.map(btn).join('')}</div>${view.done && q.tr ? `<details class="wb-tr"><summary>Nghĩa</summary>${q.tr.map((x) => `<p>${zhPy(x.zh, x.py)}<small>${esc(x.en)}</small><small>${esc(x.vi)}</small></p>`).join('')}</details>` : ''}</div>`;
      }).join('')}</section>`;
  }).join('');
  const answered = Object.keys(view.picks).length;
  return `<main class="page"><header class="list-head">${back('wb', 1)}<h1>${esc(l.title)}</h1><span class="counter">${view.done ? `${score}/${all.length}` : `${answered}/${all.length}`}</span></header>
    ${view.done ? `<p class="wb-score">Đúng ${score}/${all.length} câu</p>${tomie(score * 2 >= all.length ? 'done' : 'bad')}` : ''}
    ${parts}
    ${pager('wb', wbData.lessons.filter((x) => x.parts).map((x) => x.id), l.id, (id) => id === 16 ? 'Đề thi' : `Bài ${id}`)}
    <div class="footer">${view.done ? '<button class="btn primary block" data-action="wb-retry">Làm lại</button>' : `<button class="btn primary block" data-action="wb-submit" ${answered ? '' : 'disabled'}>Nộp bài</button>`}</div>
  </main>`;
}

// ---------- Bộ thủ (data/radicals.json: 214 Kangxi radicals + per-character breakdown and memory tip) ----------
let rad; // loaded in boot(), optional: practice works without it
/** Collapsed "Bộ thủ & mẹo nhớ" under a practised word: components and a story for each character. */
function charTips(word) {
  const cs = [...new Set(word)].filter((c) => rad?.chars[c]);
  if (!cs.length) return '';
  return `<details class="wb-tr tips"><summary>Bộ thủ &amp; mẹo nhớ</summary>${cs.map((c) => {
    const t = rad.chars[c];
    return `<p><span class="tip-head"><b class="han">${esc(c)}</b>${t.hv ? `<b>${esc(t.hv)}</b>` : ''}${t.p.map(([k, v]) => `<span class="chip-sm"><span class="han">${esc(k)}</span> ${esc(v)}</span>`).join('')}</span><small>${esc(t.m)}</small>${t.e ? `<small class="muted">📜 ${esc(t.e)}</small>` : ''}</p>`;
  }).join('')}</details>`;
}
function radicals() {
  const all = view.tab === 'all';
  const list = all ? rad.radicals : rad.radicals.filter((r) => r.top);
  const tab = (v, t) => `<button class="${(v === 'all') === all ? 'on' : ''}" data-action="rad" data-tab="${v}" aria-pressed="${(v === 'all') === all}">${t}</button>`;
  return `<main class="page"><header class="list-head"><button class="icon-btn" data-action="home" aria-label="Quay lại">${icon('arrow-left')}</button><h1>Bộ thủ</h1><span class="counter">${list.length}</span></header>
    <div class="seg lang">${tab('top', '50 bộ thường dùng')}${tab('all', `Đủ ${rad.radicals.length} bộ`)}</div>
    <div class="words">${list.map((r) => `<div class="rad-row">
      <span class="rad-hz han">${esc(r.r)}${r.v ? `<small>${esc(r.v)}</small>` : ''}</span>
      <span><b>${r.n}. ${esc(r.hv)}</b> · ${esc(r.vi)} <span class="muted">${esc(r.py)} · ${r.s} nét</span>
        <p class="rad-ex han">${esc(r.ex)}</p><p class="muted">${esc(r.m)}</p></span>
      ${speakBtn(r.r, true)}</div>`).join('')}</div></main>`;
}

// ---------- Chinext Education (data/chinext.json: sentences from the class videos, one session per buổi) ----------
let cxData, cxLesson;
async function openCx(m) {
  try { cxData ??= await (await fetch('data/chinext.json', { cache: 'no-cache' })).json(); } catch { return alert('Không tải được Chinext.'); }
  player.pause(); keepAlive.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel();
  view = { name: 'cx', lvl: m ?? '' };
  render(); mediaState();
}
function cxView() {
  const head = (t) => `<header class="list-head"><button class="icon-btn" data-action="${view.lvl ? 'cx' : 'home'}" aria-label="Quay lại">${icon('arrow-left')}</button><h1>${t}</h1></header>`;
  const item = (act, ic, t, sub, attr) => `<button class="menu-item" data-action="${act}" ${attr}>${icon(ic)}<span><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('caret-right')}</button>`;
  if (!view.lvl) return `<main class="page">${head('Chinext Education')}<nav class="menu">${item('cx', 'headphones', 'Luyện nghe', '', 'data-m="listen"')}${item('cx', 'text-align-left', 'Luyện viết câu', 'Xem nghĩa, viết câu tiếng Trung', 'data-m="write"')}</nav></main>`;
  return `<main class="page">${head(view.lvl === 'listen' ? 'Luyện nghe' : 'Luyện viết câu')}<nav class="menu">${cxData.lessons.map((l) => item('cx-go', 'chalkboard-teacher', l.title, `${l.items.length} câu`, `data-id="${l.id}"`)).join('')}</nav></main>`;
}

// ---------- Giáo trình (data/textbook.json: 新HSK教程1 lessons 1–15 + appendix; mp3 per Chinese line in textbook/) ----------
let tbData;
const TB_DONE_KEY = 'hsk-tb-done'; // {lessonId: 1}
async function openTextbook(id, lvl) {
  try { tbData ??= await (await fetch('data/textbook.json', { cache: 'no-cache' })).json(); } catch { return alert('Không tải được giáo trình.'); }
  view = id ? { name: 'tb', id, lvl: 1 } : { name: 'tb', lvl: +lvl || 0 };
  render();
  scrollTo(0, 0);
}
const tbSay = (zh) => `<button class="speak sm" data-tb-say="${esc(zh)}" aria-label="Nghe">${icon('speaker-high', true)}</button>`;
/** One Chinese line: speaker, hanzi + pinyin, Vietnamese under it. */
const tbLine = (x, who) => `<div class="tb-line">${tbSay(x.zh)}<span>${who ? `<b class="tb-who han">${esc(who)}</b>` : ''}${zhPy(x.zh, x.py)}${x.vi ? `<small class="tb-vi">${esc(x.vi)}</small>` : ''}</span></div>`;
const tbWord = (w) => `<div class="tb-word">${tbSay(w.zh)}<span class="han">${esc(w.zh)}</span><span><b>${esc(w.py)}</b> ${w.pos ? `<i class="muted">${esc(w.pos)}</i> ` : ''}${esc(w.vi)}</span></div>`;
const tbWords = (ws, names) => `<div class="words">${ws.map(tbWord).join('')}${names?.length ? `<p class="tb-sub">Danh từ riêng</p>${names.map(tbWord).join('')}` : ''}</div>`;
function textbook() {
  const back = (lvl = '') => `<button class="icon-btn" data-action="${view.lvl ? 'tb' : 'home'}" data-lvl="${lvl}" aria-label="Quay lại">${icon('arrow-left')}</button>`;
  if (!view.lvl) {
    return `<main class="page"><header class="list-head">${back()}<h1>Giáo trình</h1></header><nav class="menu">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      `<button class="menu-item" data-action="tb" data-lvl="${n}">${icon('book-open-text')}<span><b>HSK${n}</b>${n === 1 ? '' : '<small>Chưa có giáo trình</small>'}</span>${icon('caret-right')}</button>`).join('')}</nav></main>`;
  }
  if (view.lvl > 1) return `<main class="page"><header class="list-head">${back()}<h1>HSK${view.lvl}</h1></header><p class="muted">Chưa có giáo trình.</p></main>`;
  if (!view.id) {
    const done = loadJSON(TB_DONE_KEY) ?? {};
    return `<main class="page"><header class="list-head">${back()}<h1>HSK1</h1><span class="counter">${icon('heart', true)} ${Object.keys(done).length}/${tbData.lessons.length}</span></header><nav class="menu">${tbData.lessons.map((l) =>
      `<div class="wb-row"><button class="menu-item${done[l.id] ? ' done' : ''}" data-action="tb" data-id="${l.id}"><span class="wb-slot"></span><span><b>Bài ${l.id}: <span class="han">${esc(l.title)}</span></b><small>${esc(l.vi)}</small></span>${icon('caret-right')}</button>
      <span class="wb-tick tb-mark${done[l.id] ? ' on' : ''}" aria-label="${done[l.id] ? 'Đã học' : 'Chưa học'}"><img src="img/wb-${done[l.id] ? 'done' : 'todo'}.png" alt=""></span></div>`).join('')}
      <button class="menu-item" data-action="tb" data-id="pos">${icon('tag')}<span><b>Bảng đối chiếu từ loại</b></span>${icon('caret-right')}</button>
      <button class="menu-item" data-action="tb" data-id="vocab">${icon('list-bullets')}<span><b>Bảng từ vựng</b><small>${tbData.vocab.length} từ · ${tbData.names.length} danh từ riêng</small></span>${icon('caret-right')}</button></nav></main>`;
  }
  const head = (t, n = '') => `<header class="list-head">${back(1)}<h1>${t}</h1>${n}</header>`;
  if (view.id === 'pos') {
    return `<main class="page">${head('Từ loại')}<div class="words">${tbData.pos.map((p) => `<div class="tb-word pos"><span class="han">${esc(p.zh)}</span><span>${esc(p.vi)}</span><b>${esc(p.abbr)}</b></div>`).join('')}</div></main>`;
  }
  if (view.id === 'vocab') {
    const row = (v) => `<div class="tb-word" data-q="${esc(fold(v.zh + v.py))}">${tbSay(v.zh)}<span class="han">${v.star ? '★' : ''}${esc(v.zh)}</span><span>${esc(v.py)}</span><span class="muted">Bài ${(v.lessons ?? [v.lesson]).join(', ')}</span></div>`;
    return `<main class="page">${head('Bảng từ vựng', `<span class="counter">${tbData.vocab.length}</span>`)}
      <input id="tb-search" class="search" type="search" placeholder="Tìm chữ Hán hoặc pinyin" autocomplete="off">
      <div class="words tb-words">${tbData.vocab.map(row).join('')}<p class="tb-sub">Danh từ riêng</p>${tbData.names.map(row).join('')}</div>
      <p class="muted">★ từ vượt khung HSK1.</p></main>`;
  }
  const l = tbData.lessons.find((x) => x.id === +view.id);
  const blocks = l.blocks.map((b) => {
    if (b.kind === 'text') {
      return `<section class="tb-part"><h2>${esc(b.title.replace('课文', 'Bài khóa '))}</h2>${b.scene ? `<p class="muted tb-scene">${esc(b.scene.vi)}</p>` : ''}
        ${b.lines.map((x) => tbLine(x, x.who)).join('')}${b.words?.length || b.names?.length ? `<h3>Từ mới</h3>${tbWords(b.words ?? [], b.names)}` : ''}</section>`;
    }
    if (b.kind === 'grammar') {
      return `<details class="wb-tr tb-gram"><summary>Ngữ pháp: <span class="han">${esc(b.title)}</span> · ${esc(b.title_vi)}</summary>
        <p>${esc(b.vi)}</p>${b.ex.map((x) => tbLine(x)).join('')}</details>`;
    }
    return `<section class="tb-part"><h2>Luyện đọc nhanh (绕口令)</h2>${b.lines.map((x) => tbLine(x)).join('')}</section>`;
  }).join('');
  const learnt = (loadJSON(TB_DONE_KEY) ?? {})[l.id];
  return `<main class="page">${head(`Bài ${l.id}`)}<p class="tomie wb-toast" role="status"></p>
    <h2 class="tb-title">${zhPy(l.title, l.py)}<small>${esc(l.vi)}</small></h2>
    ${l.goals?.length ? `<details class="wb-tr"><summary>Mục tiêu</summary>${l.goals.map((g) => `<p>${esc(g.vi)}</p>`).join('')}</details>` : ''}
    ${blocks}
    <div class="tb-next"><button class="btn primary block" data-action="tb-learnt" ${learnt ? 'disabled' : ''}>${learnt ? 'Đã học xong' : 'Đã học'}</button>${pager('tb', tbData.lessons.map((x) => x.id), l.id, (id) => `Bài ${id}`)}</div>
  </main>`;
}

// ---------- Đề TOEIC (/english/ only; data/toeic.json: 10 ETS 2026 LR tests as page scans + key, 5 Speaking + 5 Writing tests) ----------
let toeic;
const TOEIC_KEY = 'eng-toeic'; // {'L3': {s, n, d}} latest submitted score per skill+test
const TOEIC_DRAFT = 'eng-toeic-draft'; // {'W2-6': text} Writing drafts
const SKILLS = { L: ['Nghe', 'headphones'], R: ['Đọc', 'book-open'], S: ['Nói', 'microphone'], W: ['Viết', 'pencil-simple-line'] };
async function openToeic(sk, id) {
  try { toeic ??= await (await fetch('data/toeic.json', { cache: 'no-cache' })).json(); } catch { return alert('Không tải được đề TOEIC.'); }
  stopRec();
  view = { name: 'toeic', lvl: sk || '', id: id ? +id : undefined, picks: {}, done: false };
  render();
  scrollTo(0, 0);
}
// ponytail: raw x 5 clamped to 5–495 is a rough linear estimate; ETS uses a per-form conversion table.
const toeicScale = (s) => Math.max(5, Math.min(495, s * 5));
const sample = (title, text, au) => `<details class="wb-tr"><summary>${title}</summary>${au ? `<button class="speak sm" data-au="${esc(au)}" aria-label="Nghe">${icon('speaker-high', true)}</button>` : ''}<p class="t-pre">${esc(text)}</p></details>`;
const recBtn = (k) => `<span class="t-rec"><button class="btn" data-action="t-rec" data-k="${k}">${icon('microphone')} Ghi âm</button><audio controls hidden data-rec="${k}"></audio></span>`;
function toeicView() {
  const back = (sk = '') => `<button class="icon-btn" data-action="${view.lvl ? 'toeic' : 'home'}" data-sk="${sk}" aria-label="Quay lại">${icon('arrow-left')}</button>`;
  const head = (t, b, n = '') => `<header class="list-head">${b}<h1>${t}</h1>${n}</header>`;
  const sk = view.lvl;
  if (!sk) return `<main class="page">${head('Đề TOEIC', back())}<nav class="menu">${Object.entries(SKILLS).map(([k, [t, ic]]) =>
    `<button class="menu-item" data-action="toeic" data-sk="${k}">${icon(ic)}<span><b>${t}</b><small>${k === 'L' || k === 'R' ? '10 đề ETS 2026' : `${(k === 'S' ? toeic.speak : toeic.write).length} đề luyện`}</small></span>${icon('caret-right')}</button>`).join('')}</nav></main>`;
  const list = sk === 'L' || sk === 'R' ? toeic.lr : sk === 'S' ? toeic.speak : toeic.write;
  if (!view.id) {
    const last = loadJSON(TOEIC_KEY) ?? {};
    return `<main class="page">${head(SKILLS[sk][0], back())}<nav class="menu">${list.map((t) => {
      const l = last[sk + t.id];
      return `<button class="menu-item${l ? ' done' : ''}" data-action="toeic" data-sk="${sk}" data-id="${t.id}">${icon('exam')}<span><b>Test ${t.id}</b>${l ? `<small>Lần gần nhất: ${l.s}/${l.n} · ${l.d}</small>` : ''}</span>${icon('caret-right')}</button>`;
    }).join('')}</nav></main>`;
  }
  const t = list.find((x) => x.id === view.id);
  const pg = pager('toeic', list.map((x) => x.id), t.id, (id) => `Test ${id}`).replace(/data-action="toeic"/g, `data-action="toeic" data-sk="${sk}"`);
  if (sk === 'L' || sk === 'R') {
    const qs = Object.keys(t.items).map(Number).filter((n) => (sk === 'L' ? n <= 100 : n > 100));
    const score = qs.filter((n) => view.picks[n] === t.items[n].a).length, answered = qs.filter((n) => view.picks[n]).length;
    // One block per question: photo/graphic crop, question + options as text, passage text before its set; Nghĩa = Vietnamese, allowed during the test.
    const doc = (n) => t.docs.find((x) => x.f === n);
    const qRow = (n) => {
      const it = t.items[n], letters = 'ABCD'.slice(0, it.o.length), txt = n >= 32, d = doc(n), fig = t.figs[n];
      // Listening: own clip per question (Part 1-2) or per set (Part 3-4), script anytime behind a toggle.
      const g = sk === 'L' && n > 31 && t.groups.find((x) => x.f === n), clip = sk === 'L' && (n < 32 || g) && `toeic/t${String(t.id).padStart(2, '0')}/q/${n}.mp3`;
      // Nghĩa: each English sentence followed by its Vietnamese.
      const vl = (en, vi) => `<p><span>${en}</span>${vi ? `<small class="muted">${esc(vi)}</small>` : ''}</p>`;
      const sc = !clip ? '' : g ? (g.tr ?? [[g.sc, g.vi]]).map(([e, v]) => vl(esc(e), v)).join('') : `${it.q ? vl(esc(it.q), it.v?.q) : ''}${it.o.map((o, i) => vl(`<b>${'ABCD'[i]}</b> ${esc(o)}`, it.v?.o[i])).join('')}`;
      const btn = (k, i) => {
        const cls = view.picks[n] === k ? (view.done ? (k === it.a ? 'right' : 'wrong') : 'on') : view.done && k === it.a ? 'right' : '';
        return `<button class="opt wb-opt ${cls}" data-action="t-pick" data-n="${n}" data-k="${k}" ${view.done ? 'disabled' : ''}><b>${k}</b>${txt ? `<span>${esc(it.o[i])}</span>` : ''}</button>`;
      };
      const set = d ?? t.groups.find((x) => x.f === n);
      return `${set && n > 31 ? `<h2 class="t-set">Câu ${set.f}–${set.t}</h2>` : ''}${fig ? `<img class="wb-img t-fig" src="${esc(fig)}" alt="Hình câu ${n}" loading="lazy">` : ''}
        ${d ? `<div class="t-box t-pre t-doc">${esc(d.text)}</div><details class="wb-tr"><summary>Nghĩa đoạn văn</summary><p class="t-pre">${esc(d.vi)}</p></details>` : ''}
        ${clip ? `<audio class="t-clip" controls preload="none" src="${clip}"></audio><details class="wb-tr"><summary>Nghĩa</summary>${sc}</details>` : ''}
        <div class="wb-q"><div class="wb-qhead"><b>${n}.</b>${txt && it.q ? `<span>${esc(it.q)}</span>` : ''}</div><div class="wb-opts${txt ? ' list' : ''}">${letters.split('').map(btn).join('')}</div>
        ${txt && it.v ? `<details class="wb-tr"><summary>Nghĩa</summary>${it.v.q ? `<p>${esc(it.v.q)}</p>` : ''}${it.v.o.map((o, i) => `<p><b>${'ABCD'[i]}</b> ${esc(o)}</p>`).join('')}</details>` : ''}
        ${view.done ? `<details class="wb-tr"><summary>Giải thích</summary>${txt ? '' : it.o.map((o, i) => `<p><b>${'ABCD'[i]}</b> ${esc(o)}</p>`).join('')}<p class="muted">${esc(it.vi)}</p>${it.ex ? `<p>${esc(it.ex)}</p>` : ''}</details>` : ''}</div>`;
    };
    const pages = qs.map(qRow).join('');
    return `<main class="page">${head(`${SKILLS[sk][0]} · Test ${t.id}`, back(sk), `<span class="counter">${view.done ? score : answered}/${qs.length}</span>`)}
      ${view.done ? `<p class="wb-score">Đúng ${score}/${qs.length} · ≈ ${toeicScale(score)}/495</p>${tomie(score * 2 >= qs.length ? 'done' : 'bad')}` : ''}
      ${pages}${pg}
      <div class="footer">${view.done ? '<button class="btn primary block" data-action="t-retry">Làm lại</button>' : `<button class="btn primary block" data-action="t-submit" ${answered ? '' : 'disabled'}>Nộp bài</button>`}</div></main>`;
  }
  if (sk === 'S') {
    const task = (n, time, body) => `<section class="wb-part"><h2>Câu ${n}</h2><p class="muted">${time}</p>${body}</section>`;
    const info = t.q810.info;
    return `<main class="page">${head(`Nói · Test ${t.id}`, back(sk))}
      ${t.read.map((r, i) => task(i + 1, 'Đọc to đoạn văn · chuẩn bị 45s, đọc 45s', `<p class="t-pre t-box">${esc(r.text)}</p>${recBtn(`r${i}`)}${sample('Nghe mẫu &amp; mẹo', t.tip, r.au)}`)).join('')}
      ${t.pics.map((p, i) => task(i + 3, 'Mô tả bức tranh · chuẩn bị 45s, nói 30s', `<img class="wb-img" src="${esc(p.src)}" alt="Tranh" loading="lazy"><small class="muted">Ảnh: ${esc(p.by)}</small>${recBtn(`p${i}`)}${sample('Bài mẫu', p.sample, p.au)}`)).join('')}
      <section class="wb-part"><h2>Câu 5–7</h2><p class="muted">Trả lời câu hỏi · chuẩn bị 3s, nói 15s / 15s / 30s</p><p class="t-box">${esc(t.q57.ctx)}</p>
        ${t.q57.qs.map((q, i) => `<div class="wb-q"><div class="wb-qhead"><b>${i + 5}.</b><button class="speak sm" data-au="${esc(q.qa)}" aria-label="Nghe câu hỏi">${icon('speaker-high', true)}</button><span>${esc(q.q)}</span></div>${recBtn(`a${i}`)}${sample('Bài mẫu', q.sample, q.au)}</div>`).join('')}</section>
      <section class="wb-part"><h2>Câu 8–10</h2><p class="muted">Trả lời dựa trên thông tin · đọc 45s, chuẩn bị 3s, nói 15s / 15s / 30s</p>
        <div class="t-box"><b>${esc(info.title)}</b>${info.sub ? `<p class="t-pre muted">${esc(info.sub)}</p>` : ''}<table class="t-info">${info.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>
        <p><button class="speak sm" data-au="${esc(t.q810.ia)}" aria-label="Nghe">${icon('speaker-high', true)}</button> <i>${esc(t.q810.intro)}</i></p>
        ${t.q810.qs.map((q, i) => `<div class="wb-q"><div class="wb-qhead"><b>${i + 8}.</b><button class="speak sm" data-au="${esc(q.qa)}" aria-label="Nghe câu hỏi">${icon('speaker-high', true)}</button></div>${recBtn(`b${i}`)}${sample('Câu hỏi &amp; bài mẫu', `${q.q}\n\n${q.sample}`, q.au)}</div>`).join('')}</section>
      ${task(11, 'Nêu ý kiến · chuẩn bị 45s, nói 60s', `<p class="t-box">${esc(t.q11.q)}</p>${recBtn('o')}${sample('Bài mẫu', t.q11.sample, t.q11.au)}`)}
      ${pg}</main>`;
  }
  const drafts = loadJSON(TOEIC_DRAFT) ?? {};
  const area = (n, rows) => `<textarea class="t-write" data-draft="W${t.id}-${n}" rows="${rows}" spellcheck="false" placeholder="Viết bài của chị ở đây…">${esc(drafts[`W${t.id}-${n}`] ?? '')}</textarea><small class="muted t-wc" data-wc="W${t.id}-${n}">${words(drafts[`W${t.id}-${n}`])} từ</small>`;
  return `<main class="page">${head(`Viết · Test ${t.id}`, back(sk))}
    <section class="wb-part"><h2>Câu 1–5</h2><p class="muted">Viết MỘT câu về bức tranh, dùng đủ 2 từ cho sẵn · 8 phút cho cả 5 câu</p>
      ${t.pics.map((p, i) => `<div class="wb-q"><b>${i + 1}.</b> <span class="chip-sm">${esc(p.w[0])}</span> / <span class="chip-sm">${esc(p.w[1])}</span><img class="wb-img" src="${esc(p.src)}" alt="Tranh" loading="lazy"><small class="muted">Ảnh: ${esc(p.by)}</small>${area(i + 1, 2)}${sample('Câu mẫu', p.sample)}</div>`).join('')}</section>
    ${t.emails.map((m, i) => `<section class="wb-part"><h2>Câu ${i + 6}</h2><p class="muted">Trả lời e-mail · 10 phút</p>
      <div class="t-box t-mail"><small>From: ${esc(m.from)}<br>To: ${esc(m.to)}<br>Subject: ${esc(m.subject)}<br>Sent: ${esc(m.sent)}</small><p class="t-pre">${esc(m.body)}</p></div>
      <p><b>${esc(m.task)}</b></p>${area(i + 6, 8)}${sample('Bài mẫu', `${m.sample}\n\n💡 ${m.tip}`)}</section>`).join('')}
    <section class="wb-part"><h2>Câu 8</h2><p class="muted">Viết bài luận nêu ý kiến · 30 phút, tối thiểu 300 từ</p><p class="t-box"><b>${esc(t.essay.q)}</b></p>
      ${area(8, 14)}${sample('Dàn ý', t.essay.outline)}${sample('Bài mẫu', t.essay.sample)}</section>
    ${pg}</main>`;
}
const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
// Speaking: record from the mic and play it back (device only, nothing uploaded).
let rec;
function stopRec() { if (rec?.state === 'recording') rec.stop(); }
async function toggleRec(btn) {
  if (rec?.state === 'recording') return stopRec();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return alert('Chưa cho phép dùng micro.'); }
  const chunks = [], k = btn.dataset.k;
  rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    stream.getTracks().forEach((x) => x.stop());
    btn.innerHTML = `${icon('microphone')} Ghi lại`; btn.classList.remove('on');
    const a = root.querySelector(`[data-rec="${k}"]`);
    if (a) { a.src = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })); a.hidden = false; }
  };
  rec.start();
  btn.innerHTML = `${icon('stop', true)} Dừng`; btn.classList.add('on');
}

// ---------- Controller ----------

/** Touch screens: no auto-focus into inputs, the keyboard would cover the word. Keep it only while already typing. */
const KEYBOARD_ON_OPEN = matchMedia('(pointer: fine)').matches;
let wasTyping = false;
let lastKey = 'home||', popping = false;

function render() {
  const views = { home, practice, radicals, words: wordList, quiz, summary, write, listen, wb: workbook, tb: textbook, toeic: toeicView, cx: cxView };
  wasTyping = document.activeElement?.matches?.('#hz-in, #py') ?? false;
  if (view.name !== 'practice') lessonPickerOpen = false; // picker reopens closed next time
  root.innerHTML = views[view.name]();
  // Phone back button: one history entry per screen opened by a tap (Chrome skips entries pushed without a tap,
  // e.g. from popstate, and back then closes the app). Home drops them all; popstate walks back via the screen's arrow.
  const key = [view.name, view.lvl, view.id].join('|'), d = history.state?.d ?? 0;
  if (view.name === 'home') { if (d) history.go(-d); }
  else if (key !== lastKey && !popping && !(view.id && lastKey.startsWith(`${view.name}|${view.lvl}|`) && !lastKey.endsWith('|'))) history.pushState({ d: d + 1 }, ''); // prev/next lesson replaces, not stacks
  lastKey = key;
  if (view.name === 'quiz') onQuestionShown();
  if (view.name === 'write') {
    setupHand();
    // With the pad open, keep the on-screen keyboard down.
    const target = view.state.done ? null : view.state.hand || !(KEYBOARD_ON_OPEN || wasTyping) ? null : '#hz-in';
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
    requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: 'nearest' }));
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
  const lesson = pickedLesson === '' ? null : picked();
  // Same no-repeat bag as write practice: every word of the pick comes up once before any repeats.
  const pool = mode === 'all' ? data.words.filter((w) => lesson == null || lesson.includes(w.lesson)) : [];
  const pick = pool.length ? [...Array(Math.min(5, pool.length))].map(() => drawFromBag(`quiz|${pickedLesson}`, pool, (w) => w.hanzi).hanzi) : null;
  const qs = buildSession(data, progress, mode, { lesson, pick });
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

// Phone: tapping Kiểm tra/Bỏ qua while typing would blur the input first; the keyboard closes, the layout jumps
// and the tap's click lands nowhere. Keep focus on pointerdown so the click always reaches the button.
root.addEventListener('pointerdown', (e) => {
  if (document.activeElement?.matches?.('#hz-in, #py') && e.target.closest('.footer button, #py-check')) e.preventDefault();
});

root.addEventListener('click', (e) => {
  const ev = e.target.closest('[data-say-envi]');
  // Hidden answer (Luyện từ vựng): Vietnamese only, English would give it away.
  if (ev) return ev.dataset.hide ? sayVi(ev.dataset.sayEnvi, ev.dataset.vi) : sayEnVi(ev.dataset.sayEnvi, ev.dataset.vi);
  const zh = e.target.closest('[data-say-zh]');
  // Hidden answer (Luyện từ vựng): meanings only, the Chinese would give it away.
  if (zh) { const { sayZh: t, en, vi, hide } = zh.dataset; return hide ? sayMean(t, en, vi) : say(t, () => sayMean(t, en, vi)); }
  const enBtn = e.target.closest('[data-say-en]');
  if (enBtn) return sayEn(enBtn.dataset.sayEn);
  const tbBtn = e.target.closest('[data-tb-say]');
  if (tbBtn) {
    e.preventDefault();
    return play(`textbook/${encodeURIComponent(tbBtn.dataset.tbSay)}.mp3`, tbBtn.dataset.tbSay, 'zh-CN');
  }
  const auBtn = e.target.closest('[data-au]');
  if (auBtn) { e.preventDefault(); return play(auBtn.dataset.au, '', 'en-US'); }
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
  // In-app back arrow = phone back: pop the history entry, popstate then does the navigation.
  if (!popping && history.state?.d && el.matches('.list-head .icon-btn, .quiz-top .icon-btn')) return history.back();
  const act = el.dataset.action;
  if (act === 'toeic') openToeic(el.dataset.sk ?? (view.name === 'toeic' ? view.lvl : ''), el.dataset.id);
  else if (act === 't-pick') { if (!view.done) { view.picks[el.dataset.n] = el.dataset.k; el.closest('.wb-opts').querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el)); root.querySelector('.counter').textContent = `${Object.keys(view.picks).length}/100`; root.querySelector('[data-action=t-submit]').disabled = false; } }
  else if (act === 't-submit') {
    if (!confirm('Nộp bài và xem đáp án?')) return;
    view.done = true; root.querySelectorAll('.t-clip').forEach((a) => a.pause());
    const t = toeic.lr.find((x) => x.id === view.id), qs = Object.keys(t.items).map(Number).filter((n) => (view.lvl === 'L' ? n <= 100 : n > 100));
    const last = loadJSON(TOEIC_KEY) ?? {}, d = new Date();
    last[view.lvl + view.id] = { s: qs.filter((n) => view.picks[n] === t.items[n].a).length, n: qs.length, d: `${d.getDate()}/${d.getMonth() + 1}` };
    try { localStorage.setItem(TOEIC_KEY, JSON.stringify(last)); } catch { /* private mode */ }
    render(); scrollTo(0, 0);
  }
  else if (act === 't-retry') { if (confirm('Làm lại từ đầu?')) openToeic(view.lvl, view.id); }
  else if (act === 't-rec') toggleRec(el);
  else if (act === 'cx') openCx(el.dataset.m);
  else if (act === 'cx-go') {
    cxLesson = cxData.lessons.find((l) => l.id === +el.dataset.id);
    if (view.lvl === 'write') return startWrite('cx');
    const items = cxLesson.items, key = `cx${cxLesson.id}`, at = (loadJSON(LISTEN_KEY) ?? {})[key];
    if (at > 0 && at < items.length) { view = { name: 'listen', state: { items, i: at, on: false, ask: true, key } }; render(); }
    else { view = { name: 'listen', state: { items, i: 0, on: true, key } }; keepAlive.play().catch(() => {}); listenStep(); }
  }
  else if (act === 'wb') openWorkbook(el.dataset.id, el.dataset.lvl);
  else if (act === 'wb-play') wbPlay(el.dataset.n);
  else if (act === 'tb-learnt' || (act === 'tb' && view.name === 'tb' && +el.dataset.id === +view.id + 1)) {
    // Giáo trình: "Đã học" or going to the next lesson marks the current one done (no manual tick on the list)
    const done = loadJSON(TB_DONE_KEY) ?? {}, fresh = !done[view.id];
    done[view.id] = 1;
    try { localStorage.setItem(TB_DONE_KEY, JSON.stringify(done)); } catch { /* private mode */ }
    (act === 'tb' ? openTextbook(el.dataset.id) : Promise.resolve(render())).then(() => fresh && toast(TOMIE.learnt));
  }
  else if (act === 'tb') openTextbook(el.dataset.id, el.dataset.lvl);
  else if (act === 'wb-pick') { if (!view.done) { view.picks[el.dataset.n] = el.dataset.k; render(); } }
  else if (act === 'wb-submit') {
    view.done = true; wbAudio.pause();
    // submitting marks the lesson done and keeps its latest score for the HSK1 list
    const qs = wbData.lessons.find((x) => x.id === view.id).parts.flatMap((p) => p.qs);
    const done = loadJSON(WB_DONE_KEY) ?? {}, last = loadJSON(WB_SCORE_KEY) ?? {}, d = new Date();
    done[view.id] = 1;
    last[view.id] = { s: qs.filter((q) => view.picks[q.n] === q.ans).length, n: qs.length, d: `${d.getDate()}/${d.getMonth() + 1}` };
    try { localStorage.setItem(WB_DONE_KEY, JSON.stringify(done)); localStorage.setItem(WB_SCORE_KEY, JSON.stringify(last)); } catch { /* private mode */ }
    render(); scrollTo(0, 0);
  }
  else if (act === 'wb-retry') openWorkbook(view.id);
  else if (act === 'practice') { player.pause(); keepAlive.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel(); view = { name: 'practice' }; render(); mediaState(); }
  else if (act === 'home') { stopRec(); player.pause(); keepAlive.pause(); wbAudio.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel(); view = { name: 'home' }; render(); mediaState(); }
  else if (act === 'listen') {
    const items = [...practiceWords().filter(inLesson), ...data.sentences.filter(inLesson)];
    if (!items.length) return alert(`${pickedName()} chưa có từ nào.`);
    // Left off mid-way last time: stop there and offer Nghe tiếp / Nghe lại từ đầu.
    const at = (loadJSON(LISTEN_KEY) ?? {})[pickedLesson];
    if (at > 0 && at < items.length) { view = { name: 'listen', state: { items, i: at, on: false, ask: true } }; render(); }
    else { view = { name: 'listen', state: { items, i: 0, on: true } }; keepAlive.play().catch(() => {}); listenStep(); }
  }
  else if (act === 'listen-restart') { Object.assign(view.state, { i: 0, on: true }); keepAlive.play().catch(() => {}); listenStep(); }
  else if (act === 'listen-toggle') listenToggle();
  else if (act === 'listen-move') listenMove(+el.dataset.d);
  else if (act === 'words') { view = { name: 'words' }; render(); }
  else if (act === 'rad') {
    if (!rad) return alert('Chưa tải được bộ thủ.');
    view = { name: 'radicals', tab: el.dataset.tab ?? view.tab ?? 'top' }; render(); scrollTo(0, 0);
  }
  else if (act === 'tab') { view = { name: 'words', tab: el.dataset.tab }; render(); }
  else if (act === 'write') startWrite(el.dataset.mode);
  else if (act === 'write-next') startWrite(view.mode);
  else if (act === 'reveal') { view.state = { ...view.state, typed: root.querySelector('#hz-in').value, revealed: true }; render(); say(writeCard(view.mode, view.item).text); }
  else if (act === 'check-write') checkWrite();
  else if (act === 'hand-toggle') { view.state = { ...view.state, typed: root.querySelector('#hz-in').value, hand: !view.state.hand }; render(); root.querySelector('.card')?.scrollIntoView({ block: 'start' }); }
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

// one TOEIC clip at a time
root.addEventListener('play', (e) => root.querySelectorAll('.t-clip').forEach((a) => a !== e.target && a.pause()), true);
root.addEventListener('input', (e) => {
  if (e.target.id === 'word-search') searchWords(e.target.value);
  if (e.target.dataset.draft) {
    const k = e.target.dataset.draft, all = loadJSON(TOEIC_DRAFT) ?? {};
    all[k] = e.target.value;
    try { localStorage.setItem(TOEIC_DRAFT, JSON.stringify(all)); } catch { /* private mode */ }
    root.querySelector(`[data-wc="${k}"]`).textContent = `${words(e.target.value)} từ`;
  }
  if (e.target.id === 'tb-search') { const f = fold(e.target.value); root.querySelectorAll('.tb-word[data-q]').forEach((r) => { r.hidden = !r.dataset.q.includes(f); }); }
});
root.addEventListener('change', (e) => {
  if (!e.target.classList.contains('lesson-pick')) return;
  // "Tất cả" clears the ticks; ticking a lesson unticks "Tất cả".
  pickedLesson = e.target.value === '' ? '' : [...root.querySelectorAll('.lesson-pick:checked')].map((b) => b.value).filter(Boolean).join(',');
  lessonPickerOpen = true;
  try { localStorage.setItem(LESSON_KEY, pickedLesson); } catch { /* private mode */ }
  render();
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  if (view.name === 'write') return checkWrite();
  const q = view.qs[view.i];
  const typed = view.state.typed ?? '';
  if (!typed.trim()) return;
  answer(EN ? sameHanzi(typed, q.word.hanzi) : q.word.pinyin.some((p) => normalize(p) === normalize(typed)));
});

async function boot() {
  try {
    const res = await fetch(EN ? 'data/english.json' : 'data/vocab.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    fetch('data/radicals.json', { cache: 'no-cache' }).then((r) => r.json()).then((j) => { rad = j; }).catch(() => {});
    base = await res.json();
    if (EN) base = fromEnglish(base);
    mergeData();
    render();
  } catch (err) {
    root.innerHTML = `<main class="page"><div class="empty">${icon('wifi-slash')}<p>Không tải được dữ liệu (${esc(err.message)}).</p><button class="btn" onclick="location.reload()">Thử lại</button></div></main>`;
  }
}
addEventListener('popstate', () => {
  if (view.name === 'home') return;
  popping = true;
  const b = root.querySelector('.list-head .icon-btn, .quiz-top .icon-btn');
  if (b) b.click(); else { view = { name: 'home' }; render(); }
  setTimeout(() => { popping = false; }, 600); // async screens (Giáo trình/Bài tập fetch) render after the click
});
boot();
