from django.urls import path
from .views import (
    TemplateListCreateView,
    TemplateDetailView,
    DealTemplatesListView,
    GenerateDocumentView
)

urlpatterns = [
    path('templates/', TemplateListCreateView.as_view(), name='template-list-create'),
    path('templates/<int:pk>/', TemplateDetailView.as_view(), name='template-detail'),
    path('deals/<int:deal_pk>/available-templates/', DealTemplatesListView.as_view(), name='deal-templates-list'),
    path('deals/<int:deal_pk>/generate-document/<int:template_pk>/', GenerateDocumentView.as_view(), name='generate-document'),
]