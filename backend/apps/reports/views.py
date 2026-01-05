from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.decorators import api_view, permission_classes
from django.http import HttpResponse
from django.db.models import Sum, Count, Q
from datetime import datetime, timedelta
import pandas as pd
import io
import calendar
from decimal import Decimal

from .models import Plan, EmployeePlan
from apps.deals.models import Deal
from apps.finances.models import Payment
from apps.realty.models import Project
from django.contrib.auth.models import User
from permissions.permissions import ReportPermission, PlanPermission
from permissions.backends import get_filtered_queryset


# --- Helper Function ---
def calculate_metrics(plan, fact, start_date, end_date):
    plan = plan or Decimal(0)
    fact = fact or Decimal(0)

    percentage = (fact / plan * 100) if plan > 0 else 0

    today = datetime.now().date()
    forecast_value = fact
    if start_date <= today <= end_date:
        days_in_period = (end_date - start_date).days + 1
        days_passed = (today - start_date).days + 1
        if days_passed > 0:
            forecast_value = (fact / Decimal(days_passed)) * Decimal(days_in_period)

    forecast_percentage = (forecast_value / plan * 100) if plan > 0 else 0

    return {
        "plan": plan,
        "fact": fact,
        "percentage": round(percentage, 2),
        "forecast": round(forecast_value, 2),
        "forecast_percentage": round(forecast_percentage, 2)
    }


# --- Project Report Views ---

class PlanFactReportView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        year = int(request.query_params.get('year', datetime.now().year))
        period_type = request.query_params.get('period_type', 'month')
        period_value = int(request.query_params.get('period_value', datetime.now().month))

        # ... (Date calculation logic remains the same)
        if period_type == 'month':
            start_date = datetime(year, period_value, 1).date()
            end_date = (start_date + timedelta(days=calendar.monthrange(year, period_value)[1] - 1))
        elif period_type == 'quarter':
            start_month = (period_value - 1) * 3 + 1
            end_month = start_month + 2
            start_date = datetime(year, start_month, 1).date()
            end_date = (datetime(year, end_month, 1) + timedelta(
                days=calendar.monthrange(year, end_month)[1] - 1)).date()
        elif period_type == 'half_year':
            start_month = 1 if period_value == 1 else 7
            end_month = 6 if period_value == 1 else 12
            start_date = datetime(year, start_month, 1).date()
            end_date = (datetime(year, end_month, 1) + timedelta(
                days=calendar.monthrange(year, end_month)[1] - 1)).date()
        elif period_type == 'year':
            start_date = datetime(year, 1, 1).date()
            end_date = datetime(year, 12, 31).date()
        else:
            return Response({"error": "Invalid period type"}, status=status.HTTP_400_BAD_REQUEST)

        projects = Project.objects.all()
        # Фильтруем проекты по разрешениям пользователя
        projects = get_filtered_queryset(request.user, projects, 'PROJECT')
        report_data = []

        total_metrics = {
            'plan_units': 0, 'plan_money': 0, 'plan_revenue': 0,
            'fact_units': 0, 'fact_money': 0, 'fact_revenue': 0,
        }

        for project in projects:
            plan_qs = Plan.objects.filter(year=year, month__gte=start_date.month, month__lte=end_date.month,
                                          project=project)
            plan_data = plan_qs.aggregate(
                units=Sum('contracting_units_plan'), money=Sum('contracting_money_plan'),
                revenue=Sum('revenue_money_plan')
            )

            deals_qs = Deal.objects.filter(contract_date__range=[start_date, end_date],
                                           status=Deal.DealStatus.CLOSED_WON, property__building__project=project)
            # Фильтруем сделки по разрешениям
            deals_qs = get_filtered_queryset(request.user, deals_qs, 'DEAL')
            payments_qs = Payment.objects.filter(payment_date__range=[start_date, end_date],
                                                 status=Payment.PaymentStatus.PAID,
                                                 deal__property__building__project=project)
            # Фильтруем платежи по разрешениям
            payments_qs = get_filtered_queryset(request.user, payments_qs, 'PAYMENT')

            fact_units = deals_qs.count()
            fact_money = deals_qs.aggregate(Sum('contract_price'))['contract_price__sum'] or 0
            fact_revenue = payments_qs.aggregate(Sum('amount'))['amount__sum'] or 0

            # Accumulate totals
            total_metrics['plan_units'] += plan_data['units'] or 0
            total_metrics['plan_money'] += plan_data['money'] or 0
            total_metrics['plan_revenue'] += plan_data['revenue'] or 0
            total_metrics['fact_units'] += fact_units
            total_metrics['fact_money'] += fact_money
            total_metrics['fact_revenue'] += fact_revenue

            report_data.append({
                "project_id": project.id, "project_name": project.name,
                "contracting_units": calculate_metrics(plan_data['units'], fact_units, start_date, end_date),
                "contracting_money": calculate_metrics(plan_data['money'], fact_money, start_date, end_date),
                "revenue_money": calculate_metrics(plan_data['revenue'], fact_revenue, start_date, end_date),
            })

        report_data.append({
            "project_id": "total", "project_name": "Итого",
            "contracting_units": calculate_metrics(total_metrics['plan_units'], total_metrics['fact_units'], start_date,
                                                   end_date),
            "contracting_money": calculate_metrics(total_metrics['plan_money'], total_metrics['fact_money'], start_date,
                                                   end_date),
            "revenue_money": calculate_metrics(total_metrics['plan_revenue'], total_metrics['fact_revenue'], start_date,
                                               end_date),
        })

        return Response(report_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, PlanPermission])
