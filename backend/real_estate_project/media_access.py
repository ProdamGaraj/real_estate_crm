"""
Контролируемая отдача медиа-файлов.

Часть загружаемых файлов — маркетинговые материалы (планировки, галереи
проектов и домов, аватары). Их отдаёт напрямую nginx: они и так доступны
партнёрам через публичный API.

Остальное — сканы паспортов, подписанные договоры, документы о расторжении,
вложения к задачам и шаблоны документов. Такие файлы раздавать по прямой
ссылке нельзя, поэтому API возвращает ссылку с подписанным токеном
ограниченного срока действия, а сама отдача идёт через это представление.
"""

import mimetypes
import os
import posixpath

from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404, HttpResponse, HttpResponseForbidden

MEDIA_TOKEN_SALT = 'crm.media.access'

# Каталоги, содержимое которых не требует авторизации
PUBLIC_MEDIA_PREFIXES = (
    'projects/',
    'buildings/',
    'layouts/',
    'avatars/',
)


def is_public_media(relative_path: str) -> bool:
    """Лежит ли файл в каталоге с маркетинговыми материалами."""
    return relative_path.startswith(PUBLIC_MEDIA_PREFIXES)


def _normalize(relative_path: str) -> str:
    """Приводит путь к виду, в котором он хранится в FileField."""
    return str(relative_path or '').replace('\\', '/').lstrip('/')


def sign_media_path(relative_path: str) -> str:
    """Токен доступа к конкретному файлу. Срок жизни — MEDIA_LINK_TTL."""
    return signing.dumps(_normalize(relative_path), salt=MEDIA_TOKEN_SALT)


def build_media_url(file_field) -> str | None:
    """
    URL файла для выдачи в API.

    Публичные материалы отдаются обычной ссылкой, защищённые — ссылкой
    с токеном: без него представление ниже вернёт 403.
    """
    if not file_field:
        return None

    url = file_field.url
    relative_path = _normalize(getattr(file_field, 'name', ''))
    if not relative_path or is_public_media(relative_path):
        return url

    separator = '&' if '?' in url else '?'
    return f'{url}{separator}token={sign_media_path(relative_path)}'


def _token_matches(token: str, relative_path: str) -> bool:
    if not token:
        return False
    try:
        signed_path = signing.loads(
            token,
            salt=MEDIA_TOKEN_SALT,
            max_age=settings.MEDIA_LINK_TTL,
        )
    except signing.BadSignature:
        return False
    return signed_path == relative_path


def serve_media(request, path: str):
    """
    Отдаёт файл из MEDIA_ROOT с проверкой доступа.

    В продакшене сам файл пишет nginx (X-Accel-Redirect) — Django только
    решает, разрешена ли выдача. При DEBUG файл отдаётся напрямую.
    """
    relative_path = _normalize(path)

    # Защита от выхода за пределы каталога медиа
    media_root = os.path.realpath(settings.MEDIA_ROOT)
    absolute_path = os.path.realpath(os.path.join(media_root, relative_path))
    if os.path.commonpath([media_root, absolute_path]) != media_root:
        raise Http404

    if not is_public_media(relative_path):
        if not _token_matches(request.GET.get('token', ''), relative_path):
            return HttpResponseForbidden(
                'Ссылка на файл недействительна или устарела. '
                'Откройте документ из карточки заново.'
            )

    if not os.path.isfile(absolute_path):
        raise Http404

    if settings.MEDIA_USE_ACCEL_REDIRECT:
        response = HttpResponse()
        # nginx подставит файл сам из internal-локации
        response['X-Accel-Redirect'] = posixpath.join(
            settings.MEDIA_ACCEL_LOCATION, relative_path
        )
        content_type, _ = mimetypes.guess_type(relative_path)
        response['Content-Type'] = content_type or 'application/octet-stream'
        # Иначе nginx унаследует пустое тело ответа Django
        del response['Content-Length']
        return response

    return FileResponse(open(absolute_path, 'rb'))
