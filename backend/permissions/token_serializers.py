"""
Выдача JWT с теми же проверками, что и на /api/permissions/auth/login/.

Штатный TokenObtainPairView проверяет только пару логин-пароль. Из-за этого
он работал как второй вход в систему: через него получал рабочий токен
пользователь с отключённым или удалённым профилем, а блокировка после серии
неудачных попыток обходилась сменой эндпоинта.
"""

from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import UserProfile
from .throttles import check_account_lockout, record_failed_login, reset_failed_logins


def profile_login_error(user):
    """
    Причина, по которой пользователю нельзя войти, или None.

    Проверяется и активность профиля, и признак мягкого удаления: последний
    сам по себе доступ не закрывал.
    """
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return 'Профиль пользователя не найден'

    if profile.is_deleted:
        return 'Учётная запись удалена'
    if not profile.is_active:
        return 'Профиль пользователя отключён'
    return None


class GuardedTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Пара токенов выдаётся только тому, кому разрешён вход."""

    def validate(self, attrs):
        username = attrs.get(self.username_field) or ''

        is_locked, retry_after = check_account_lockout(username)
        if is_locked:
            raise serializers.ValidationError({
                'detail': (
                    'Аккаунт временно заблокирован из-за множества неудачных '
                    f'попыток входа. Попробуйте через {retry_after} секунд.'
                ),
                'retry_after': retry_after,
            })

        try:
            data = super().validate(attrs)
        except (AuthenticationFailed, serializers.ValidationError):
            record_failed_login(username)
            raise

        error = profile_login_error(self.user)
        if error:
            raise serializers.ValidationError({'detail': error})

        reset_failed_logins(username)
        return data


def revoke_refresh_tokens(user):
    """
    Отзывает все выданные пользователю refresh-токены.

    Вызывается при смене пароля: иначе тот, кто уже вошёл со старым паролем,
    сохранял доступ до истечения токена — до суток.
    """
    try:
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )
    except ImportError:  # приложение blacklist не подключено
        return 0

    revoked = 0
    for token in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        if created:
            revoked += 1
    return revoked
