from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)
from permissions.throttles import LoginRateThrottle
from .media_access import serve_media
from permissions.token_serializers import GuardedTokenObtainPairSerializer
from permissions.token_cookies import get_refresh_token, set_refresh_cookie
from rest_framework.decorators import throttle_classes as throttle_decorator


def health_check(request):
    """Публичный эндпоинт для проверки состояния сервиса (Docker healthcheck)."""
    return JsonResponse({"status": "ok"})


# Обёртка для TokenObtainPairView: rate limiting + те же проверки профиля
# и блокировки аккаунта, что и на /auth/login/
class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]
    serializer_class = GuardedTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        # refresh уходит в httpOnly cookie, а не в тело ответа
        refresh = response.data.pop('refresh', None) if response.status_code == 200 else None
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """
    Обновление access-токена по refresh из httpOnly cookie.

    Клиент этот токен не видит и не передаёт: браузер отправляет cookie сам.
    Тело запроса тоже принимается — чтобы старые вкладки доработали до
    следующего входа.
    """

    def post(self, request, *args, **kwargs):
        refresh = get_refresh_token(request)
        if refresh and not request.data.get('refresh'):
            # DRF-запрос иммутабелен, поэтому подменяем данные копией
            data = request.data.copy()
            data['refresh'] = refresh
            request._full_data = data

        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            # При включённой ротации приходит новый refresh — обновляем cookie
            rotated = response.data.pop('refresh', None)
            if rotated:
                set_refresh_cookie(response, rotated)
        return response

urlpatterns = [
    path('api/health/', health_check, name='health_check'),
    path('admin/', admin.site.urls),

    # --- ПУБЛИЧНЫЙ API ДЛЯ САЙТА ---
    path('api/public/', include('apps.realty.urls_public')),

    # --- API ДЛЯ ВНУТРЕННЕЙ CRM ---
    path('api/', include('apps.crm.urls')),
    path('api/', include('apps.realty.urls')),
    path('api/', include('apps.deals.urls')),
    path('api/', include('apps.finances.urls')),
    path('api/', include('apps.documents.urls')),
    path('api/', include('apps.reports.urls')),
    path('api/', include('apps.tasks.urls')),  # Система управления задачами
    path('api/permissions/', include('permissions.urls')),  # Система разрешений


    # Эндпоинты для JWT токенов (с rate limiting на получение токена)
    path('api/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),

    # Медиа проходит через проверку доступа: прямая раздача открывала бы
    # сканы паспортов и договоров любому по угаданной ссылке
    path('media/<path:path>', serve_media, name='serve_media'),
]

# API документация и медиа-файлы — только в режиме разработки
if settings.DEBUG:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
        path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    ]
