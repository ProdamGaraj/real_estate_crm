"""
Замена графиков платежей по файлу заказчика.

Графики в базе собраны неверно, правильные планы оплаты заказчик прислал
отдельным файлом. Источник истины — файл: его суммы и стоимость договора
перезаписывают то, что лежит в базе, включая проведённые платежи.

Формат файла (первый лист, первая строка — заголовки):

    A  Номер договора        G  4-платеж
    B  Номер помещения       …
    C  Сумма по договору     V  19-платеж
    D  1-платеж              W  ФИО по договору

Платёж с нулевой суммой в график не попадает: так в файле записан договор
со стопроцентной оплатой — один платёж и восемнадцать нулей.

Сделка ищется по номеру договора, номер помещения служит проверкой: если
он расходится с объектом сделки, строка пропускается. Даты берутся из
существующего графика по порядку строк, недостающие продолжаются помесячно.

Без ``--apply`` команда ничего не пишет и печатает, что сделала бы.
Перед записью сохраняет текущие графики в JSON — чтобы было чем вернуть:

    python manage.py import_payment_plans "Shartnomalar JB.xlsx" --company JB
    python manage.py import_payment_plans "Shartnomalar JB.xlsx" --company JB --apply
"""

import collections
import io
import json
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.deals.models import Deal, DealLog
from apps.finances.models import BeneficiaryAccount, Payment, PaymentType
from apps.finances.services import resolve_unpaid_status
from permissions.models import Company

# Столбцы файла (индексы с нуля)
COL_CONTRACT = 0
COL_UNIT = 1
COL_TOTAL = 2
COL_FIRST_PAYMENT = 3
COL_LAST_PAYMENT = 21
COL_NAME = 22

# Платежи, по которым прошли деньги: их перезапись заказчик подтвердил,
# но в отчёте они перечисляются отдельно
SETTLED_STATUSES = (
    Payment.PaymentStatus.PAID,
    Payment.PaymentStatus.TO_BE_RETURNED,
    Payment.PaymentStatus.RETURNED,
)


