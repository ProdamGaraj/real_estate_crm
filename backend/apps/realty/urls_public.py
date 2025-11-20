# real_estate_crm/backend/apps/realty/urls_public.py

from django.urls import path
from .views import (
    PublicProjectListView,
    PublicProjectDetailView,
    PublicBuildingDetailView,
)

urlpatterns = [
    path('projects/', PublicProjectListView.as_view(), name='public-project-list'),
    path('projects/<int:pk>/', PublicProjectDetailView.as_view(), name='public-project-detail'),
    path('buildings/<int:pk>/', PublicBuildingDetailView.as_view(), name='public-building-detail'),
]