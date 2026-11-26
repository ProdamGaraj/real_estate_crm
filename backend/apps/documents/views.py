from django.http import HttpResponse
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView
from rest_framework.response import Response
from docxtpl import DocxTemplate
from jinja2 import TemplateError
from django.utils import timezone
import io

from apps.deals.booking import booking_for_deal
from apps.deals.models import Booking, Deal
from .formatting import template_environment
from .models import Template
from .serializers import TemplateSerializer
from permissions.permissions import TemplatePermission
from permissions.backends import can_user_perform_action, get_filtered_queryset
from permissions.reference_scope import (
    company_for_new_record,
    is_admin as is_reference_admin,
    scope_reference_queryset,
    with_shared_records,
)


class TemplateListCreateView(generics.ListCreateAPIView):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated, TemplatePermission]
    parser_classes = [MultiPartParser]

    def get_queryset(self):
        # Шаблоны своей компании и общесистемные
        return with_shared_records(self.request.user, Template.objects.all(), 'TEMPLATE')

    def perform_create(self, serializer):
        # Администратор может завести шаблон для конкретной компании или
        # общий для всех (company: пусто) — как у остальных справочников.
        # Раньше шаблон всегда оседал в компании автора, и шаблон, заведённый
        # администратором из служебной компании, не видел ни один менеджер
        serializer.save(
            company=company_for_new_record(self.request),
            created_by=self.request.user,
        )


class TemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated, TemplatePermission]
    # JSON нужен, чтобы снять область применения: пустой список в
    # multipart не передать, а именно он возвращает шаблон «во все сделки»
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        # Общесистемный шаблон можно открыть, но менять и удалять —
        # только администратору (ему доступно всё по области видимости)
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return with_shared_records(self.request.user, Template.objects.all(), 'TEMPLATE')
        return get_filtered_queryset(
            self.request.user,
            Template.objects.all(),
            'TEMPLATE'
        )

    def perform_update(self, serializer):
        # Шаблон, заведённый не в той компании, администратор переносит
        # отсюда: иначе менеджеры чужой компании его не увидят, а поправить
        # можно было только в базе
        if is_reference_admin(self.request.user) and 'company' in getattr(self.request, 'data', {}):
            serializer.save(company=company_for_new_record(self.request))
        else:
            serializer.save()


def printable_templates(user):
    """
    Шаблоны, которыми пользователь вправе напечатать документ.

    Право TEMPLATE управляет справочником шаблонов в настройках, а не
    печатью: менеджеру шаблоны заводит администратор, своих у менеджера
    нет. Пока список фильтровался только по области права, менеджер с
    правом TEMPLATE/OWN видел пустой список и получал 404 «Шаблон не
    найден или недоступен», а без права TEMPLATE — 403. Доступ к самому
    документу по-прежнему решает право на сделку или бронь.

    Берём объединение двух правил, чтобы никто не потерял доступ:
    шаблоны своей компании и общие — плюс то, что открывает область
    права TEMPLATE. У роли «Администратор компании» это право выдано с
    областью «Вся система», и по ней видны шаблоны всех компаний.
    """
    all_templates = Template.objects.all()
    return all_templates.filter(
        Q(pk__in=scope_reference_queryset(user, all_templates).values('pk'))
        | Q(pk__in=with_shared_records(user, all_templates, 'TEMPLATE').values('pk'))
    )


def templates_for_property(user, prop, kind):
    """
    Шаблоны, подходящие объекту: по проекту, дому, типу недвижимости и виду.

    Вид обязателен: в брони печатается договор брони, в сделке — договор
    по сделке. Раньше оба списка показывали все шаблоны подряд.
    """
    building = prop.building
    project = building.project

    # Сначала фильтруем по полям, которые поддерживаются базой данных
    queryset = printable_templates(user).filter(
        Q(applies_to_projects__isnull=True) | Q(applies_to_projects=project),
        Q(applies_to_buildings__isnull=True) | Q(applies_to_buildings=building),
        kind=kind,
    ).distinct()

    # Затем фильтруем по JSON-полю уже в Python
    prop_type = prop.property_type
    filtered_pks = []
    for template in queryset:
        applies_to_types = template.applies_to_property_types
        # Шаблон подходит, если список типов пуст (подходит для всех)
        # или если тип недвижимости объекта есть в списке
        if not applies_to_types or prop_type in applies_to_types:
            filtered_pks.append(template.pk)

    return printable_templates(user).filter(pk__in=filtered_pks)


