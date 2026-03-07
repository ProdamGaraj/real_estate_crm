from django.db import models
from django.conf import settings
from django.core.validators import FileExtensionValidator
from apps.realty.models import Project, Building

class Template(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название шаблона")
    file = models.FileField(
        upload_to='templates/',
        verbose_name="Файл шаблона (.docx)",
        validators=[FileExtensionValidator(allowed_extensions=['docx'])],
    )
    applies_to_projects = models.ManyToManyField(Project, blank=True, verbose_name="Применять для проектов")
    applies_to_buildings = models.ManyToManyField(Building, blank=True, verbose_name="Применять для домов")
    applies_to_property_types = models.JSONField(default=list, blank=True, verbose_name="Применять для типов недвижимости")
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.CASCADE,
        related_name='templates',
        verbose_name="Компания",
        null=True,
        blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='created_templates',
        verbose_name="Кем создан",
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Шаблон документа"
        verbose_name_plural = "Шаблоны документов"
        ordering = ['-created_at']

    def __str__(self):
        return self.name