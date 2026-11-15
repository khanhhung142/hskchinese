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
            q(1, 'B', t=[37.6, 57]), q(2, 'C', t=[61.3, 74]), q(3, 'B', t=[78.1, 95])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '十人'), ('B', '20个'), ('C', '三口人')], t=[141, 166]),
            q(5, 'B', [('A', '大'), ('B', '12岁'), ('C', '两千')], t=[167, 189])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/4-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[236.2, 275]), q(7, 'C', t=[276, 305]), q(8, 'B', t=[307.5, 347])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '中国人'), ('B', '泰国人'), ('C', '法国人')], t=[405.3, 434]),
            q(10, 'C', [('A', '安妮'), ('B', '王一飞'), ('C', '白家月')], t=[449.4, 492])]},
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
            q(4, 'A', [('A', '我不会'), ('B', '我吃饺子'), ('C', '做面条儿')], t=[107.7, 122]),
            q(5, 'B', [('A', '休息'), ('B', '星期四'), ('C', '五口人')], t=[137.3, 146])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/5-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'C', t=[207.5, 234]), q(7, 'B', t=[244.1, 275]), q(8, 'D', t=[275, 305])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'B', [('A', '菜'), ('B', '饺子'), ('C', '面条儿')], t=[370.5, 406]),
            q(10, 'B', [('A', '4号'), ('B', '10号'), ('C', '14号')], t=[407.5, 447])]},
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
    {'id': 6, 'title': 'Bài 6: 你的手机号是多少？', 'audio': 'workbook/6.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/6-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'B', t=[36.5, 58]), q(2, 'B', t=[60.4, 68]), q(3, 'C', t=[68, 90])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'A', [('A', '超市'), ('B', '做饭'), ('C', '东西')], t=[138.9, 151]),
            q(5, 'C', [('A', '去'), ('B', '西安饭店'), ('C', '坐出租车')], t=[166.4, 190])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/6-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'C', t=[240.5, 287]), q(7, 'B', t=[291.6, 317]), q(8, 'D', t=[322.4, 353])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '5362805'), ('B', '5398205'), ('C', '5326085')], t=[416, 461]),
            q(10, 'C', [('A', '包子'), ('B', '饺子'), ('C', '面条儿')], t=[461, 500])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/6-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'C', text='我有一个新电脑。'), q(12, 'B', text='今天星期二。'), q(13, 'D', text='我想去超市买东西。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '坐出租车。'), ('B', '真好看！'), ('C', '包子。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'C', text='你吃什么？'), q(15, 'A', text='我们怎么去？'), q(16, 'B', text='这是老师的新电脑。')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '有'), ('B', '牛奶'), ('C', '名字')], 'qs': [
            q(17, 'B', text='我想买（ ）。'), q(18, 'A', text='男：我的手机号是+86 13552721160。 女：我（ ）你的手机号，你的电话号呢？')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'A', [('A', '三口人'), ('B', '四口人'), ('C', '六口人')], text='我家有三口人：爸爸、妈妈和我。 ★说话人家里有几口人？'),
            q(20, 'B', [('A', '菜'), ('B', '牛奶'), ('C', '饺子')], text='明天星期天，我休息，想去超市买牛奶。 ★说话人想买什么？')]},
    ]},
    {'id': 7, 'title': 'Bài 7: 我晚上六点半下班', 'audio': 'workbook/7.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/7-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[35.7, 58]), q(2, 'A', t=[60.6, 77]), q(3, 'C', t=[79.4, 92])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '10:00'), ('B', '12:00'), ('C', '12号')], t=[142.5, 168]),
            q(5, 'C', [('A', '8月'), ('B', '三分钟'), ('C', '7:10')], t=[168, 186])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/7-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'C', t=[237.4, 280]), q(7, 'D', t=[281.5, 310]), q(8, 'B', t=[311.3, 340])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '上课'), ('B', '上班'), ('C', '看电影')], t=[399, 440]),
            q(10, 'C', [('A', '饭店'), ('B', '菜店'), ('C', '超市')], t=[442.1, 484])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/7-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'D', text='我在上课呢。'), q(12, 'C', text='我下午有事，晚上7:00见吧。'), q(13, 'B', text='今天不上班，我去超市买东西。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '早上七点半。'), ('B', '对不起，我有课。'), ('C', '电影院。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'C', text='我们在哪儿见？'), q(15, 'A', text='现在几点？'), q(16, 'B', text='我们下午去超市吧。')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '医院'), ('B', '中午'), ('C', '名字')], 'qs': [
            q(17, 'B', text='我们（ ）12:00下课。'), q(18, 'A', text='男：你现在在哪儿？ 女：我在（ ）呢。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'B', [('A', '8:30'), ('B', '10:10'), ('C', '10:20')], text='我今天早上八点半上课，十点十分下课。 ★说话人今天几点下课？'),
            q(20, 'A', [('A', '菜'), ('B', '饺子'), ('C', '牛奶')], text='妈妈今天休息，下午想去菜店买些菜。 ★妈妈下午想去菜店买：')]},
    ]},
    {'id': 8, 'title': 'Bài 8: 我爸爸在医院工作', 'audio': 'workbook/8.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/8-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[35.9, 58]), q(2, 'B', t=[58.4, 77]), q(3, 'A', t=[77.5, 92])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '去学校'), ('B', '房间外'), ('C', '在吃东西')], t=[139.8, 163]),
            q(5, 'A', [('A', '我能到'), ('B', '我吃午饭'), ('C', '我不能工作')], t=[163.4, 188])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/8-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[241.2, 270]), q(7, 'C', t=[270, 304]), q(8, 'B', t=[304.5, 337])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'C', [('A', '超市'), ('B', '饭店'), ('C', '学校书店')], t=[399.1, 441]),
            q(10, 'B', [('A', '去学校'), ('B', '看电影'), ('C', '去上班')], t=[442, 488])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/8-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'B', text='你的手机在桌子上呢。'), q(12, 'D', text='我在学校吃午饭。'), q(13, 'C', text='这个医院里病人多，医生工作很忙。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '医院。'), ('B', '我老师。'), ('C', '饺子和面条儿。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'C', text='桌子上有什么？'), q(15, 'B', text='她是谁？'), q(16, 'A', text='你爸爸在哪儿工作？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '能'), ('B', '有'), ('C', '名字')], 'qs': [
            q(17, 'B', text='我的房间里（ ）一只小猫。'), q(18, 'A', text='男：我们下午在书店见吧。 女：好的，我7:00（ ）到。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'A', [('A', '在家里'), ('B', '在书店'), ('C', '在医院工作')], text='昨天爸爸在医院工作，哥哥在家里休息，没去书店。 ★说话人的哥哥昨天：'),
            q(20, 'A', [('A', '米饭'), ('B', '包子'), ('C', '面条儿')], text='我喜欢吃米饭，我女朋友不喜欢。 ★说话人的女朋友不喜欢吃：')]},
    ]},
    {'id': 9, 'title': 'Bài 9: 我明天上午在学校学习', 'audio': 'workbook/9.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/9-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'B', t=[34.6, 57]), q(2, 'C', t=[57.6, 75]), q(3, 'A', t=[76.1, 92])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '书'), ('B', '我的'), ('C', '他的电脑')], t=[137.7, 160]),
            q(5, 'C', [('A', '星期天'), ('B', '孩子们'), ('C', '去外边唱歌')], t=[161.7, 186])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/9-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[236.9, 265]), q(7, 'C', t=[266.5, 299]), q(8, 'B', t=[299.8, 334])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '上午8:00'), ('B', '上午10:00'), ('C', '晚上8:00')], t=[394.4, 438]),
            q(10, 'B', [('A', '菜店'), ('B', '书店'), ('C', '超市')], t=[439.5, 484])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/9-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'D', text='妹妹和小狗今天在家里玩。'), q(12, 'C', text='房间外有一只小猫。'), q(13, 'B', text='这是我的第三个电脑。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '在家里。'), ('B', '我女朋友。'), ('C', '一只小猫。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'C', text='桌子上有什么？'), q(15, 'A', text='你今天下午在哪儿？'), q(16, 'B', text='你和谁在超市呢？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '2:00'), ('B', '上课'), ('C', '名字')], 'qs': [
            q(17, 'B', text='我上午在学校（ ），我们下午去看电影吧。'), q(18, 'A', text='男：我们下午几点在学校见？ 女：下午（ ）吧。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'A', [('A', '一'), ('B', '四'), ('C', '十一')], text='我有一只小狗，很漂亮，它是我的好朋友。 ★说话人有几只小狗？'),
            q(20, 'B', [('A', '外边'), ('B', '房间里'), ('C', '超市里')], text='星期天中午妈妈在做饭，我和妹妹在房间里玩。 ★说话人和妹妹在哪儿？')]},
    ]},
    {'id': 10, 'title': 'Bài 10: 这儿的苹果真便宜！', 'audio': 'workbook/10.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/10-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'B', t=[36.7, 60]), q(2, 'C', t=[61.4, 80]), q(3, 'B', t=[80, 96])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '10:00'), ('B', '十块钱'), ('C', '十本书')], t=[140.5, 164]),
            q(5, 'B', [('A', '不贵'), ('B', '很好看'), ('C', '120元')], t=[165.1, 190])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/10-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'C', t=[242.3, 253]), q(7, 'D', t=[253, 306]), q(8, 'B', t=[307.7, 338])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '很多'), ('B', '真贵'), ('C', '不好看')], t=[401.8, 442]),
            q(10, 'B', [('A', '很少'), ('B', '很便宜'), ('C', '很漂亮')], t=[443.6, 488])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/10-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'C', text='请问，包子多少钱一个？'), q(12, 'B', text='这边的苹果真便宜。'), q(13, 'D', text='这些是男孩子穿的衣服。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '十块钱。'), ('B', '对不起，没有。'), ('C', '在那边。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'C', text='女孩子的衣服在哪儿？'), q(15, 'A', text='杯子多少钱一个？'), q(16, 'B', text='请问这儿有牛奶吗？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '穿'), ('B', '块'), ('C', '名字')], 'qs': [
            q(17, 'B', text='那些苹果两（ ）钱一斤，很便宜。'), q(18, 'A', text='男：这件衣服怎么样？ 女：很好看，10岁的男孩子能（ ）。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'B', [('A', '杯子'), ('B', '手机'), ('C', '水果')], text='我没有手机，今天想去商店买一个。 ★说话人想买什么？'),
            q(20, 'A', [('A', '好看'), ('B', '便宜'), ('C', '很贵')], text='这件衣服很好看，你也能穿，买一件吧。 ★那件衣服：')]},
    ]},
    {'id': 11, 'title': 'Bài 11: 我读大学呢', 'audio': 'workbook/11.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/11-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[37, 57]), q(2, 'B', t=[59.2, 76]), q(3, 'C', t=[76, 92])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'B', [('A', '不吃午饭'), ('B', '在外边玩'), ('C', '水果便宜')], t=[139.4, 166]),
            q(5, 'C', [('A', '能到'), ('B', '想去呢'), ('C', '没到呢')], t=[167.3, 192])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/11-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[244.3, 282]), q(7, 'C', t=[283.8, 318]), q(8, 'B', t=[319.4, 347])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'B', [('A', '超市'), ('B', '外边'), ('C', '房间里')], t=[409.5, 447]),
            q(10, 'C', [('A', '学校后边'), ('B', '超市前边'), ('C', '超市后边')], t=[449.5, 489])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/11-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'C', text='妈妈正在做饭呢。'), q(12, 'B', text='你今天不想去学校吗？'), q(13, 'D', text='我和朋友们在外边玩呢。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '不，我坐出租车。'), ('B', '非常忙。'), ('C', '没有，我在开车呢。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'A', text='你开车去吗？'), q(15, 'B', text='你们学习忙不忙？'), q(16, 'C', text='你在吃午饭吗？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '找'), ('B', '睡觉'), ('C', '名字')], 'qs': [
            q(17, 'B', text='弟弟没起床，还在（ ）呢。'), q(18, 'A', text='男：喂，你到没到饭店呢？ 女：没到呢，我正在（ ）饭店在哪里呢。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'C', [('A', '老师'), ('B', '医生'), ('C', '大学生')], text='我姐姐今年20岁，正在读大学呢，她学医。 ★说话人的姐姐是：'),
            q(20, 'C', [('A', '朋友'), ('B', '学生'), ('C', '老师')], text='我明天有事，要去学校找老师，不知道老师在不在。 ★说话人明天要去学校见：')]},
    ]},
    {'id': 12, 'title': 'Bài 12: 昨天下雪了', 'audio': 'workbook/12.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/12-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'A', t=[35.2, 58]), q(2, 'C', t=[58, 76]), q(3, 'B', t=[76, 92])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'C', [('A', '在吃药'), ('B', '有点儿'), ('C', '不太好')], t=[137.3, 161]),
            q(5, 'B', [('A', '下雪了'), ('B', '太热了'), ('C', '不喝水')], t=[162.2, 184])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/12-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[235.2, 270]), q(7, 'C', t=[271, 281]), q(8, 'B', t=[281, 334])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '看医生'), ('B', '看朋友'), ('C', '看病人')], t=[396, 444]),
            q(10, 'B', [('A', '工作'), ('B', '休息'), ('C', '读书')], t=[446.5, 497])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/12-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'D', text='我女儿生病了。'), q(12, 'B', text='今天天不太好，下雪了。'), q(13, 'C', text='12:00了，你们怎么还在看电视？')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '热水。'), ('B', '我病了。'), ('C', '对。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'B', text='你怎么了？'), q(15, 'A', text='你想喝点儿什么？'), q(16, 'C', text='你开车了？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '冷'), ('B', '生病'), ('C', '名字')], 'qs': [
            q(17, 'B', text='他（ ）了，没来上班。'), q(18, 'A', text='男：外边雨大吗？ 女：很大，我觉得有点儿（ ）。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'A', [('A', '天气好'), ('B', '雨不大'), ('C', '有点儿冷')], text='昨天的天气很好，我和朋友们去外边玩了。 ★说话人觉得昨天：'),
            q(20, 'A', [('A', '要吃药'), ('B', '要多睡觉'), ('C', '要多喝水')], text='老张去看病，医生说他要吃三天药。 ★医生说老张：')]},
    ]},
    {'id': 13, 'title': 'Bài 13: 请给我一杯茶', 'audio': 'workbook/13.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/13-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[37, 58]), q(2, 'A', t=[59.2, 75]), q(3, 'C', t=[76.2, 92])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'C', [('A', '给你'), ('B', '吃早饭'), ('C', '要一杯茶')], t=[138.5, 162]),
            q(5, 'C', [('A', '学习'), ('B', '不对'), ('C', '没问题')], t=[163, 187])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/13-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'C', t=[236.9, 261]), q(7, 'D', t=[273, 303]), q(8, 'B', t=[303.8, 336])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'B', [('A', '问问题'), ('B', '找人玩'), ('C', '看医生')], t=[399, 439]),
            q(10, 'A', [('A', '饭店'), ('B', '学校'), ('C', '朋友家')], t=[439.6, 489])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/13-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'B', text='她太小了，这个苹果给她一半吧。'), q(12, 'D', text='请给我一杯牛奶，谢谢。'), q(13, 'C', text='我打电话问一下吧。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '不客气。'), ('B', '一个面包。'), ('C', '不知道。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'C', text='那里卖不卖手机？'), q(15, 'A', text='我会写了，谢谢老师。'), q(16, 'B', text='你要什么？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '给'), ('B', '一下'), ('C', '名字')], 'qs': [
            q(17, 'B', text='你看（ ），你要什么？'), q(18, 'A', text='男：请坐，您要什么？ 女：请（ ）我一杯茶。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'C', [('A', '星期五'), ('B', '星期六'), ('C', '星期日')], text='明天星期天，我们可以去饭店吃饺子吗？ ★明天是：'),
            q(20, 'A', [('A', '在家里工作'), ('B', '做了面条儿'), ('C', '不能去公司')], text='爸爸今天在家里工作，我们不要去他的房间。 ★爸爸今天：')]},
    ]},
    {'id': 14, 'title': 'Bài 14: 我看了一个电影', 'audio': 'workbook/14.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/14-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[34.5, 58]), q(2, 'C', t=[58, 75]), q(3, 'B', t=[75, 93])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'C', [('A', '都写'), ('B', '听见了'), ('C', '都会写了')], t=[136.1, 162]),
            q(5, 'B', [('A', '学习'), ('B', '超市'), ('C', '买面包')], t=[162.5, 187])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/14-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'D', t=[237.7, 275]), q(7, 'B', t=[275, 310]), q(8, 'C', t=[310, 345])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '下课后'), ('B', '上课前'), ('C', '回家后')], t=[406.8, 446]),
            q(10, 'A', [('A', '小狗'), ('B', '小猫'), ('C', '小狗和小猫')], t=[446, 494])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/14-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'C', text='王先生今天生病了，没来上班。'), q(12, 'B', text='火车上，有的人在读书，有的人在睡觉。'), q(13, 'D', text='喂，他们都来我家了，你也来吧。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '是的，我睡了一觉。'), ('B', '我们都去了。'), ('C', '写字、看书、吃饭。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'B', text='谁去学校了？'), q(15, 'A', text='你下午没去医院吗？'), q(16, 'C', text='你今天上午都忙了些什么？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '都'), ('B', '茶'), ('C', '名字')], 'qs': [
            q(17, 'B', text='我喝了一杯（ ）。'), q(18, 'A', text='男：上课了，请大家不要说话。 女：好的，老师，我们（ ）不说话了。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'C', [('A', '时间'), ('B', '电话号'), ('C', '房间号')], text='服务员，我想问一下，我们的房间号是多少？ ★说话人想知道什么？'),
            q(20, 'A', [('A', '小学生'), ('B', '中学生'), ('C', '大学生')], text='儿子和女儿都上小学了，他们会写很多字了。 ★说话人的两个孩子是：')]},
    ]},
    {'id': 15, 'title': 'Bài 15: 大兴机场见！', 'audio': 'workbook/15.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–3: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/15-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'A', t=[34.9, 58]), q(2, 'B', t=[58, 75]), q(3, 'C', t=[75, 93])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 4–5: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(4, 'A', [('A', '太早了'), ('B', '没睡觉'), ('C', '不想去')], t=[136.9, 165]),
            q(5, 'C', [('A', '很多'), ('B', '也不贵'), ('C', '也很好看')], t=[165, 193])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 6–8: Nghe hội thoại, chọn hình phù hợp nhất (A là ví dụ).', 'img': 'workbook/15-2.jpg', 'letters': 'ABCD', 'qs': [
            q(6, 'B', t=[242.2, 281]), q(7, 'D', t=[281, 321]), q(8, 'C', t=[321, 357])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 9–10: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(9, 'A', [('A', '西安'), ('B', '北京'), ('C', '上海')], t=[418.4, 462]),
            q(10, 'B', [('A', '坐飞机'), ('B', '坐火车'), ('C', '坐出租车')], t=[462, 505])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 11–13: Chọn hình phù hợp nhất với câu (A là ví dụ).', 'img': 'workbook/15-3.jpg', 'letters': 'ABCD', 'qs': [
            q(11, 'D', text='我家有五口人，我们现在住在北京。'), q(12, 'B', text='这里有好吃的，还有好玩儿的。'), q(13, 'C', text='现在我会说一点儿汉语，也会写一些汉字了。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 14–16: Nối câu (D là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '我女儿。'), ('B', '十个。'), ('C', '苹果。'), ('D', '好的，谢谢！')], 'qs': [
            q(14, 'B', text='你会写几个汉字？'), q(15, 'A', text='谁上中学了？'), q(16, 'C', text='你爱吃什么？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 17–18: Chọn từ điền vào chỗ trống (C là ví dụ).',
         'opts': [('A', '电视'), ('B', '北京'), ('C', '名字')], 'qs': [
            q(17, 'B', text='今年我们都想去（ ）。'), q(18, 'A', text='男：我爱看电影，也爱唱歌。你呢？ 女：我喜欢看（ ）。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 19–20: Đọc và chọn đáp án đúng.', 'qs': [
            q(19, 'C', [('A', '买电脑'), ('B', '打电话'), ('C', '看电影')], text='明天星期天，儿子想去看一个电影。 ★儿子明天想：'),
            q(20, 'A', [('A', '下小雨'), ('B', '下大雨'), ('C', '下小雪')], text='下小雨了，小狗非常高兴，它喜欢小雨。 ★小狗喜欢：')]},
    ]},
    {'id': 16, 'title': 'Đề thi mô phỏng HSK 1', 'audio': 'workbook/16.mp3',
     'parts': [
        {'title': 'Nghe · Phần 1', 'hint': 'Câu 1–5: Nghe cụm từ, chọn hình đúng.', 'img': 'workbook/16-1.jpg', 'letters': 'ABC', 'qs': [
            q(1, 'C', t=[120, 134]), q(2, 'A', t=[141.7, 154]), q(3, 'C', t=[159.2, 175]), q(4, 'B', t=[176.7, 194]), q(5, 'C', t=[195, 213])]},
        {'title': 'Nghe · Phần 2', 'hint': 'Câu 6–10: Nghe câu hỏi, chọn câu trả lời đúng.', 'qs': [
            q(6, 'B', [('A', '哪里'), ('B', '打电话'), ('C', '做饭好吃')], t=[259.6, 281]),
            q(7, 'C', [('A', '白天'), ('B', '生病了'), ('C', '水果店')], t=[283.5, 306]),
            q(8, 'B', [('A', '八元'), ('B', '不是'), ('C', '便宜')], t=[308.6, 331]),
            q(9, 'C', [('A', '去年'), ('B', '很漂亮'), ('C', '我弟弟')], t=[333.3, 356]),
            q(10, 'A', [('A', '没有'), ('B', '再见'), ('C', '不要')], t=[357.4, 366])]},
        {'title': 'Nghe · Phần 3', 'hint': 'Câu 11–15: Nghe hội thoại, chọn hình phù hợp nhất (C là ví dụ).', 'img': 'workbook/16-2.jpg', 'letters': 'ABCDEF', 'qs': [
            q(11, 'B', t=[429.9, 466]), q(12, 'D', t=[467.7, 500]), q(13, 'E', t=[501.5, 531]), q(14, 'A', t=[532, 568]), q(15, 'F', t=[569.5, 598])]},
        {'title': 'Nghe · Phần 4', 'hint': 'Câu 16–20: Nghe câu và câu hỏi, chọn đáp án đúng.', 'qs': [
            q(16, 'A', [('A', '60岁'), ('B', '60多岁'), ('C', '70岁')], t=[660, 711]),
            q(17, 'C', [('A', '电脑'), ('B', '杯子'), ('C', '手机')], t=[711.8, 748]),
            q(18, 'A', [('A', '女儿'), ('B', '妹妹'), ('C', '高女士')], t=[748, 787]),
            q(19, 'B', [('A', '包子'), ('B', '面包'), ('C', '面条儿')], t=[787.6, 821]),
            q(20, 'B', [('A', '早上'), ('B', '中午'), ('C', '星期天')], t=[822.3, 863])]},
        {'title': 'Đọc · Phần 1', 'hint': 'Câu 21–25: Chọn hình phù hợp nhất với câu (E là ví dụ).', 'img': 'workbook/16-3.jpg', 'letters': 'ABCDEF', 'qs': [
            q(21, 'B', text='王先生是医生。'), q(22, 'D', text='姐姐上午去超市买了菜。'), q(23, 'A', text='今天的早饭是牛奶和鸡蛋。'),
            q(24, 'C', text='我家有四口人，爸爸、妈妈、弟弟和我。'), q(25, 'F', text='她和好朋友都爱唱歌。')]},
        {'title': 'Đọc · Phần 2', 'hint': 'Câu 26–30: Nối câu (F là ví dụ: 你喝水吗？ → 好的，谢谢！).',
         'opts': [('A', '商店。'), ('B', '我学生。'), ('C', '在桌子上。'), ('D', '还没有。'), ('E', '下雪了。'), ('F', '好的，谢谢！')], 'qs': [
            q(26, 'C', text='这是我的书，你的呢？'), q(27, 'A', text='你去哪儿买苹果？'), q(28, 'E', text='昨天天气怎么样？'),
            q(29, 'B', text='你和谁打电话呢？'), q(30, 'D', text='你下班了吗？')]},
        {'title': 'Đọc · Phần 3', 'hint': 'Câu 31–35: Chọn từ điền vào chỗ trống (D là ví dụ: 你叫什么名字？).',
         'opts': [('A', '认识'), ('B', '住'), ('C', '晚饭'), ('D', '叫'), ('E', '汉字'), ('F', '块')], 'qs': [
            q(31, 'C', text='大家都没吃（ ）呢。'), q(32, 'E', text='在今天的中文课上，我学了很多（ ）。'), q(33, 'A', text='对不起，我不（ ）这个人。'),
            q(34, 'B', text='我和家人（ ）在北京。'), q(35, 'F', text='男：这些东西可以卖多少钱？ 女：80（ ）。')]},
        {'title': 'Đọc · Phần 4', 'hint': 'Câu 36–40: Đọc và chọn đáp án đúng.', 'qs': [
            q(36, 'C', [('A', '开车'), ('B', '坐飞机'), ('C', '坐出租车')], text='下雨了，我们坐出租车回家吧。 ★说话人想怎么回家？'),
            q(37, 'B', [('A', '小学生'), ('B', '中学生'), ('C', '大学生')], text='我儿子今年16岁了，正在上中学。 ★说话人的儿子是：'),
            q(38, 'C', [('A', '桌子下'), ('B', '房间里'), ('C', '房间外')], text='小猫和小狗都在房间外睡觉呢。 ★小狗在：'),
            q(39, 'C', [('A', '饭店'), ('B', '医院'), ('C', '学校')], text='我同学在这个学校工作很多年了，你有问题可以问他。 ★说话人的同学在哪儿上班？'),
            q(40, 'B', [('A', '名字好听'), ('B', '写字好看'), ('C', '正在读书')], text='这个小朋友写字真好看。 ★那个小朋友：')]},
    ]},
]

TOC = {5: '今天我休息', 6: '你的手机号是多少？', 7: '我晚上六点半下班', 8: '我爸爸在医院工作', 9: '我明天上午在学校学习',
       10: '这儿的苹果真便宜！', 11: '我读大学呢', 12: '昨天下雪了', 13: '请给我一杯茶', 14: '我看了一个电影', 15: '大兴机场见！'}
have = {l['id'] for l in lessons}
lessons += [{'id': i, 'title': f'Bài {i}: {t}'} for i, t in TOC.items() if i not in have]
if 16 not in have: lessons.append({'id': 16, 'title': 'Đề thi mô phỏng HSK 1'})
lessons.sort(key=lambda l: l['id'])
for l in lessons:
    trf = os.path.expanduser(f'~/hskchinese/tools/wb_tr/{l["id"]}.json')  # transcript + dịch: {"n": [[zh, en, vi], ...]}
    tr = json.load(open(trf)) if os.path.exists(trf) else {}
    for p in l.get('parts', []):
        for x in p['qs']:
            if str(x['n']) in tr: x['tr'] = [{'zh': z, 'py': py(z).replace(' ：', '：'), 'en': e, 'vi': v} for z, e, v in tr[str(x['n'])]]
        if 'opts' in p: p['opts'] = [{'k': k, 'zh': v, 'py': py(v)} for k, v in p['opts']]
        assert all(os.path.exists(os.path.expanduser('~/hskchinese/' + x)) for x in [l['audio'], p.get('img', l['audio'])])

out = os.path.expanduser('~/hskchinese/data/workbook.json')
json.dump({'lessons': lessons}, open(out, 'w'), ensure_ascii=False, indent=1)
print(sum(len(p['qs']) for l in lessons for p in l.get('parts', [])), 'questions')