class DealTemplatesListView(generics.ListAPIView):
    """Шаблоны договора по сделке. Доступ решает право на сделку."""
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        deal_id = self.kwargs.get('deal_pk')
        try:
            deal = Deal.objects.select_related('property__building__project').get(pk=deal_id)
        except Deal.DoesNotExist:
            return Template.objects.none()

        # Проверяем доступ к этой сделке
        if not can_user_perform_action(self.request.user, 'VIEW', 'DEAL', obj=deal):
            return Template.objects.none()

        return templates_for_property(self.request.user, deal.property, Template.Kind.DEAL)


class BookingTemplatesListView(generics.ListAPIView):
    """Шаблоны договора брони, подходящие объекту этой брони."""
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        try:
            booking = Booking.objects.select_related('property__building__project').get(
                pk=self.kwargs.get('booking_pk')
            )
        except Booking.DoesNotExist:
            return Template.objects.none()

        if not can_user_perform_action(self.request.user, 'VIEW', 'BOOKING', obj=booking):
            return Template.objects.none()

        return templates_for_property(self.request.user, booking.property, Template.Kind.BOOKING)


def client_phone_context(client):
    """
    Телефоны клиента для меток шаблона.

    Телефоны хранятся отдельной таблицей, а метка {{client.phone_number}}
    осталась от прежней модели, где номер был полем клиента. Без явной
    подстановки она давала пустоту, и договор выходил без телефона. Берём
    основной номер, а если он не отмечен — первый добавленный.
    """
    phone = (client.phone_numbers.filter(is_primary=True).order_by('id').first()
             or client.phone_numbers.order_by('id').first())
    client.phone_number = phone.phone_number if phone else ''
    # Все номера через « / », основной первым: в договоре часто два телефона
    numbers = [phone.phone_number] if phone else []
    numbers += [n for n in client.phone_numbers.order_by('id').values_list('phone_number', flat=True)
                if n not in numbers]
    client.all_phones = ' / '.join(numbers)
    return client


def render_template(template, context, currency):
    """Собирает .docx по шаблону и контексту или возвращает понятный отказ."""
    doc = DocxTemplate(template.file.path)
    # Песочница защищает от выполнения кода из шаблона (SSTI/RCE); фильтры —
    # суммы прописью, разряды и даты
    try:
        doc.render(context, jinja_env=template_environment(currency))
    except TemplateError as error:
        # Опечатка в метке давала ошибку сервера без объяснения
        return None, Response(
            {"error": f"Ошибка в метках шаблона «{template.name}»: {str(error).rstrip('.')}. "
                      f"Проверьте написание меток и фигурные скобки."},
            status=status.HTTP_400_BAD_REQUEST
        )
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    return file_stream, None


