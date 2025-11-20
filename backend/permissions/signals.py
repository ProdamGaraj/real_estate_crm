"""
Сигналы для автоматического создания профилей пользователей
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import UserProfile

User = get_user_model()


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """
    Автоматически создает профиль для нового пользователя
    """
    if created:
        UserProfile.objects.create(
            user=instance,
            is_system_admin=instance.is_superuser
        )


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """
    Сохраняет профиль при сохранении пользователя
    """
    if hasattr(instance, 'profile'):
        # Обновляем is_system_admin при изменении is_superuser
        if instance.profile.is_system_admin != instance.is_superuser:
            instance.profile.is_system_admin = instance.is_superuser
            instance.profile.save()
