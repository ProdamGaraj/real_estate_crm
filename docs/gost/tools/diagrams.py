# -*- coding: utf-8 -*-
"""
Схемы для проектной документации.

Рисует структурную схему комплекса и диаграммы состояний в чёрно-белом
исполнении и сохраняет их в docs/gost/data/*.png. Схемы описаны кодом,
поэтому правятся вместе с системой, а не перерисовываются вручную.

    python docs/gost/tools/diagrams.py

Требуется Pillow. Шрифт — Times New Roman (Windows) или DejaVu Serif.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DATA = Path(__file__).resolve().parent.parent / 'data'

FONT_CANDIDATES = [
    'C:/Windows/Fonts/times.ttf',
    '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
]
BOLD_CANDIDATES = [
    'C:/Windows/Fonts/timesbd.ttf',
    '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman_Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
]


def font(size, bold=False):
    for path in (BOLD_CANDIDATES if bold else FONT_CANDIDATES):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


BLACK = (0, 0, 0)
GREY = (110, 110, 110)
WHITE = (255, 255, 255)


class Canvas:
    def __init__(self, w, h):
        self.img = Image.new('RGB', (w, h), WHITE)
        self.d = ImageDraw.Draw(self.img)

    def text_block(self, box, lines, size=30, bold_first=True, color=BLACK):
        x0, y0, x1, y1 = box
        fonts = [font(size, bold=(bold_first and i == 0)) for i in range(len(lines))]
        heights = [self.d.textbbox((0, 0), ln, font=f)[3] for ln, f in zip(lines, fonts)]
        gap = int(size * 0.35)
        total = sum(heights) + gap * (len(lines) - 1)
        y = (y0 + y1 - total) / 2
        for ln, f, h in zip(lines, fonts, heights):
            w = self.d.textbbox((0, 0), ln, font=f)[2]
            self.d.text(((x0 + x1 - w) / 2, y), ln, font=f, fill=color)
            y += h + gap

    def box(self, box, lines, size=30, width=3, dashed=False, radius=10):
        if dashed:
            self.dashed_rect(box, width=2)
        else:
            self.d.rounded_rectangle(box, radius=radius, outline=BLACK, width=width, fill=WHITE)
        if lines:
            self.text_block(box, lines, size=size)

    def dashed_rect(self, box, width=2, dash=18, gap=10):
        x0, y0, x1, y1 = box
        for (a, b) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            self.dashed_line(a, b, width, dash, gap)

    def dashed_line(self, a, b, width=2, dash=18, gap=10):
        (xa, ya), (xb, yb) = a, b
        length = ((xb - xa) ** 2 + (yb - ya) ** 2) ** 0.5
        if length == 0:
            return
        ux, uy = (xb - xa) / length, (yb - ya) / length
        pos = 0
        while pos < length:
            end = min(pos + dash, length)
            self.d.line([(xa + ux * pos, ya + uy * pos), (xa + ux * end, ya + uy * end)], fill=GREY, width=width)
            pos = end + gap

    def arrow(self, a, b, label=None, width=3, both=False, label_offset=(0, -34), size=24):
        self.d.line([a, b], fill=BLACK, width=width)
        self._head(a, b)
        if both:
            self._head(b, a)
        if label:
            mx, my = (a[0] + b[0]) / 2 + label_offset[0], (a[1] + b[1]) / 2 + label_offset[1]
            f = font(size)
            for i, ln in enumerate(label.split('\n')):
                w = self.d.textbbox((0, 0), ln, font=f)[2]
                self.d.rectangle([mx - w / 2 - 4, my + i * (size + 4) - 2, mx + w / 2 + 4, my + i * (size + 4) + size + 2],
                                 fill=WHITE)
                self.d.text((mx - w / 2, my + i * (size + 4)), ln, font=f, fill=BLACK)

    def polyline_arrow(self, points, label=None, label_at=None, size=24):
        self.d.line(points, fill=BLACK, width=3)
        self._head(points[-2], points[-1])
        if label and label_at:
            f = font(size)
            for i, ln in enumerate(label.split('\n')):
                w = self.d.textbbox((0, 0), ln, font=f)[2]
                x, y = label_at
                self.d.rectangle([x - w / 2 - 4, y + i * (size + 4) - 2, x + w / 2 + 4, y + i * (size + 4) + size + 2],
                                 fill=WHITE)
                self.d.text((x - w / 2, y + i * (size + 4)), ln, font=f, fill=BLACK)

    def _head(self, a, b, size=18):
        import math
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        p1 = (b[0] - size * math.cos(ang - 0.4), b[1] - size * math.sin(ang - 0.4))
        p2 = (b[0] - size * math.cos(ang + 0.4), b[1] - size * math.sin(ang + 0.4))
        self.d.polygon([b, p1, p2], fill=BLACK)

    def label(self, xy, text, size=24, color=GREY, bold=False):
        self.d.text(xy, text, font=font(size, bold), fill=color)

    def save(self, name):
        DATA.mkdir(parents=True, exist_ok=True)
        self.img.save(DATA / name, dpi=(300, 300))
        print('  ', DATA / name)


def architecture():
    c = Canvas(2200, 1560)
    # Внешние участники
    c.box((90, 40, 760, 170), ['Пользователи', 'веб-браузер: ПК, планшет, телефон'], size=30)
    c.box((1440, 40, 2110, 170), ['Системы партнёров', 'сайты, боты, агентства'], size=30)
    # Обратный прокси
    c.box((400, 300, 1800, 430), ['nginx — обратный прокси, единственная точка входа',
                                  'порты 80 и 443, HTTPS, ограничение частоты запросов'], size=30)
    c.arrow((425, 170), (700, 300), 'HTTPS', label_offset=(-70, -20))
    c.arrow((1775, 170), (1500, 300), 'HTTPS, заголовок X-API-Key', label_offset=(140, -20))

    # Сеть клиентского приложения
    c.dashed_rect((60, 540, 700, 980))
    c.label((80, 552), 'сеть frontend_network', size=24)
    c.box((110, 640, 650, 900), ['frontend', 'клиентское приложение', 'React 19, TypeScript, MUI', 'статические файлы'], size=28)
    c.arrow((560, 430), (380, 640), 'HTTP, путь /', label_offset=(-90, -10))

    # Внутренняя сеть серверной части
    c.dashed_rect((760, 540, 2160, 1520))
    c.label((780, 552), 'сеть backend_network (внутренняя, без выхода в Интернет)', size=24)
    c.box((820, 620, 1400, 860), ['backend', 'серверная часть', 'Python 3.12, Django 5.2, DRF', 'gunicorn: 3 процесса × 2 потока'],
          size=28)
    c.box((1520, 620, 2100, 860), ['scheduler', 'регламентные задания', 'раз в час: просрочка платежей,', 'брони, забытые встречи'], size=28)
    c.arrow((1100, 430), (1100, 620), 'HTTP: /api, /media', label_offset=(140, -10))

    c.box((820, 1000, 1240, 1190), ['db', 'PostgreSQL 16', 'данные системы'], size=28)
    c.box((1290, 1000, 1680, 1190), ['redis', 'Redis 7', 'кэш, лимиты, блокировки'], size=28)
    c.box((1730, 1000, 2100, 1190), ['Файловое хранилище', 'каталог media', 'фото, сканы, шаблоны'], size=28)
    c.box((820, 1310, 1240, 1480), ['db-backup', 'резервное копирование', 'еженедельно'], size=28)
    c.box((1290, 1310, 1680, 1480), ['Каталог ./backups', 'резервные копии БД'], size=28)

    c.arrow((960, 860), (960, 1000), 'SQL', label_offset=(-50, -16))
    c.arrow((1250, 860), (1440, 1000))
    c.arrow((1380, 860), (1860, 1000))
    c.arrow((1700, 860), (1150, 1000))
    c.arrow((1030, 1310), (1030, 1190), 'pg_dump', label_offset=(-75, -16))
    c.arrow((1240, 1395), (1290, 1395))
    # Прямая выдача публичных изображений прокси
    c.polyline_arrow([(1800, 400), (2150, 400), (2150, 1095), (2100, 1095)],
                     'чтение файлов\n(публичные изображения,\nX-Accel-Redirect)', label_at=(1985, 450), size=22)
    c.save('fig-architecture.png')


def deal_states():
    c = Canvas(2200, 1100)
    W, H = 380, 170

    def state(x, y, title, prop, extra=None):
        lines = [title, f'объект: {prop}'] + ([extra] if extra else [])
        c.box((x, y, x + W, y + H), lines, size=30)
        return (x, y, x + W, y + H)

    # Начальная точка
    c.d.ellipse((40, 205, 90, 255), fill=BLACK)
    booking = state(200, 145, 'Бронь', '«Бронь»')
    work = state(910, 145, 'В работе', '«Сделка в работе»')
    won = state(1620, 145, 'Успешно закрыта', '«Сделка проведена»')
    cancel = state(560, 760, 'Отменена', '«Подбор»')
    term = state(1440, 760, 'Расторгнута', '«Подбор»', 'после всех возвратов')

    c.arrow((90, 230), (200, 230))
    c.label((30, 100), 'создание брони', size=24, color=BLACK)
    c.arrow((580, 230), (910, 230), 'сохранён график\nплатежей', label_offset=(0, -78))
    c.arrow((1290, 230), (1620, 230), 'заполнены обе\nдаты подписания', label_offset=(0, -78))
    c.arrow((390, 315), (680, 760), 'отмена с причиной;\nистёк срок брони', label_offset=(-150, -20))
    c.arrow((1040, 315), (860, 760), 'отмена: нет платежей\nи подписи клиента', label_offset=(-170, 10))
    c.arrow((1160, 315), (1520, 760), 'расторжение:\nесть платежи или подпись,\nнужен документ', label_offset=(-210, -40))
    c.arrow((1810, 315), (1700, 760), 'расторжение\nс документом', label_offset=(120, 0))
    c.label((60, 1000), 'Отменённая и расторгнутая сделки не возвращаются в работу. При расторжении оплаченные платежи '
                        'переходят в статус «К возврату».', size=26, color=BLACK)
    c.save('fig-deal-states.png')


def functional():
    c = Canvas(2200, 1250)
    W, H = 400, 150
    boxes = {
        'ОРГ': (900, 40, ['ОРГ', 'Структура и права доступа']),
        'КАТ': (120, 300, ['КАТ', 'Каталог недвижимости']),
        'КЛИ': (900, 300, ['КЛИ', 'Работа с клиентами']),
        'ИНТ': (1680, 300, ['ИНТ', 'Интеграция с партнёрами']),
        'СДЕ': (520, 580, ['СДЕ', 'Сделки']),
        'ДОК': (120, 860, ['ДОК', 'Шаблоны документов']),
        'ФИН': (900, 860, ['ФИН', 'Финансы']),
        'ЗАД': (1680, 580, ['ЗАД', 'Задачи']),
        'АНА': (1680, 860, ['АНА', 'Аналитика и отчётность']),
        'РЕГ': (1290, 1080, ['РЕГ', 'Регламентные задания']),
    }
    rect = {}
    for key, (x, y, lines) in boxes.items():
        h = 130 if key == 'РЕГ' else H
        c.box((x, y, x + W, y + h), lines, size=30)
        rect[key] = (x, y, x + W, y + h)

    def mid(k, side):
        x0, y0, x1, y1 = rect[k]
        return {'t': ((x0 + x1) / 2, y0), 'b': ((x0 + x1) / 2, y1), 'l': (x0, (y0 + y1) / 2), 'r': (x1, (y0 + y1) / 2)}[side]

    c.arrow(mid('ОРГ', 'b'), mid('КЛИ', 't'), 'права, структура', label_offset=(130, -14))
    c.arrow(mid('ИНТ', 'l'), mid('КЛИ', 'r'), 'заявки', label_offset=(0, -36))
    c.arrow((320, 450), (620, 580), 'объекты, скидки', label_offset=(-150, -10))
    c.arrow((1000, 450), (820, 580), 'клиент, заявка', label_offset=(150, -10))
    c.arrow((620, 730), (420, 860), 'данные сделки', label_offset=(-130, -10))
    c.arrow((820, 730), (1000, 860), 'стоимость договора', label_offset=(170, 0))
    c.arrow(mid('ФИН', 'r'), mid('АНА', 'l'), 'поступления', label_offset=(0, -36))
    c.arrow((920, 640), (1680, 900), 'сделки', label_offset=(0, -40))
    c.arrow((1290, 1130), (1210, 1010), 'просрочка', label_offset=(-90, 0))
    c.polyline_arrow([(1290, 1110), (720, 1110), (720, 730)], 'снятие броней', label_at=(980, 1120), size=24)
    c.polyline_arrow([(1690, 1150), (2160, 1150), (2160, 500), (1240, 500), (1240, 450)],
                     'закрытие забытых встреч', label_at=(1700, 510), size=24)
    c.save('fig-functional.png')


if __name__ == '__main__':
    architecture()
    deal_states()
    functional()
