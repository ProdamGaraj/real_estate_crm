from django.apps import AppConfig


class PermissionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'permissions'
    verbose_name = 'Система разрешений и ролей'
    
    def ready(self):
        """
        Инициализация при запуске приложения
        """
        # Импортируем сигналы для автоматического создания профилей
        import permissions.signals
