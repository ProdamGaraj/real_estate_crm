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
from rest_framework.decorators import throttle_classes as throttle_decorator


def health_check(request):
    """Публичный эндпоинт для проверки состояния сервиса (Docker healthcheck)."""
    return JsonResponse({"status": "ok"})


# Обёртка для TokenObtainPairView с rate limiting
class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]

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
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

]

# API документация и медиа-файлы — только в режиме разработки
if settings.DEBUG:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
        path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)