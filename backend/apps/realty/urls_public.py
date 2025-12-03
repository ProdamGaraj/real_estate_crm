# real_estate_crm/backend/apps/realty/urls_public.py

from django.urls import path
from .views import (
    PublicProjectListView,
    PublicProjectDetailView,
    PublicBuildingDetailView,
    PublicLayoutListView,
)
from apps.crm.views import PublicApplicationCreateView

urlpatterns = [
    # Проекты и здания
    path('projects/', PublicProjectListView.as_view(), name='public-project-list'),
    path('projects/<int:pk>/', PublicProjectDetailView.as_view(), name='public-project-detail'),
    path('buildings/<int:pk>/', PublicBuildingDetailView.as_view(), name='public-building-detail'),
    path('buildings/<int:building_pk>/layouts/', PublicLayoutListView.as_view(), name='public-layout-list'),
    
    # Заявки
    path('applications/', PublicApplicationCreateView.as_view(), name='public-application-create'),
]