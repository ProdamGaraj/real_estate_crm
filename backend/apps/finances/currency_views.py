"""
Настройки валют компании и курсы.

Читать настройки и курсы может любой сотрудник компании: они нужны графику
платежей (пересчёт ввода в валюту сделки) и отчётам. Менять настройки,
вводить и удалять ручные курсы, загружать курсы ЦБ — по правам на ресурс
«Курсы валют». Системный администратор работает с любой компанией,
передавая её в параметре ``company``.
"""

from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from permissions.backends import can_user_perform_action
from permissions.models import Company
from permissions.reference_scope import is_admin

from .currency import (
    CURRENCIES, CURRENCY_CODES, BASE_CURRENCY, _lookup,
    company_base_currency, fetch_cbu_rates, supported_currencies, try_fetch_cbu_rates, user_company,
)
from .models import ExchangeRate


def _target_company(request):
    """Компания запроса: своя, а для системного администратора — указанная."""
    company_id = request.query_params.get('company') or (
        request.data.get('company') if hasattr(request, 'data') and isinstance(request.data, dict) else None
    )
    if company_id and is_admin(request.user):
        return Company.objects.filter(pk=company_id).first()
    return user_company(request.user)


def _allowed(request, action):
    return is_admin(request.user) or can_user_perform_action(request.user, action, 'EXCHANGE_RATE')


def _rate_payload(record):
    return {
        'id': record.id,
        'currency': record.currency,
        'date': record.date.isoformat(),
        'rate': str(record.rate),
        'source': record.source,
        'company': record.company_id,
        'created_by': str(record.created_by) if record.created_by else None,
    }


class CurrencySettingsView(APIView):
    """Валюта сделок и поддерживаемые валюты компании."""
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _payload(company):
        return {
            'company': getattr(company, 'id', None),
            'company_name': getattr(company, 'name', None),
            'deal_currency': company_base_currency(company),
            'supported_currencies': supported_currencies(company),
            'available_currencies': [{'code': code, 'name': name} for code, name in CURRENCIES],
            'base_currency': BASE_CURRENCY,
        }

    def get(self, request):
        return Response(self._payload(_target_company(request)))

    def patch(self, request):
        if not _allowed(request, 'EDIT'):
            return Response({'error': 'Нет права изменять настройки валют.'}, status=status.HTTP_403_FORBIDDEN)
        company = _target_company(request)
        if company is None:
            return Response({'error': 'Не указана компания.'}, status=status.HTTP_400_BAD_REQUEST)

        deal_currency = str(request.data.get('deal_currency', company.deal_currency)).upper()
        supported = request.data.get('supported_currencies', company.supported_currencies)
        if not isinstance(supported, list):
            return Response({'error': 'Поддерживаемые валюты передаются списком.'},
                            status=status.HTTP_400_BAD_REQUEST)
        supported = [str(code).upper() for code in supported]
        unknown = sorted(set(supported + [deal_currency]) - set(CURRENCY_CODES))
        if unknown:
            return Response({'error': f'Неизвестные валюты: {", ".join(unknown)}.'},
                            status=status.HTTP_400_BAD_REQUEST)
        # Валюта сделок всегда входит в поддерживаемые
        if deal_currency not in supported:
            supported.insert(0, deal_currency)

        company.deal_currency = deal_currency
        company.supported_currencies = [code for code in CURRENCY_CODES if code in supported]
        company.save(update_fields=['deal_currency', 'supported_currencies', 'updated_at'])
        return Response(self._payload(company))