def money(value):
    """Число из клетки файла: пробелы-разделители и запятая допускаются."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.replace('\xa0', '').replace(' ', '').replace(',', '.').strip()
        if not value:
            return None
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def text(value):
    return str(value).strip() if value is not None else ''


# Латинские буквы, неотличимые на вид от кириллических. В файле заказчика
# дом «В» набран латинской «B» — в базе он кириллический. Буквы домов идут
# А, Б, В, Г, Д, и латинской «B» там быть не может
LOOKALIKES = str.maketrans({
    'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К', 'M': 'М',
    'O': 'О', 'P': 'Р', 'T': 'Т', 'X': 'Х', 'Y': 'У',
})


def fold(value):
    """Номер помещения без разницы между латиницей и кириллицей."""
    return text(value).upper().translate(LOOKALIKES)


def add_months(anchor, count):
    """
    Дата через ``count`` месяцев от ``anchor``.

    Считается всегда от исходной даты, а не от предыдущей: иначе платёж
    с 31 января уезжал бы на 28 февраля и дальше так и шёл 28-м числом.
    Короткий месяц обрезается по последнему дню.
    """
    total = anchor.month - 1 + count
    year, month = anchor.year + total // 12, total % 12 + 1
    day = anchor.day
    while day > 1:
        try:
            return anchor.replace(year=year, month=month, day=day)
        except ValueError:
            day -= 1
    return anchor.replace(year=year, month=month, day=1)


class Row:
    """Строка файла, разобранная в план оплаты."""

    def __init__(self, line, cells):
        self.line = line
        self.contract_number = text(cells[COL_CONTRACT])
        self.unit_number = text(cells[COL_UNIT])
        self.client_name = text(cells[COL_NAME]) if len(cells) > COL_NAME else ''
        self.total = money(cells[COL_TOTAL])
        amounts = [money(cell) for cell in cells[COL_FIRST_PAYMENT:COL_LAST_PAYMENT + 1]]
        # Нулевые платежи — не строки графика, а способ дописать строку до
        # девятнадцати столбцов
        self.amounts = [value for value in amounts if value is not None and value > 0]

    @property
    def is_valid(self):
        return bool(self.contract_number and self.total and self.amounts)

    def balanced_amounts(self, target):
        """
        Суммы, сходящиеся с целевой стоимостью ровно.

        В файле ежемесячный платёж округлён, и у 150 договоров сумма строк
        расходится со стоимостью договора на несколько сумов. Остаток
        относим на последний платёж.
        """
        amounts = list(self.amounts)
        amounts[-1] += target - sum(amounts)
        return amounts


class Command(BaseCommand):
    help = "Заменяет графики платежей по файлу заказчика (по умолчанию — без записи)"

    def add_arguments(self, parser):
        parser.add_argument('path', help='Файл .xlsx с графиками')
        parser.add_argument('--company', required=True,
                            help='Код или id компании: номера договоров уникальны внутри компании')
        parser.add_argument('--apply', action='store_true',
                            help='Записать изменения (по умолчанию — только отчёт)')
        parser.add_argument('--backup', default='',
                            help='Куда сохранить текущие графики (по умолчанию — рядом с файлом)')
        parser.add_argument('--payment-type', default='',
                            help='Название типа платежа для новых строк графика')
        parser.add_argument('--limit', type=int, default=0,
                            help='Обработать только первые N строк файла — для пробы')
        parser.add_argument('--force-unit', default='',
                            help='Номера договоров через запятую, для которых расхождение '
                                 'в номере помещения допустимо (опечатка в файле)')

    # --- подготовка -----------------------------------------------------

    def handle(self, *args, **options):
        try:
            import openpyxl
        except ImportError:
            raise CommandError('Нужен пакет openpyxl: pip install openpyxl')

        self.apply = options['apply']
        company = self._company(options['company'])
        rows = self._read(openpyxl, options['path'], options['limit'])
        self.stdout.write(f'Строк в файле: {len(rows)}')

        payment_type = None
        if options['payment_type']:
            payment_type = PaymentType.objects.filter(
                name=options['payment_type'], company__in=[company, None]).first()
            if payment_type is None:
                raise CommandError(f"Тип платежа «{options['payment_type']}» не найден")

        self.skipped = []
        self.planned = []
        self.settled_touched = []
        self.relettered = []
        self.forced = []
        self.booking_fees = []
        self.forced_units = {
            value.strip() for value in options['force_unit'].split(',') if value.strip()
        }

        for row in rows:
            self._prepare(row, company)

        backup_path = options['backup'] or (options['path'] + '.backup.json')
        if self.apply and self.planned:
            self._backup(backup_path)
            self._write(payment_type)

        self._report(backup_path)

    def _company(self, value):
        company = Company.objects.filter(code__iexact=str(value)).first()
        if company is None and str(value).isdigit():
            company = Company.objects.filter(pk=int(value)).first()
        if company is None:
            available = ', '.join(Company.objects.values_list('code', flat=True))
            raise CommandError(f'Компания «{value}» не найдена. Есть: {available}')
        return company

    def _read(self, openpyxl, path, limit):
        book = openpyxl.load_workbook(path, data_only=True, read_only=True)
        sheet = book[book.sheetnames[0]]
        rows = []
        for line, cells in enumerate(sheet.iter_rows(values_only=True), start=1):
            if line == 1 or not any(cell is not None for cell in cells):
                continue
            cells = list(cells) + [None] * (COL_NAME + 1 - len(cells))
            rows.append(Row(line, cells))
            if limit and len(rows) >= limit:
                break
        return rows

    # --- сопоставление --------------------------------------------------

    def _prepare(self, row, company):
        """Находит сделку и считает, каким станет её график."""
        if not row.is_valid:
            return self.skipped.append((row, 'в строке нет номера договора, суммы или платежей'))

        matches = [
            deal for deal in Deal.objects.select_related('property').filter(company=company)
            if text(deal.contract_number) == row.contract_number
        ]
        if not matches:
            return self.skipped.append((row, 'сделка с таким номером договора не найдена'))
        if len(matches) > 1:
            return self.skipped.append((row, f'номеру договора отвечают {len(matches)} сделки'))

        deal = matches[0]
        unit = text(deal.property.unit_number) if deal.property_id else ''
        if unit != row.unit_number:
            if unit and fold(unit) == fold(row.unit_number):
                # Отличие только в латинице: номер договора уже совпал,
                # значит это тот же объект, записанный другой раскладкой
                self.relettered.append((row, deal, unit))
            elif row.contract_number in self.forced_units:
                self.forced.append((row, deal, unit))
            else:
                return self.skipped.append(
                    (row, f'объект сделки — {unit or "не указан"}, а в файле {row.unit_number}'))

        if deal.currency != Payment.Currency.UZS:
            return self.skipped.append((row, f'сделка в валюте {deal.currency}, а файл в сумах'))

        existing = list(deal.payments.order_by('due_date', 'id'))
        # Взнос за бронь остаётся на месте и в план оплаты не входит
        dates = self._dates(row, deal, [p for p in existing if not p.booking_id])
        if dates is None:
            return self.skipped.append(
                (row, 'нет ни одного платежа и не указана дата договора — не от чего считать сроки'))

        amounts = row.balanced_amounts(row.total)
        # Пары «строка графика — что в неё встанет» берём по позиции:
        # проведённый платёж может стоять не первым
        for index, payment in enumerate(existing):
            if payment.booking_id:
                # Взнос за бронь — платёж брони, а не строка плана оплаты.
                # Переписать его суммой из файла значит испортить и бронь
                self.booking_fees.append((deal, payment))
                continue
            if payment.status not in SETTLED_STATUSES:
                continue
            if index < len(amounts):
                if payment.amount != amounts[index] or payment.due_date != dates[index]:
                    self.settled_touched.append((deal, payment, amounts[index], dates[index]))
            else:
                self.settled_touched.append((deal, payment, None, None))

        self.planned.append({
            'row': row,
            'deal': deal,
            'existing': existing,
            'amounts': amounts,
            'dates': dates,
            'price_changed': deal.contract_price != row.total,
        })

    def _dates(self, row, deal, existing):
        """
        Сроки оплаты для нового графика.

        Даты в файле не присланы, поэтому берём их из текущего графика по
        порядку строк. Если платежей там меньше, продолжаем помесячно от
        последнего известного срока.
        """
        dates = [payment.due_date for payment in existing]
        if not dates:
            if not deal.contract_date:
                return None
            dates = [deal.contract_date]
        anchor, offset = dates[-1], 0
        while len(dates) < len(row.amounts):
            offset += 1
            dates.append(add_months(anchor, offset))
        return dates[:len(row.amounts)]

    # --- запись ---------------------------------------------------------

    def _backup(self, path):
        """Текущие графики до перезаписи — чтобы было чем вернуть."""
        dump = []
        for plan in self.planned:
            deal = plan['deal']
            dump.append({
                'deal_id': deal.id,
                'contract_number': deal.contract_number,
                'unit_number': text(deal.property.unit_number) if deal.property_id else '',
                'contract_price': str(deal.contract_price) if deal.contract_price else None,
                'currency': deal.currency,
                'payments': [{
                    'id': payment.id,
                    'amount': str(payment.amount),
                    'currency': payment.currency,
                    'due_date': payment.due_date.isoformat() if payment.due_date else None,
                    'payment_date': (payment.payment_date.isoformat()
                                     if payment.payment_date else None),
                    'status': payment.status,
                    'method': payment.method,
                    'payment_type_id': payment.payment_type_id,
                    'beneficiary_account_id': payment.beneficiary_account_id,
                    'responsible_employee_id': payment.responsible_employee_id,
                } for payment in plan['existing']],
            })
        with io.open(path, 'w', encoding='utf-8') as stream:
            json.dump({'saved_at': timezone.now().isoformat(), 'deals': dump},
                      stream, ensure_ascii=False, indent=2)
        self.stdout.write(self.style.SUCCESS(f'Текущие графики сохранены: {path}'))

    def _write(self, payment_type):
        created = updated = removed = 0
        with transaction.atomic():
            for plan in self.planned:
                deal, existing = plan['deal'], plan['existing']
                amounts, dates = plan['amounts'], plan['dates']

                if plan['price_changed']:
                    old_price = deal.contract_price
                    deal.contract_price = plan['row'].total
                    deal.save(update_fields=['contract_price'])
                    DealLog.objects.create(deal=deal, user=None, action=(
                        f'Стоимость по договору изменена с {old_price} на '
                        f'{deal.contract_price} {deal.currency} по файлу заказчика.'))

                defaults = self._defaults(deal, existing, payment_type)
                writable = [p for p in existing if not p.booking_id]
                for index, (amount, due_date) in enumerate(zip(amounts, dates)):
                    if index < len(writable):
                        payment = writable[index]
                        payment.amount = amount
                        payment.due_date = due_date
                        if payment.status not in SETTLED_STATUSES:
                            payment.status = resolve_unpaid_status(due_date)
                        # Сумма пришла из файла в валюте сделки: прежний
                        # ввод в другой валюте к ней больше не относится
                        payment.currency = deal.currency
                        payment.entered_amount = None
                        payment.entered_currency = ''
                        payment.entered_rate = None
                        payment.save()
                        updated += 1
                    else:
                        Payment.objects.create(
                            deal=deal, client=deal.client, company=deal.company,
                            amount=amount, currency=deal.currency, due_date=due_date,
                            status=resolve_unpaid_status(due_date), **defaults)
                        created += 1

                for payment in writable[len(amounts):]:
                    payment.delete()
                    removed += 1

                DealLog.objects.create(deal=deal, user=None, action=(
                    f'График платежей заменён по файлу заказчика: {len(amounts)} платежей '
                    f'на {sum(amounts)} {deal.currency}.'))

        self.stdout.write(self.style.SUCCESS(
            f'Записано: строк создано {created}, изменено {updated}, убрано {removed}.'))

    def _defaults(self, deal, existing, payment_type):
        """Реквизиты новых строк графика — от существующих платежей сделки."""
        sample = existing[0] if existing else None
        account = sample.beneficiary_account if sample else BeneficiaryAccount.objects.filter(
            company__in=[deal.company, None]).order_by('id').first()
        if account is None:
            raise CommandError(
                f'Сделке {deal.contract_number} нечего поставить счётом получателя: '
                f'у неё нет платежей и в компании нет ни одного счёта.')
        return {
            'beneficiary_account': account,
            'method': sample.method if sample else Payment.PaymentMethod.CASHLESS,
            'payment_type': payment_type or (sample.payment_type if sample else None),
            'responsible_employee': (sample.responsible_employee if sample else None)
                                    or deal.created_by,
            'created_by': deal.created_by,
        }

    # --- отчёт ----------------------------------------------------------

    def _report_money(self):
        """Сколько денег числится полученными сейчас и будет числиться после."""
        was = sum((payment.amount for _, payment, _, _ in self.settled_touched), Decimal(0))
        becomes = sum((amount for _, _, amount, _ in self.settled_touched
                       if amount is not None), Decimal(0))
        if not self.settled_touched:
            return
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('Деньги, помеченные как полученные:'))
        self.stdout.write(f'  сейчас по этим строкам: {was:,.2f} UZS'.replace(',', ' '))
        self.stdout.write(f'  станет после замены:    {becomes:,.2f} UZS'.replace(',', ' '))
        self.stdout.write(self.style.WARNING(
            f'  разница:                {becomes - was:+,.2f} UZS'.replace(',', ' ')))

    def _report_price_ratios(self, price_changes):
        """
        Во сколько раз стоимость в базе отличается от файла.

        Одинаковое отношение у многих договоров значит, что в базе цена
        получена из файла по общему правилу — например, применённой скидкой.
        Такую правку стоит подтвердить у заказчика отдельно.
        """
        if not price_changes:
            return
        ratios = collections.Counter()
        for plan in price_changes:
            old_price = plan['deal'].contract_price
            if not old_price:
                ratios['стоимость не была указана'] += 1
                continue
            ratios[(old_price / plan['row'].total).quantize(Decimal('0.0001'))] += 1
        self.stdout.write('  отношение «цена в базе / цена в файле»:')
        for ratio, count in ratios.most_common(8):
            self.stdout.write(f'    {ratio} — {count} договоров')

    def _report(self, backup_path):
        self.stdout.write('')
        self.stdout.write(f'Сделок к обновлению: {len(self.planned)}')
        if self.relettered:
            self.stdout.write(
                f'  из них сопоставлено с поправкой на латиницу: {len(self.relettered)}')
            for row, deal, unit in self.relettered[:5]:
                self.stdout.write(f'    {row.contract_number}: в файле {row.unit_number}, '
                                  f'в базе {unit} — тот же объект')
            if len(self.relettered) > 5:
                self.stdout.write(f'    … ещё {len(self.relettered) - 5}')
        if self.forced:
            self.stdout.write(self.style.WARNING(
                f'  принято по --force-unit, несмотря на разные помещения: {len(self.forced)}'))
            for row, deal, unit in self.forced:
                self.stdout.write(f'    {row.contract_number}: в файле {row.unit_number}, '
                                  f'в базе {unit}')
        if self.booking_fees:
            self.stdout.write(f'  взносов за бронь оставлено без изменений: '
                              f'{len(self.booking_fees)}')

        self._report_money()

        price_changes = [p for p in self.planned if p['price_changed']]
        self.stdout.write('')
        self.stdout.write(f'Сделок со сменой стоимости по договору: {len(price_changes)}')
        self._report_price_ratios(price_changes)
        for plan in price_changes[:20]:
            self.stdout.write(
                f"    {plan['deal'].contract_number} ({plan['row'].unit_number}): "
                f"{plan['deal'].contract_price} -> {plan['row'].total}"
                if not self.apply else
                f"    {plan['deal'].contract_number}: стоимость обновлена")
        if len(price_changes) > 20:
            self.stdout.write(f'    … ещё {len(price_changes) - 20}')

        if self.settled_touched:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                f'Затронуты платежи, по которым прошли деньги: {len(self.settled_touched)}'))
            self.stdout.write(self.style.WARNING(
                '  Отметка «Оплачен» сохраняется, а сумма берётся из файла: '
                'в отчётах эти деньги будут считаться полученными.'))
            for deal, payment, amount, due_date in self.settled_touched[:30]:
                if amount is None:
                    self.stdout.write(
                        f'    {deal.contract_number}: платёж {payment.amount} от '
                        f'{payment.due_date} ({payment.get_status_display()}) удаляется')
                else:
                    self.stdout.write(
                        f'    {deal.contract_number}: платёж {payment.amount} от '
                        f'{payment.due_date} ({payment.get_status_display()}) -> '
                        f'{amount} от {due_date}')
            if len(self.settled_touched) > 30:
                self.stdout.write(f'    … ещё {len(self.settled_touched) - 30}')

        if self.skipped:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR(f'Пропущено строк: {len(self.skipped)}'))
            for row, reason in self.skipped:
                self.stdout.write(
                    f'    строка {row.line}: договор {row.contract_number!r}, '
                    f'помещение {row.unit_number!r} — {reason}')

        self.stdout.write('')
        if self.apply:
            self.stdout.write(self.style.SUCCESS(
                f'Готово. Прежние графики лежат в {backup_path}.'))
        else:
            self.stdout.write(self.style.WARNING(
                'Это предварительный просмотр, база не изменена. '
                'Повторите с --apply, чтобы записать.'))
