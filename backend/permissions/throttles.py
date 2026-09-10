"""
Throttle-классы для защиты эндпоинтов аутентификации от брутфорса.
"""
from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Ограничивает попытки входа по IP-адресу.

    Отдельный, намеренно жёсткий лимит: он защищает от перебора паролей
    и не должен зависеть от того, сколько запросов делает работающий
    в системе человек. Ставка берётся из настроек (scope 'login').
    """
    scope = 'login'

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident
        }


class BurstRateThrottle(UserRateThrottle):
    """
    Потолок на короткий всплеск запросов от одного пользователя.

    Считается в минутах и защищает сервер от лавины обращений — например,
    когда страница циклически перезапрашивает данные из-за ошибки.
    Обычной работе не мешает.
    """
    scope = 'burst'


class SustainedRateThrottle(UserRateThrottle):
    """
    Потолок на длительную нагрузку от одного пользователя.

    Считается в часах. Прежний общий лимит в 1000 запросов в час писался
    как защита от перебора паролей, но применялся ко всей работе: фильтры
    отправляют запрос при каждом изменении, списки и дашборд добавляют свои,
    и активный менеджер упирался в предел за смену, получая отказы вместо
    данных. Вход теперь ограничивается отдельно (см. LoginRateThrottle),
    поэтому здесь ставка рассчитана на живую работу.
    """
    scope = 'sustained'


# --- Account Lockout ---
LOCKOUT_MAX_ATTEMPTS = getattr(settings, 'LOCKOUT_MAX_ATTEMPTS', 10)
LOCKOUT_DURATION = getattr(settings, 'LOCKOUT_DURATION', 300)  # секунды


def _lockout_cache_key(username: str) -> str:
    """Ключ кэша для счётчика неудачных попыток. Нормализуем username."""
    return f'crm:login_lockout:{username.strip().lower()}'


def check_account_lockout(username: str) -> tuple[bool, int | None]:
    """
    Проверяет, заблокирован ли аккаунт.
    
    Returns:
        (is_locked, retry_after_seconds | None)
    """
    key = _lockout_cache_key(username)
    attempts = cache.get(key, 0)
    if attempts >= LOCKOUT_MAX_ATTEMPTS:
        ttl = cache.ttl(key) if hasattr(cache, 'ttl') else LOCKOUT_DURATION
        return True, ttl if ttl and ttl > 0 else LOCKOUT_DURATION
    return False, None


def record_failed_login(username: str) -> None:
    """Увеличивает счётчик неудачных попыток."""
    key = _lockout_cache_key(username)
    attempts = cache.get(key, 0)
    cache.set(key, attempts + 1, LOCKOUT_DURATION)


def reset_failed_logins(username: str) -> None:
    """Сбрасывает счётчик неудачных попыток после успешного логина."""
    cache.delete(_lockout_cache_key(username))
