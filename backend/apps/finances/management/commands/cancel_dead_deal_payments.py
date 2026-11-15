"""
Переводит неоплаченные платежи отменённых и расторгнутых сделок в «Отменён».

Расторжение сделки теперь само отменяет неоплаченные части графика, но в
базе остались договоры, расторгнутые до появления статуса «Отменён»: их
остаток продолжает числиться «К оплате»/«Просрочен» и попадает в просрочку
на дашборде и в витрины «Финансов».

Запуск без ключей только показывает, что будет сделано:

    python manage.py cancel_dead_deal_payments
    python manage.py cancel_dead_deal_payments --apply
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.deals.models import Deal, DealLog
from apps.finances.models import Payment, PaymentLog
from apps.finances.services import cancel_unpaid_payments, dead_deal_statuses


class Command(BaseCommand):
    help = "Отменяет неоплаченные платежи отменённых и расторгнутых сделок"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Записать изменения (без ключа — только отчёт)')
        parser.add_argument('--company', type=int, default=None,
                            help='Только сделки этой компании')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        deals = Deal.objects.filter(status__in=dead_deal_statuses())
        if options['company']:
            deals = deals.filter(company_id=options['company'])
        deals = deals.filter(payments__status__in=Payment.UNPAID_STATUSES).distinct()

        total_payments = 0
        total_deals = 0
        for deal in deals.select_related('client'):
            unpaid = deal.payments.filter(status__in=Payment.UNPAID_STATUSES)
            amounts = ", ".join(
                f"{payment.amount} {payment.currency} от {payment.due_date} "
                f"({payment.get_status_display()})"
                for payment in unpaid[:5]
            )
            count = unpaid.count()
            total_deals += 1
            total_payments += count
            self.stdout.write(
                f"Сделка №{deal.id} ({deal.get_status_display()}, клиент {deal.client.full_name}): "
                f"платежей {count} — {amounts}"
            )
            if not apply_changes:
                continue
            with transaction.atomic():
                payment_ids = list(unpaid.values_list('id', flat=True))
                cancel_unpaid_payments(deal)
                PaymentLog.objects.bulk_create([
                    PaymentLog(
                        payment_id=payment_id,
                        user=None,
                        action=(
                            f"Платёж отменён: сделка {deal.get_status_display().lower()} "
                            f"— денег по этой строке графика не ждут."
                        ),
                    )
                    for payment_id in payment_ids
                ])
                DealLog.objects.create(
                    deal=deal,
                    user=None,
                    action=f"Неоплаченных платежей отменено: {count} (приведение данных к новому правилу).",
                )

        if not total_deals:
            self.stdout.write(self.style.SUCCESS("Неоплаченных платежей по недействующим сделкам нет."))
            return

        tail = "отменено" if apply_changes else "будет отменено (запустите с --apply)"
        self.stdout.write(self.style.SUCCESS(
            f"Сделок: {total_deals}, платежей {tail}: {total_payments}."
        ))
