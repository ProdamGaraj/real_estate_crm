from django.urls import path
from .views import (
    ProjectListView,
    ProjectDetailView,
    BuildingListCreateView,
    BuildingDetailView,  # <-- ДОБАВЬТЕ ЭТОТ ИМПОРТ
    BuildingTypeListView,
    BuildingTypeDetailView,
    BuildingListViewAll
)
from .views import DiscountListView, DiscountDetailView
from .views import PropertyDetailView
from .views import LayoutListView, LayoutDetailView, LayoutBulkUploadView
from .views import PropertyTemplateDownloadView, PropertyUploadView, ProjectImageCreateView,ProjectImageDetailView,BuildingImageCreateView,BuildingImageDetailView

urlpatterns = [
    # Projects
    path('projects/', ProjectListView.as_view(), name='project-list'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='project-detail'),
    path('buildings-all/', BuildingListViewAll.as_view(), name='building-list-all'),
    # Buildings (nested under projects)
    path('projects/<int:project_pk>/buildings/',  BuildingListCreateView.as_view(), name='building-create'),
    path('projects/<int:project_pk>/buildings/<int:pk>/', BuildingDetailView.as_view(), name='building-detail'),
    path('projects/<int:project_pk>/buildings/<int:building_pk>/layouts/', LayoutListView.as_view()),
    path('projects/<int:project_pk>/buildings/<int:building_pk>/layouts/<int:pk>/', LayoutDetailView.as_view()),
    path('projects/<int:project_pk>/buildings/<int:building_pk>/layouts/bulk-upload/', LayoutBulkUploadView.as_view(), name='layout-bulk-upload'),
    # Building Types
    path('building-types/', BuildingTypeListView.as_view(), name='building-type-list'),
    path('building-types/<int:pk>/', BuildingTypeDetailView.as_view(), name='building-type-detail'),
    path('projects/<int>/buildings/<int:building_pk>/properties/<int:pk>/', PropertyDetailView.as_view(), name='property-detail'),
    path('projects/<int:project_pk>/buildings/<int:building_pk>/download-template/', PropertyTemplateDownloadView.as_view(), name='property-template-download'),
    path('discounts/', DiscountListView.as_view(), name='discount-list'),
    path('discounts/<int:pk>/', DiscountDetailView.as_view(), name='discount-detail'),
    path('projects/<int:project_pk>/buildings/<int:building_pk>/gallery/', BuildingImageCreateView.as_view(), name='building-image-create'),
    path('projects/<int:project_pk>/buildings/<int:building_pk>/gallery/<int:pk>/', BuildingImageDetailView.as_view(), name='building-image-delete'),
    # Маршрут для загрузки (вложен в проект и дом)
    path('projects/<int:project_pk>/buildings/<int:building_pk>/upload-properties/', PropertyUploadView.as_view(), name='property-upload'),
    # Project Gallery
    path('projects/<int:project_pk>/gallery/', ProjectImageCreateView.as_view(), name='project-image-create'),
    path('projects/<int:project_pk>/gallery/<int:pk>/', ProjectImageDetailView.as_view(), name='project-image-delete'),
]