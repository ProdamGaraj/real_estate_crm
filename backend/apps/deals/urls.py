from django.urls import path
from .views import DealListView, DealDetailView, AvailableDiscountsView, DealCancelOrTerminateView, DealSummaryView
urlpatterns = [
    path('deals/', DealListView.as_view(), name='deal-list-create'),
    path('deals/<int:pk>/', DealDetailView.as_view(), name='deal-detail'),
    path('deals/<int:deal_pk>/cancel/', DealCancelOrTerminateView.as_view(), name='deal-cancel-terminate'),
    path('deals/summary/', DealSummaryView.as_view(), name='deal-summary'),

    path('deals/<int:deal_pk>/available-discounts/', AvailableDiscountsView.as_view(), name='available-discounts'),
]