def plan_template_download(request):
    projects = Project.objects.all().values('id', 'name')
    df_data = []
    for project in projects:
        df_data.append({
            'ID проекта': project['id'], 'Название проекта': project['name'], 'Год': datetime.now().year,
            'Месяц': None, 'План контрактации, шт': None, 'План контрактации, деньги': None,
            'План поступлений, деньги': None,
        })
    df = pd.DataFrame(df_data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Plan')
    output.seek(0)
    response = HttpResponse(output, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="plan_template.xlsx"'
    return response


class PlanUploadView(APIView):
    permission_classes = [IsAuthenticated, PlanPermission]
    parser_classes = [MultiPartParser]

    def post(self, request, format=None):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'Файл не найден'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            df = pd.read_excel(file_obj)
            df.rename(columns={
                'ID проекта': 'project_id', 'Год': 'year', 'Месяц': 'month',
                'План контрактации, шт': 'contracting_units_plan',
                'План контрактации, деньги': 'contracting_money_plan',
                'План поступлений, деньги': 'revenue_money_plan'
            }, inplace=True)

            for _, row in df.iterrows():
                if pd.isna(row['month']):
                    continue

                Plan.objects.update_or_create(
                    project_id=row['project_id'], year=int(row['year']), month=int(row['month']),
                    defaults={
                        'contracting_units_plan': int(row.get('contracting_units_plan', 0) or 0),
                        'contracting_money_plan': float(row.get('contracting_money_plan', 0) or 0),
                        'revenue_money_plan': float(row.get('revenue_money_plan', 0) or 0)
                    }
                )
            return Response({'status': 'План успешно загружен'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# --- Employee Report Views ---

class EmployeePlanFactReportView(APIView):
    permission_classes = [IsAuthenticated, ReportPermission]

    def get(self, request, *args, **kwargs):
        year = int(request.query_params.get('year', datetime.now().year))
        period_type = request.query_params.get('period_type', 'month')
        period_value = int(request.query_params.get('period_value', datetime.now().month))

        if period_type == 'month':
            start_date = datetime(year, period_value, 1).date()
            end_date = (start_date + timedelta(days=calendar.monthrange(year, period_value)[1] - 1))
        elif period_type == 'quarter':
            start_month = (period_value - 1) * 3 + 1
            end_month = start_month + 2
            start_date = datetime(year, start_month, 1).date()
            end_date = (datetime(year, end_month, 1) + timedelta(
                days=calendar.monthrange(year, end_month)[1] - 1)).date()
        elif period_type == 'half_year':
            start_month = 1 if period_value == 1 else 7
            end_month = 6 if period_value == 1 else 12
            start_date = datetime(year, start_month, 1).date()
            end_date = (datetime(year, end_month, 1) + timedelta(
                days=calendar.monthrange(year, end_month)[1] - 1)).date()
        elif period_type == 'year':
            start_date = datetime(year, 1, 1).date()
            end_date = datetime(year, 12, 31).date()
        else:
            return Response({"error": "Invalid period type"}, status=status.HTTP_400_BAD_REQUEST)

        employees = User.objects.filter(is_staff=True, is_active=True)
        report_data = []

        total_metrics = {
            'plan_units': 0, 'plan_money': 0, 'plan_revenue': 0,
            'fact_units': 0, 'fact_money': 0, 'fact_revenue': 0,
        }

        for emp in employees:
            plan_qs = EmployeePlan.objects.filter(year=year, month__gte=start_date.month, month__lte=end_date.month,
                                                  employee=emp)
            plan_data = plan_qs.aggregate(
                units=Sum('contracting_units_plan'), money=Sum('contracting_money_plan'),
                revenue=Sum('revenue_money_plan')
            )

            deals_qs = Deal.objects.filter(contract_date__range=[start_date, end_date],
                                           status=Deal.DealStatus.CLOSED_WON, created_by=emp)
            # Фильтруем сделки по разрешениям
            deals_qs = get_filtered_queryset(request.user, deals_qs, 'DEAL')
            payments_qs = Payment.objects.filter(payment_date__range=[start_date, end_date],
                                                 status=Payment.PaymentStatus.PAID, responsible_employee=emp)
            # Фильтруем платежи по разрешениям
            payments_qs = get_filtered_queryset(request.user, payments_qs, 'PAYMENT')

            fact_units = deals_qs.count()
            fact_money = deals_qs.aggregate(Sum('contract_price'))['contract_price__sum'] or 0
            fact_revenue = payments_qs.aggregate(Sum('amount'))['amount__sum'] or 0

            # Skip employee if they have no plan and no fact
            if not any([plan_data['units'], plan_data['money'], plan_data['revenue'], fact_units, fact_money,
                        fact_revenue]):
                continue

            # Accumulate totals
            total_metrics['plan_units'] += plan_data['units'] or 0
            total_metrics['plan_money'] += plan_data['money'] or 0
            total_metrics['plan_revenue'] += plan_data['revenue'] or 0
            total_metrics['fact_units'] += fact_units
            total_metrics['fact_money'] += fact_money
            total_metrics['fact_revenue'] += fact_revenue

            report_data.append({
                "employee_id": emp.id,
                "employee_name": f"{emp.first_name} {emp.last_name}".strip() or emp.username,
                "contracting_units": calculate_metrics(plan_data['units'], fact_units, start_date, end_date),
                "contracting_money": calculate_metrics(plan_data['money'], fact_money, start_date, end_date),
                "revenue_money": calculate_metrics(plan_data['revenue'], fact_revenue, start_date, end_date),
            })

        report_data.append({
            "employee_id": "total", "employee_name": "Итого",
            "contracting_units": calculate_metrics(total_metrics['plan_units'], total_metrics['fact_units'], start_date,
                                                   end_date),
            "contracting_money": calculate_metrics(total_metrics['plan_money'], total_metrics['fact_money'], start_date,
                                                   end_date),
            "revenue_money": calculate_metrics(total_metrics['plan_revenue'], total_metrics['fact_revenue'], start_date,
                                               end_date),
        })

        return Response(report_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, PlanPermission])
def employee_plan_template_download(request):
    employees = User.objects.filter(is_staff=True, is_active=True).values('id', 'first_name', 'last_name', 'username')
    df_data = []
    for emp in employees:
        full_name = f"{emp['first_name']} {emp['last_name']}".strip() or emp['username']
        df_data.append({
            'ID сотрудника': emp['id'], 'Сотрудник': full_name, 'Год': datetime.now().year,
            'Месяц': None, 'План контрактации, шт': None, 'План контрактации, деньги': None,
            'План поступлений, деньги': None,
        })
    df = pd.DataFrame(df_data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Employee Plan')
    output.seek(0)
    response = HttpResponse(output, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="employee_plan_template.xlsx"'
    return response


class EmployeePlanUploadView(APIView):
    permission_classes = [IsAuthenticated, PlanPermission]
    parser_classes = [MultiPartParser]

    def post(self, request, format=None):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'Файл не найден'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            df = pd.read_excel(file_obj)
            df.rename(columns={
                'ID сотрудника': 'employee_id', 'Год': 'year', 'Месяц': 'month',
                'План контрактации, шт': 'contracting_units_plan',
                'План контрактации, деньги': 'contracting_money_plan',
                'План поступлений, деньги': 'revenue_money_plan'
            }, inplace=True)

            for _, row in df.iterrows():
                if pd.isna(row['month']) or pd.isna(row['employee_id']):
                    continue

                EmployeePlan.objects.update_or_create(
                    employee_id=int(row['employee_id']),
                    year=int(row['year']),
                    month=int(row['month']),
                    defaults={
                        'contracting_units_plan': int(row.get('contracting_units_plan', 0) or 0),
                        'contracting_money_plan': float(row.get('contracting_money_plan', 0) or 0),
                        'revenue_money_plan': float(row.get('revenue_money_plan', 0) or 0)
                    }
                )
            return Response({'status': 'План по сотрудникам успешно загружен'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)