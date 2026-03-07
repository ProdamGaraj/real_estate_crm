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
    Синхронизирует is_system_admin при изменении is_superuser.
    Не трогает профиль при нерелевантных сохранениях (например, last_login).
    Не сбрасывает is_system_admin у не-superuser админов.
    """
    if not hasattr(instance, 'profile'):
        return

    # Если update_fields задан и is_superuser не в нём — не трогам
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and 'is_superuser' not in update_fields:
        return

    # Если superuser стал True — всегда синхронизируем
    if instance.is_superuser and not instance.profile.is_system_admin:
        instance.profile.is_system_admin = True
        instance.profile.save(update_fields=['is_system_admin'])
    # Если superuser отозван — синхронизируем is_system_admin
    elif not instance.is_superuser and instance.profile.is_system_admin:
        instance.profile.is_system_admin = False
        instance.profile.save(update_fields=['is_system_admin'])
