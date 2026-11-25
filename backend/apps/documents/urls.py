from django.urls import path
from .views import (
    TemplateListCreateView,
    TemplateDetailView,
    BookingTemplatesListView,
    DealTemplatesListView,
    GenerateBookingDocumentView,
    GenerateDocumentView
)

urlpatterns = [
    path('templates/', TemplateListCreateView.as_view(), name='template-list-create'),
    path('templates/<int:pk>/', TemplateDetailView.as_view(), name='template-detail'),
    path('deals/<int:deal_pk>/available-templates/', DealTemplatesListView.as_view(), name='deal-templates-list'),
    path('deals/<int:deal_pk>/generate-document/<int:template_pk>/', GenerateDocumentView.as_view(), name='generate-document'),
    # Договор брони: свой список шаблонов и своя генерация — у брони нет
    # графика платежей, зато есть срок, цена на момент брони и взнос
    path('bookings/<int:booking_pk>/available-templates/', BookingTemplatesListView.as_view(),
         name='booking-templates-list'),
    path('bookings/<int:booking_pk>/generate-document/<int:template_pk>/',
         GenerateBookingDocumentView.as_view(), name='generate-booking-document'),
]