def docx_response(file_stream, filename):
    response = HttpResponse(
        file_stream.read(),
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


class GenerateBookingDocumentView(APIView):
    """
    Договор брони по шаблону.

    Контекст свой: у брони нет графика платежей и нет стоимости по договору,
    зато есть срок в днях, даты брони, цена объекта на момент брони и взнос.
    Метки: {{booking.*}}, {{client.*}}, {{property.*}}, {{building.*}},
    {{project.*}}, {{manager.*}}, {{fee.*}}, {{today}}.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_pk, template_pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related(
                'client', 'property__building__project', 'created_by'
            ).get(pk=booking_pk)
        except Booking.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not can_user_perform_action(request.user, 'VIEW', 'BOOKING', obj=booking):
            return Response({"error": "У вас нет доступа к этой брони."},
                            status=status.HTTP_403_FORBIDDEN)

        # По снятой брони договор печатать нельзя: документ выглядел бы
        # действующим, хотя брони уже нет
        if booking.status in Booking.DEAD_STATUSES:
            return Response(
                {"error": f"Бронь {booking.get_status_display().lower()} — "
                          f"документы по ней больше не формируются."},
                status=status.HTTP_400_BAD_REQUEST
            )

        template_qs = printable_templates(request.user)
        try:
            template = template_qs.get(pk=template_pk, kind=Template.Kind.BOOKING)
        except Template.DoesNotExist:
            return Response({"error": "Шаблон договора брони не найден или недоступен."},
                            status=status.HTTP_404_NOT_FOUND)

        fee = booking.payments.order_by('id').first()
        context = {
            'booking': booking,
            'client': client_phone_context(booking.client),
            'property': booking.property,
            'building': booking.property.building,
            'project': booking.property.building.project,
            'manager': booking.created_by,
            # Взнос за бронь: сумма, срок и счёт получателя
            'fee': fee,
            'first_payment': fee,
            'today': timezone.localdate(),
        }
        # Сумма прописью по умолчанию — в валюте взноса, а если взноса нет,
        # в валюте цены брони
        currency = (fee.currency if fee else None) or booking.currency or 'UZS'
        file_stream, error = render_template(template, context, currency)
        if error:
            return error
        return docx_response(file_stream, f'booking_{booking.id}.docx')


class GenerateDocumentView(APIView):
    """Договор по сделке. Доступ решает право на сделку, не право TEMPLATE."""
    permission_classes = [IsAuthenticated]

    def get(self, request, deal_pk, template_pk, *args, **kwargs):
        try:
            deal = Deal.objects.select_related('client', 'property__building__project', 'created_by').get(pk=deal_pk)
        except Deal.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Проверяем доступ к этой сделке (scope-фильтрация)
        if not can_user_perform_action(request.user, 'VIEW', 'DEAL', obj=deal):
            return Response(
                {"error": "У вас нет доступа к этой сделке."},
                status=status.HTTP_403_FORBIDDEN
            )

        # По отменённой или расторгнутой сделке договор печатать нельзя:
        # документ выглядел бы действующим, хотя сделки уже нет
        if deal.status in (Deal.DealStatus.CANCELLED, Deal.DealStatus.TERMINATED):
            return Response(
                {"error": f"Сделка {deal.get_status_display().lower()} — "
                          f"документы по ней больше не формируются."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Шаблон чужой компании недоступен и здесь
        template_qs = printable_templates(request.user)
        try:
            template = template_qs.get(pk=template_pk)
        except Template.DoesNotExist:
            return Response(
                {"error": "Шаблон не найден или недоступен."},
                status=status.HTTP_404_NOT_FOUND
            )
        if template.kind != Template.Kind.DEAL:
            return Response(
                {"error": f"Шаблон «{template.name}» — договор брони, по сделке он не печатается."},
                status=status.HTTP_400_BAD_REQUEST
            )

        payments = list(deal.payments.select_related('payment_type').order_by('due_date', 'id'))
        booking = booking_for_deal(deal)
        context = {
            'deal': deal,
            'client': client_phone_context(deal.client),
            'property': deal.property,
            'building': deal.property.building,
            'project': deal.property.building.project,
            'manager': deal.created_by,
            # График для таблицы в договоре: {%tr for p in payments %} … {%tr endfor %}
            'payments': payments,
            # Первый платёж графика — например, взнос по брони, если сделка
            # оформлена по брони: он входит в график первой строкой
            'first_payment': payments[0] if payments else None,
            # Бронь, из которой выросла сделка: её срок, даты и номер договора
            'booking': booking,
            'today': timezone.localdate(),
        }
        # Валюта прописи по умолчанию — валюта сделки
        file_stream, error = render_template(template, context, deal.currency)
        if error:
            return error
        return docx_response(file_stream, f'generated_doc_{deal.id}.docx')