"""
URL конфигурация для модуля permissions
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CompanyViewSet, DepartmentViewSet,
    PermissionViewSet, RoleViewSet,
    UserProfileViewSet, PermissionLogViewSet,
    CurrentUserProfileView, PermissionStatsView
)
from .auth_views import (
    login_view,
    logout_view,
    password_reset_request,
    password_reset_confirm
)

# Создаем роутер для ViewSets
router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='company')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'user-profiles', UserProfileViewSet, basename='userprofile')
router.register(r'logs', PermissionLogViewSet, basename='permissionlog')

urlpatterns = [
    # ViewSets через router
    path('', include(router.urls)),
    
    # Аутентификация
    path('auth/login/', login_view, name='login'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/password-reset/', password_reset_request, name='password-reset'),
    path('auth/password-reset/confirm/', password_reset_confirm, name='password-reset-confirm'),
    
    # Дополнительные endpoints
    path('me/', CurrentUserProfileView.as_view(), name='current-user-profile'),
    path('stats/', PermissionStatsView.as_view(), name='permission-stats'),
]
