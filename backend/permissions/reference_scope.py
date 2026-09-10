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
            company = getattr(profile, 'company', None)
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
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_editable(instance)
        instance.delete()
