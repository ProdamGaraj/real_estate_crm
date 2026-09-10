"""
Хранение refresh-токена в httpOnly cookie.

Раньше оба токена лежали в localStorage: любой скрипт на странице мог их
прочитать, и одной XSS хватало, чтобы унести сессию на сутки вперёд.

Теперь:

* refresh-токен уходит в httpOnly-cookie — JavaScript его не видит;
* access-токен возвращается в теле ответа и живёт только в памяти вкладки,
  поэтому исчезает при закрытии и не хранится на диске;
* после перезагрузки страницы клиент восстанавливает сессию, обменяв
  cookie на новый access-токен.

Cookie помечена SameSite=Lax, поэтому браузер не отправит её в запросе,
инициированном чужим сайтом, — это же закрывает CSRF на обновлении токена.
"""

from django.conf import settings

REFRESH_COOKIE_NAME = 'crm_refresh'
# Cookie нужна только эндпоинтам аутентификации
REFRESH_COOKIE_PATH = '/api/'


def _cookie_max_age():
    lifetime = settings.SIMPLE_JWT.get('REFRESH_TOKEN_LIFETIME')
    return int(lifetime.total_seconds()) if lifetime else None


def set_refresh_cookie(response, refresh_token):
    """Кладёт refresh-токен в httpOnly cookie."""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=_cookie_max_age(),
        httponly=True,
        # По HTTPS — только secure-cookie. Настройка отдельная: на площадке,
        # которая пока работает по http, secure-cookie не установилась бы вовсе
        secure=getattr(settings, 'REFRESH_COOKIE_SECURE', not settings.DEBUG),
        samesite='Lax',
        path=REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    """Убирает cookie при выходе."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return response


def get_refresh_token(request):
    """
    Достаёт refresh-токен: сначала из cookie, затем из тела запроса.

    Разбор тела оставлен для совместимости — старые вкладки и внешние
    интеграции продолжат работать, пока не обновятся.
    """
    token = request.COOKIES.get(REFRESH_COOKIE_NAME)
    if token:
        return token
    data = getattr(request, 'data', None) or {}
    return data.get('refresh')
