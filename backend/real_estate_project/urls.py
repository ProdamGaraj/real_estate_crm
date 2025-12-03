from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

urlpatterns = [
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


    # Эндпоинты для JWT токенов
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # API документация
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

# Добавляем маршрут для медиа-файлов в режиме разработки
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)