"""
Пересчёт старых сделок компании в валюту сделок.

До мультивалютности у цен каталога не было валюты, и сделки создавались
с пометкой «сум», хотя прайс был в долларах: в сделке «34 100 UZS» на деле
34 100 долларов. Команда пересчитывает такие сделки и их платежи в валюту
сделок по одному курсу (по умолчанию — действующему сегодня):

- цена, цена за м² и стоимость по договору — по курсу;
- исходная цена в долларах и курс сохраняются в сделке (цена по прайсу),
  исходная сумма и курс каждого платежа — в платеже, поэтому пересчёт виден
  в интерфейсе и его можно проверить;
- копеечное расхождение суммы графика со стоимостью по договору относится
  на последний неоплаченный платёж (если неоплаченных нет — на последний);
- в журнал сделки пишется запись о пересчёте.

Какие сделки считаются старыми: те, чья цена не была пересчитана из прайса
в исходной валюте. У сделки, созданной после того, как проекту указали
валюту прайса, цена по прайсу уже в этой валюте — её команда не трогает.
Повторный запуск поэтому ничего не пересчитывает дважды.

Защита: сделка пропускается, если в ней есть суммы больше --max-amount
(похоже, они уже в сумах) или платёж, который уже вводили в другой валюте.

По умолчанию — пробный запуск.

    python manage.py convert_deals_currency --company 5 --assume-from USD
    python manage.py convert_deals_currency --company 5 --assume-from USD --apply
    python manage.py convert_deals_currency --company 5 --assume-from USD --rate 11772.95 --apply
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.deals.models import Deal, DealLog
from apps.finances.currency import (
    CURRENCY_CODES, RateUnavailable, company_base_currency, cross_rate, money, stored_rate,
)
from apps.finances.models import Payment
from permissions.models import Company

SETTLED = (Payment.PaymentStatus.PAID, Payment.PaymentStatus.TO_BE_RETURNED, Payment.PaymentStatus.RETURNED)


class Command(BaseCommand):
    help = 'Пересчитывает старые сделки компании из валюты прайса в валюту сделок'

    def add_arguments(self, parser):
        parser.add_argument('--company', type=int, required=True, help='ID компании')
        parser.add_argument('--assume-from', required=True,
                            help='В какой валюте на самом деле суммы старых сделок, например USD')
        parser.add_argument('--to', help='Валюта, в которую пересчитывать (по умолчанию — валюта сделок компании)')
        parser.add_argument('--rate', help='Курс пересчёта: сколько единиц --to за единицу --assume-from')
        parser.add_argument('--date', help='Дата курса ГГГГ-ММ-ДД (по умолчанию — сегодня)')
        parser.add_argument('--max-amount', default='5000000',
                            help='Сделки с суммами больше этого пропускаются как уже пересчитанные (по умолчанию 5 000 000)')
        parser.add_argument('--apply', action='store_true', help='Применить (без ключа — пробный запуск)')

    def handle(self, *args, **options):
        company = Company.objects.filter(pk=options['company']).first()
        if company is None:
            raise CommandError('Компания не найдена.')
        source = options['assume_from'].upper()
        target = (options['to'] or company_base_currency(company)).upper()
        for code in (source, target):
            if code not in CURRENCY_CODES:
                raise CommandError(f'Неизвестная валюта: {code}')
        if source == target:
            raise CommandError('Исходная валюта совпадает с валютой пересчёта — пересчитывать нечего.')

        try:
            on_date = date.fromisoformat(options['date']) if options['date'] else timezone.localdate()
            max_amount = Decimal(options['max_amount'])
            if options['rate']:
                rate = Decimal(options['rate'])
                rate_note = 'задан вручную'
            else:
                rate = cross_rate(source, target, on_date, company)
                rate_note = f'на {on_date:%d.%m.%Y}'
        except (ValueError, InvalidOperation) as error:
            raise CommandError(f'Неверный параметр: {error}')
        except RateUnavailable as error:
            raise CommandError(str(error))
        if rate <= 0:
            raise CommandError('Курс должен быть больше нуля.')

        # Старые сделки: цена не пересчитывалась из прайса в исходной валюте
        deals = (Deal.objects.filter(company=company)
                 .exclude(catalog_currency=source)
                 .prefetch_related('payments').order_by('id'))

        self.stdout.write(f'Компания: {company.name}. Пересчёт {source} → {target} '
                          f'по курсу {stored_rate(rate).normalize():f} ({rate_note}).')
        plan, skipped = [], []
        for deal in deals:
            payments = list(deal.payments.all())
            amounts = [deal.initial_price, deal.initial_price_per_sqm, deal.contract_price] + [p.amount for p in payments]
            if any(a is not None and a > max_amount for a in amounts):
                skipped.append(f'#{deal.id}: суммы больше {max_amount:f} — похоже, уже в {target}')
                continue
            entered = [p for p in payments if p.entered_currency]
            if entered:
                skipped.append(f'#{deal.id}: в графике есть платежи, введённые в другой валюте ({len(entered)})')
                continue
            plan.append((deal, payments))

        for deal, payments in plan:
            new_price = money(deal.contract_price * rate) if deal.contract_price is not None else None
            self.stdout.write(
                f'  #{deal.id} {deal.get_status_display():<16} цена {deal.initial_price:f} → {money(deal.initial_price * rate):f}'
                + (f', договор {deal.contract_price:f} → {new_price:f}' if new_price is not None else '')
                + (f', платежей {len(payments)}' if payments else '')
            )
        for line in skipped:
            self.stdout.write(self.style.WARNING('  пропущена ' + line))
        self.stdout.write(f'Итого к пересчёту: {len(plan)} сделок, '
                          f'{sum(len(p) for _, p in plan)} платежей; пропущено: {len(skipped)}.')

        if not options['apply']:
            self.stdout.write(self.style.WARNING('Пробный запуск: ничего не изменено. Добавьте --apply.'))
            return

        kept_rate = stored_rate(rate)
        with transaction.atomic():
            for deal, payments in plan:
                self._convert(deal, payments, source, target, rate, kept_rate)
        self.stdout.write(self.style.SUCCESS(f'Готово: пересчитано {len(plan)} сделок.'))

    @staticmethod
    def _convert(deal, payments, source, target, rate, kept_rate):
        old_price, old_contract = deal.initial_price, deal.contract_price
        # Сходился ли график с договором до пересчёта: только тогда выравниваем копейки
        balanced = old_contract is not None and payments and sum(p.amount for p in payments) == old_contract

        deal.catalog_price = old_price
        deal.catalog_currency = source
        deal.catalog_rate = kept_rate
        deal.initial_price = money(old_price * rate)
        deal.initial_price_per_sqm = money(deal.initial_price_per_sqm * rate)
        deal.contract_price = money(old_contract * rate) if old_contract is not None else None
        deal.currency = target
        deal.save(update_fields=['catalog_price', 'catalog_currency', 'catalog_rate', 'initial_price',
                                 'initial_price_per_sqm', 'contract_price', 'currency'])

        for payment in payments:
            payment.entered_amount = payment.amount
            payment.entered_currency = source
            payment.entered_rate = kept_rate
            payment.amount = money(payment.amount * rate)
            payment.currency = target

        if balanced:
            difference = deal.contract_price - sum(p.amount for p in payments)
            if difference:
                open_payments = [p for p in payments if p.status not in SETTLED]
                tail = max(open_payments or payments, key=lambda p: (p.due_date, p.id))
                tail.amount += difference

        for payment in payments:
            payment.save(update_fields=['amount', 'currency', 'entered_amount', 'entered_currency', 'entered_rate'])

        DealLog.objects.create(
            deal=deal,
            user=None,
            action=(
                f'Сделка пересчитана из {source} в {target} по курсу {kept_rate.normalize():f}: '
                f'цена {old_price:f} {source} → {deal.initial_price:f} {target}'
                + (f', стоимость по договору {old_contract:f} {source} → {deal.contract_price:f} {target}'
                   if old_contract is not None else '')
                + (f', платежей пересчитано: {len(payments)}' if payments else '')
                + '.'
            ),
        )
