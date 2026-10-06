"""
Изоляция справочников между компаниями.

Типы домов, причины отказа, статусы заявок, типы платежей и цели приобретения
были общими для всей системы: одна компания правила воронку и типы платежей
другой. Теперь у каждой записи есть компания-владелец.

Правила видимости:

* запись своей компании — видна и редактируется;
* запись без компании — общесистемная: видна всем, но менять и удалять её
  может только системный администратор;
* запись чужой компании — не видна вовсе.
"""

from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError


def _profile(user):
    return getattr(user, 'profile', None)


def is_admin(user):
    """Системный администратор — тот, кому доступны общесистемные записи."""
    if getattr(user, 'is_superuser', False):
        return True
    profile = _profile(user)
    return bool(profile and profile.is_system_admin)


def scope_reference_queryset(user, queryset):
    """Оставляет записи своей компании и общесистемные."""
    if is_admin(user):
        return queryset

    profile = _profile(user)
    if profile is None or not profile.is_active or profile.is_deleted:
        return queryset.none()

    if profile.company_id is None:
        # Пользователь вне компании видит только общесистемные записи
        return queryset.filter(company__isnull=True)

    return queryset.filter(Q(company_id=profile.company_id) | Q(company__isnull=True))


def company_for_new_record(request):
    """
    Компания новой записи справочника.

    Обычный пользователь создаёт записи своей компании. Системный
    администратор может указать компанию (``company``: id) или сделать
    запись общесистемной (``company``: пусто). Без указания — своя компания,
    как раньше: так у администратора из «СИСТЕМЫ» записи оседали в его
    служебной компании и были не видны рабочим.
    """
    user = request.user
    own = getattr(_profile(user), 'company', None)
    data = getattr(request, 'data', None)
    if is_admin(user) and data is not None and 'company' in data:
        value = data.get('company')
        if value in (None, '', 'null', 'shared'):
            return None
        from .models import Company
        company = Company.objects.filter(pk=value).first()
        if company is None:
            raise ValidationError({'company': 'Компания не найдена.'})
        return company
    return own


def with_shared_records(user, queryset, resource_type):
    """
    Записи по области видимости разрешений плюс общесистемные (без компании).

    Для справочников, у которых видимость зависит от области разрешения
    (счета получателей, шаблоны договоров). Общесистемную запись заводит
    системный администратор для всех компаний — так работают типы платежей
    и статусы заявок, и так описано в документации. Здесь же запись без
    компании не видел никто, кроме компании её автора: менеджер не находил
    в графике платежей счёт получателя, а в сделке — шаблон договора.

    Только для чтения: менять общесистемную запись может лишь администратор.
    """
    from .backends import can_user_perform_action, get_filtered_queryset

    scoped = get_filtered_queryset(user, queryset, resource_type)
    if is_admin(user) or not can_user_perform_action(user, 'VIEW', resource_type):
        return scoped
    return queryset.filter(
        Q(pk__in=scoped.values('pk')) | Q(company__isnull=True)
    ).distinct()


class CompanyScopedReferenceMixin:
    """
    Подмешивается к представлениям справочников.

    Ожидает, что у модели есть поле ``company``.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        return scope_reference_queryset(self.request.user, queryset)

    def perform_create(self, serializer):
        user = self.request.user
        profile = _profile(user)

        # Общесистемную запись (без компании) заводит только администратор
        if is_admin(user):
            company = company_for_new_record(self.request)
        else:
            company = getattr(profile, 'company', None)
            if company is None:
                raise ValidationError(
                    {'company': 'У вашего профиля не указана компания — '
                                'создать запись справочника нельзя.'}
                )

        serializer.save(company=company)

    def _ensure_editable(self, instance):
        if instance.company_id is None and not is_admin(self.request.user):
            raise PermissionDenied(
                'Это общесистемная запись справочника. '
                'Изменить или удалить её может только системный администратор.'
            )

    def perform_update(self, serializer):
        self._ensure_editable(serializer.instance)
        # Системный администратор может перенести запись в другую компанию или
        # сделать общей — так исправляются записи, заведённые не в той компании
        if is_admin(self.request.user) and 'company' in getattr(self.request, 'data', {}):
            serializer.save(company=company_for_new_record(self.request))
        else:
            serializer.save()

    def perform_destroy(self, instance):
        self._ensure_editable(instance)
        instance.delete()
