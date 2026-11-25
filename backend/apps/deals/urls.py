from django.urls import path
from .booking_views import (BookingCancelView, BookingDetailView, BookingExtendView, BookingListView,
                            BookingScanView, BookingSettingsView, BookingSummaryView,
                            PropertyBookingQueueView)
from .views import (DealListView, DealDetailView, AvailableDiscountsView, DealCancelOrTerminateView, DealSummaryView,
                    DealScanView)
urlpatterns = [
    path('deals/', DealListView.as_view(), name='deal-list-create'),
    path('deals/<int:pk>/', DealDetailView.as_view(), name='deal-detail'),
    path('deals/<int:deal_pk>/cancel/', DealCancelOrTerminateView.as_view(), name='deal-cancel-terminate'),
    path('deals/<int:deal_pk>/scans/<str:kind>/', DealScanView.as_view(), name='deal-scan'),
    path('deals/summary/', DealSummaryView.as_view(), name='deal-summary'),

    path('deals/<int:deal_pk>/available-discounts/', AvailableDiscountsView.as_view(), name='available-discounts'),

    # Брони: отдельная сущность со своей очередью и своими правами
    path('bookings/', BookingListView.as_view(), name='booking-list-create'),
    path('bookings/summary/', BookingSummaryView.as_view(), name='booking-summary'),
    path('bookings/settings/', BookingSettingsView.as_view(), name='booking-settings'),
    path('bookings/<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('bookings/<int:pk>/extend/', BookingExtendView.as_view(), name='booking-extend'),
    path('bookings/<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
    path('bookings/<int:pk>/scan/', BookingScanView.as_view(), name='booking-scan'),
    path('properties/<int:property_pk>/booking-queue/', PropertyBookingQueueView.as_view(),
         name='property-booking-queue'),
]
