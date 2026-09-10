from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from apps.realty.models import Project

class Plan(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, verbose_name="Проект")
    year = models.IntegerField(verbose_name="Год")
    month = models.IntegerField(verbose_name="Месяц", validators=[MinValueValidator(1), MaxValueValidator(12)])
    contracting_units_plan = models.IntegerField(verbose_name="План по контрактации (штуки)", default=0)
    contracting_money_plan = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="План по контрактации (деньги)", default=0)
    revenue_money_plan = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="План по поступлениям (деньги)", default=0)

    class Meta:
        verbose_name = "План продаж (по проектам)"
        verbose_name_plural = "Планы продаж (по проектам)"
        unique_together = ('project', 'year', 'month')
        ordering = ['project', 'year', 'month']

    def __str__(self):
        return f"План для '{self.project.name}' на {self.month}/{self.year}"

class EmployeePlan(models.Model):
    employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, verbose_name="Сотрудник")
    year = models.IntegerField(verbose_name="Год")
    month = models.IntegerField(verbose_name="Месяц", validators=[MinValueValidator(1), MaxValueValidator(12)])
    contracting_units_plan = models.IntegerField(verbose_name="План по контрактации (штуки)", default=0)
    contracting_money_plan = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="План по контрактации (деньги)", default=0)
    revenue_money_plan = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="План по поступлениям (деньги)", default=0)

    class Meta:
        verbose_name = "План продаж (по сотрудникам)"
        verbose_name_plural = "Планы продаж (по сотрудникам)"
        unique_together = ('employee', 'year', 'month')
        ordering = ['employee', 'year', 'month']

    def __str__(self):
        return f"План для '{self.employee.username}' на {self.month}/{self.year}"