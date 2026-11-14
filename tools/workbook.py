# Build ~/hskchinese/data/workbook.json from hand-transcribed lessons (SBT HSK1 3.0, 模拟测练).
import json, os
from pypinyin import pinyin, Style

def py(s):
    return ' '.join(x[0] for x in pinyin(s, style=Style.TONE) if x[0].strip() and x[0] not in '，。？！、')

def q(n, ans, opts=None, text=None, t=None):
    d = {'n': n, 'ans': ans}
    if opts: d['opts'] = [{'k': k, 'zh': v, 'py': py(v)} for k, v in opts]
    if text: d['text'] = text; d['py'] = py(text)
    if t: d['t'] = t
    return d

L = 'Nghe và chọn đáp án đúng. Mỗi câu nghe hai lần.'
lessons = [{
    'id': 4, 'title': 'Bài 4: 我有两个孩子', 'audio': 'workbook/4.mp3',
    'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/4-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'B', t=[35, 57]), q(2, 'C', t=[58, 74]), q(3, 'B', t=[75, 95])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '十人'), ('B', '20个'), ('C', '三口人')], t=[141, 166]),
            q(5, 'B', [('A', '大'), ('B', '12岁'), ('C', '两千')], t=[167, 189])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/4-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[231, 275]), q(7, 'C', t=[276, 305]), q(8, 'B', t=[306, 347])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '中国人'), ('B', '泰国人'), ('C', '法国人')], t=[401, 434]),
            q(10, 'C', [('A', '安妮'), ('B', '王一飞'), ('C', '白家月')], t=[435, 492])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/4-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'C', text='老师，您好！'), q(12, 'D', text='我家有四口人。'), q(13, 'B', text='我哥哥今年20岁。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (A là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '好的，谢谢！'), ('B', '他今年5岁。'), ('C', '我女朋友。'), ('D', '是的。')], 'qs': [
            q(14, 'C', text='她是谁？'), q(15, 'D', text='你是法国人吗？'), q(16, 'B', text='您儿子多大？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống.',
         'opts': [('A', '想'), ('B', '忙'), ('C', '名字')], 'qs': [
            q(17, 'B', text='她工作很（ ）。'), q(18, 'A', text='男：你们好吗？ 女：很好，我们很（ ）你。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'B', [('A', '姐姐'), ('B', '三口人'), ('C', '四口人')], text='我家有三口人，爸爸、妈妈和我。 ★说话人家里有：'),
            q(20, 'A', [('A', '法国人'), ('B', '中国人'), ('C', '泰国人')], text='她是法国人，我不是。 ★“她”是：')]},
    ]},
    {'id': 5, 'title': 'Bài 5: 今天我休息', 'audio': 'workbook/5.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/5-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[36, 50]), q(2, 'A', t=[50, 60]), q(3, 'B', t=[60, 70])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'A', [('A', '我不会'), ('B', '我吃饺子'), ('C', '做面条儿')], t=[107, 122]),
            q(5, 'B', [('A', '休息'), ('B', '星期四'), ('C', '五口人')], t=[122, 146])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/5-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'C', t=[207, 234]), q(7, 'B', t=[234, 275]), q(8, 'D', t=[275, 305])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'B', [('A', '菜'), ('B', '饺子'), ('C', '面条儿')], t=[368, 406]),
            q(10, 'B', [('A', '4号'), ('B', '10号'), ('C', '14号')], t=[406, 447])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/5-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'D', text='王老师，再见。'), q(12, 'C', text='今天我休息。'), q(13, 'B', text='我有一个儿子，他今年7岁。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (A là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '好的，谢谢！'), ('B', '我不会。'), ('C', '面条儿。'), ('D', '5月6号。')], 'qs': [
            q(14, 'C', text='你去超市买什么？'), q(15, 'B', text='你会做饭吗？'), q(16, 'D', text='今天几号？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '几'), ('B', '好看'), ('C', '名字')], 'qs': [
            q(17, 'A', text='今天（ ）号？'), q(18, 'B', text='男：你的新电脑真（ ）！ 女：谢谢，我也很喜欢。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'C', [('A', '新电脑'), ('B', '中国菜'), ('C', '中文名字')], text='我非常喜欢我的中文名字。 ★说话人喜欢什么？'),
            q(20, 'B', [('A', '今天几号'), ('B', '哪天休息'), ('C', '星期几上班')], text='今天8号，你几号休息？ ★说话人想知道什么？')]},
    ]},
]

TOC = {5: '今天我休息', 6: '你的手机号是多少？', 7: '我晚上六点半下班', 8: '我爸爸在医院工作', 9: '我明天上午在学校学习',
       10: '这儿的苹果真便宜！', 11: '我读大学呢', 12: '昨天下雪了', 13: '请给我一杯茶', 14: '我看了一个电影', 15: '大兴机场见！'}
have = {l['id'] for l in lessons}
lessons += [{'id': i, 'title': f'Bài {i}: {t}'} for i, t in TOC.items() if i not in have]
if 16 not in have: lessons.append({'id': 16, 'title': 'Đề thi mô phỏng HSK 1'})
lessons.sort(key=lambda l: l['id'])
for l in lessons:
    for p in l.get('parts', []):
        if 'opts' in p: p['opts'] = [{'k': k, 'zh': v, 'py': py(v)} for k, v in p['opts']]
        assert all(os.path.exists(os.path.expanduser('~/hskchinese/' + x)) for x in [l['audio'], p.get('img', l['audio'])])

out = os.path.expanduser('~/hskchinese/data/workbook.json')
json.dump({'lessons': lessons}, open(out, 'w'), ensure_ascii=False, indent=1)
print(sum(len(p['qs']) for l in lessons for p in l.get('parts', [])), 'questions')
