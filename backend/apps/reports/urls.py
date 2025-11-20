from django.urls import path
from .views import (
    PlanFactReportView, plan_template_download, PlanUploadView,
    EmployeePlanFactReportView, employee_plan_template_download, EmployeePlanUploadView
)

urlpatterns = [
    # Project Reports
    path('reports/plan-fact/', PlanFactReportView.as_view(), name='plan-fact-report'),
    path('reports/plan-template/', plan_template_download, name='plan-template-download'),
    path('reports/plan-upload/', PlanUploadView.as_view(), name='plan-upload'),

    # Employee Reports
    path('reports/employee-plan-fact/', EmployeePlanFactReportView.as_view(), name='employee-plan-fact-report'),
    path('reports/employee-plan-template/', employee_plan_template_download, name='employee-plan-template-download'),
    path('reports/employee-plan-upload/', EmployeePlanUploadView.as_view(), name='employee-plan-upload'),
]