"""
Модели для системы управления задачами
Интегрировано с системой разрешений через Company и Department
"""
from django.db import models
from django.conf import settings
from django.utils import timezone


class Task(models.Model):
    """
    Задача - основная модель таск-трекера
    """
    
    class TaskStatus(models.TextChoices):
        NEW = 'NEW', 'Новая'
        IN_PROGRESS = 'IN_PROGRESS', 'В работе'
        REVIEW = 'REVIEW', 'На проверке'
        COMPLETED = 'COMPLETED', 'Завершена'
        CANCELLED = 'CANCELLED', 'Отменена'
        BLOCKED = 'BLOCKED', 'Заблокирована'
    
    class TaskPriority(models.TextChoices):
        LOW = 'LOW', 'Низкий'
        NORMAL = 'NORMAL', 'Обычный'
        HIGH = 'HIGH', 'Высокий'
        URGENT = 'URGENT', 'Срочный'
    
    # Основная информация
    title = models.CharField(
        max_length=255,
        verbose_name="Название задачи"
    )
    description = models.TextField(
        verbose_name="Описание задачи"
    )
    status = models.CharField(
        max_length=20,
        choices=TaskStatus.choices,
        default=TaskStatus.NEW,
        verbose_name="Статус"
    )
    priority = models.CharField(
        max_length=10,
        choices=TaskPriority.choices,
        default=TaskPriority.NORMAL,
        verbose_name="Приоритет"
    )
    
    # Участники задачи
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_tasks',
        verbose_name="Постановщик"
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='assigned_tasks',
        verbose_name="Исполнитель"
    )
    watchers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='watched_tasks',
        verbose_name="Наблюдатели"
    )
    
    # Временные рамки
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Время начала работы"
    )
    deadline = models.DateTimeField(
        verbose_name="Дедлайн"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Дата фактического закрытия"
    )
    completed_with_delay = models.BooleanField(
        default=False,
        verbose_name="Завершена с просрочкой"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Последнее обновление"
    )
    
    # Организационная привязка (для фильтрации по разрешениям)
    company = models.ForeignKey(
        'permissions.Company',
        on_delete=models.PROTECT,
        related_name='tasks',
        verbose_name="Компания"
    )
    department = models.ForeignKey(
        'permissions.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tasks',
        verbose_name="Отдел"
    )
    
    # Дополнительные поля
    estimated_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Оценка времени (часов)"
    )
    actual_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Фактическое время (часов)"
    )
    tags = models.CharField(
        max_length=255,
        blank=True,
        verbose_name="Теги (через запятую)"
    )
    
    # Родительская задача (для подзадач)
    parent_task = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='subtasks',
        verbose_name="Родительская задача"
    )

    class Meta:
        verbose_name = "Задача"
        verbose_name_plural = "Задачи"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'assignee']),
            models.Index(fields=['deadline']),
            models.Index(fields=['company', 'department']),
            models.Index(fields=['creator', 'created_at']),
        ]

    def __str__(self):
        return f"#{self.id} - {self.title}"

    @property
    def is_overdue(self):
        """Проверка просроченности задачи"""
        if self.status in [self.TaskStatus.COMPLETED, self.TaskStatus.CANCELLED]:
            return False
        return timezone.now() > self.deadline

    @property
    def time_spent(self):
        """Фактически затраченное время"""
        return self.actual_hours or 0

    def save(self, *args, **kwargs):
        """
        Автоматическая установка времени начала и завершения
        """
        # Устанавливаем время начала при переходе в IN_PROGRESS
        if self.status == self.TaskStatus.IN_PROGRESS and not self.started_at:
            self.started_at = timezone.now()
        
        # Устанавливаем время завершения при переходе в COMPLETED
        if self.status == self.TaskStatus.COMPLETED and not self.completed_at:
            self.completed_at = timezone.now()
        
        super().save(*args, **kwargs)


class TaskComment(models.Model):
    """
    Комментарий к задаче
    """
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name="Задача"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="Автор комментария"
    )
    text = models.TextField(
        verbose_name="Текст комментария"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Дата изменения"
    )
    attachment = models.FileField(
        upload_to='tasks/comments/',
        null=True,
        blank=True,
        verbose_name="Вложение"
    )

    class Meta:
        verbose_name = "Комментарий к задаче"
        verbose_name_plural = "Комментарии к задачам"
        ordering = ['created_at']

    def __str__(self):
        return f"Комментарий к задаче #{self.task.id} от {self.user.get_full_name() or self.user.username}"


class TaskLog(models.Model):
    """
    История изменений задачи для аудита
    """
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name='logs',
        verbose_name="Задача"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Пользователь"
    )
    action = models.TextField(
        verbose_name="Действие"
    )
    old_value = models.JSONField(
        null=True,
        blank=True,
        verbose_name="Старое значение"
    )
    new_value = models.JSONField(
        null=True,
        blank=True,
        verbose_name="Новое значение"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )

    class Meta:
        verbose_name = "Лог задачи"
        verbose_name_plural = "Логи задач"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['task', 'created_at']),
        ]

    def __str__(self):
        return f"Лог для задачи #{self.task.id} - {self.action}"
