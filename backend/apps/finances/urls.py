# real_estate_crm/backend/apps/finances/urls.py

from django.urls import path
from .views import (
    PaymentTypeListView, BeneficiaryAccountListView, DealPaymentScheduleCreateView,
    PaymentTypeDetailView, BeneficiaryAccountDetailView,PaymentDetailView, PaymentMarkAsReturnedView,
    PaymentListView, FinanceSummaryView
)
from .currency_views import (
    CurrencySettingsView, ExchangeRateDetailView, ExchangeRateListView, ExchangeRateRefreshView,
)
from .installment_views import InstallmentPlanDetailView, InstallmentPlanListView

urlpatterns = [
    path('finances/payments/', PaymentListView.as_view(), name='payment-list'),
    path('finances/payment-types/', PaymentTypeListView.as_view(), name='payment-type-list'),
    path('finances/payment-types/<int:pk>/', PaymentTypeDetailView.as_view(), name='payment-type-detail'),
    path('finances/beneficiary-accounts/', BeneficiaryAccountListView.as_view(), name='beneficiary-account-list'),
    path('finances/beneficiary-accounts/<int:pk>/', BeneficiaryAccountDetailView.as_view(),
         name='beneficiary-account-detail'),
    path('finances/payments/<int:pk>/', PaymentDetailView.as_view(), name='payment-detail'),
    path('finances/payments/<int:pk>/mark-as-returned/', PaymentMarkAsReturnedView.as_view(), name='payment-mark-as-returned'),
    path('deals/<int:deal_pk>/payment-schedule/', DealPaymentScheduleCreateView.as_view(),
         name='deal-payment-schedule-create'),
    path('finances/summary/', FinanceSummaryView.as_view(), name='finance-summary'),
    path('finances/currency-settings/', CurrencySettingsView.as_view(), name='currency-settings'),
    path('finances/exchange-rates/', ExchangeRateListView.as_view(), name='exchange-rate-list'),
    path('finances/exchange-rates/refresh/', ExchangeRateRefreshView.as_view(), name='exchange-rate-refresh'),
    path('finances/exchange-rates/<int:pk>/', ExchangeRateDetailView.as_view(), name='exchange-rate-detail'),
    path('finances/installment-plans/', InstallmentPlanListView.as_view(), name='installment-plan-list'),
    path('finances/installment-plans/<int:pk>/', InstallmentPlanDetailView.as_view(), name='installment-plan-detail'),
]