class ExchangeRateListView(APIView):
    """
    GET — курсы на дату (по умолчанию сегодня) для поддерживаемых валют
    компании; с ``history=1`` — история курсов (ЦБ и ручные курсы компании).
    POST — ручной курс компании: ``{currency, date, rate}``.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company = _target_company(request)
        if request.query_params.get('history'):
            queryset = ExchangeRate.objects.select_related('created_by').filter(currency__in=CURRENCY_CODES)
            if company is not None:
                queryset = queryset.filter(company__isnull=True) | queryset.filter(company=company)
            else:
                queryset = queryset.filter(company__isnull=True)
            currency = request.query_params.get('currency')
            if currency:
                queryset = queryset.filter(currency=currency.upper())
            limit = min(int(request.query_params.get('limit', 60) or 60), 500)
            return Response([_rate_payload(r) for r in queryset.order_by('-date', 'currency')[:limit]])

        try:
            on_date = date_cls.fromisoformat(request.query_params['date']) if request.query_params.get('date') \
                else timezone.localdate()
        except ValueError:
            return Response({'error': 'Дата передаётся в формате ГГГГ-ММ-ДД.'}, status=status.HTTP_400_BAD_REQUEST)
        codes = request.query_params.get('currencies')
        codes = [c.strip().upper() for c in codes.split(',')] if codes else supported_currencies(company)

        rates = {}
        attempted = False
        for code in codes:
            if code == BASE_CURRENCY:
                rates[code] = {'currency': code, 'rate': '1', 'date': on_date.isoformat(), 'source': 'BASE'}
                continue
            record = _lookup(code, on_date, company)
            if record is None and not attempted:
                # Курса ещё нет — пробуем загрузить с ЦБ, один раз на запрос:
                # загрузка приносит сразу все валюты
                attempted = True
                if try_fetch_cbu_rates(on_date):
                    record = _lookup(code, on_date, company)
            rates[code] = _rate_payload(record) if record else {'currency': code, 'rate': None}
        return Response({
            'date': on_date.isoformat(),
            'deal_currency': company_base_currency(company),
            'rates': rates,
        })

    def post(self, request):
        if not _allowed(request, 'ADD'):
            return Response({'error': 'Нет права вводить курсы валют.'}, status=status.HTTP_403_FORBIDDEN)
        company = _target_company(request)
        if company is None:
            return Response({'error': 'Не указана компания: ручной курс действует только внутри компании.'},
                            status=status.HTTP_400_BAD_REQUEST)
        currency = str(request.data.get('currency', '')).upper()
        if currency not in CURRENCY_CODES or currency == BASE_CURRENCY:
            return Response({'error': 'Укажите валюту, отличную от сума.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rate = Decimal(str(request.data.get('rate')))
            on_date = date_cls.fromisoformat(str(request.data.get('date')))
        except (InvalidOperation, ValueError, TypeError):
            return Response({'error': 'Укажите курс числом и дату в формате ГГГГ-ММ-ДД.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if rate <= 0:
            return Response({'error': 'Курс должен быть больше нуля.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            record, _ = ExchangeRate.objects.update_or_create(
                currency=currency, date=on_date, company=company,
                defaults={'rate': rate, 'source': ExchangeRate.Source.MANUAL, 'created_by': request.user},
            )
        except IntegrityError:
            return Response({'error': 'Не удалось сохранить курс.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_rate_payload(record), status=status.HTTP_201_CREATED)


class ExchangeRateDetailView(APIView):
    """Удаление ручного курса своей компании. Курсы ЦБ не удаляются."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not _allowed(request, 'DELETE'):
            return Response({'error': 'Нет права удалять курсы валют.'}, status=status.HTTP_403_FORBIDDEN)
        record = ExchangeRate.objects.filter(pk=pk, company__isnull=False).first()
        if record is None:
            return Response({'error': 'Курс не найден. Курсы ЦБ удалить нельзя.'},
                            status=status.HTTP_404_NOT_FOUND)
        if not is_admin(request.user) and record.company_id != getattr(user_company(request.user), 'id', None):
            return Response({'error': 'Курс не найден.'}, status=status.HTTP_404_NOT_FOUND)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExchangeRateRefreshView(APIView):
    """Загрузка актуальных курсов ЦБ по кнопке."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (_allowed(request, 'ADD') or _allowed(request, 'EDIT')):
            return Response({'error': 'Нет права обновлять курсы валют.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            saved = fetch_cbu_rates()
        except Exception as error:
            return Response({'error': f'ЦБ недоступен: {error}. Введите курс вручную.'},
                            status=status.HTTP_502_BAD_GATEWAY)
        latest = ExchangeRate.objects.filter(company__isnull=True).order_by('-date').first()
        return Response({'saved': saved, 'date': latest.date.isoformat() if latest else None})
