"""
Throttle-классы для защиты эндпоинтов аутентификации от брутфорса.
"""
from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Ограничивает количество попыток логина по IP-адресу.
    5 попыток в минуту.
    """
    scope = 'login'
    rate = '5/min'

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident
        }


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
