import os
import sys
import django

# Настройка окружения Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Role, Permission

def setup_permissions():
    print("🚀 Начинаем настройку разрешений для фото...")

    # 1. Найти роль Админа
    # Ищем стандартные коды ролей администратора
    admin_role = Role.objects.filter(code__in=['ADMIN', 'SYSTEM_ADMIN', 'HEAD_OF_SALES']).first()
    
    if not admin_role:
        print("⚠️ Роль 'ADMIN' или 'SYSTEM_ADMIN' не найдена.")
        # Попробуем найти любую административную роль
        admin_role = Role.objects.filter(category=Role.RoleCategory.ADMINISTRATIVE).first()
        
    if not admin_role:
        print("⚠️ Административная роль не найдена. Создаем роль 'ADMIN'.")
        admin_role = Role.objects.create(
            name='Администратор',
            code='ADMIN',
            category=Role.RoleCategory.ADMINISTRATIVE,
            scope=Role.RoleScope.SYSTEM,
            description='Системный администратор (создано автоматически)'
        )
    
    print(f"✅ Выбрана роль для обновления: {admin_role.name} (Код: {admin_role.code})")

    # 2. Определяем необходимые разрешения
    # Нам нужны права на EDIT и DELETE для LAYOUT и BUILDING
    # Scope берем SYSTEM, чтобы админ мог управлять всем
    
    needed_perms_specs = [
        # Action, Resource, Scope
        ('EDIT', 'LAYOUT', 'SYSTEM'),
        ('DELETE', 'LAYOUT', 'SYSTEM'),
        ('EDIT', 'BUILDING', 'SYSTEM'),
        ('DELETE', 'BUILDING', 'SYSTEM'),
        # Добавим также PROPERY на всякий случай, если фото объектов появятся
        ('EDIT', 'PROPERTY', 'SYSTEM'),
        ('DELETE', 'PROPERTY', 'SYSTEM'),
    ]

    for action, resource, scope in needed_perms_specs:
        # Создаем или получаем разрешение
        # Permission save() метод сам сгенерирует код: ACTION_RESOURCE_SCOPE
        
        # Проверим, существует ли разрешение с такими параметрами
        # Примечание: get_or_create может не сработать идеально если имя автогенерится, 
        # поэтому лучше искать по полям.
        
        perm, created = Permission.objects.get_or_create(
            action=action,
            resource=resource,
            scope=scope,
            defaults={
                'name': f'{action} {resource} ({scope})',
                'description': f'Разрешение на {action} для {resource} с уровнем доступа {scope}'
            }
        )
        
        status = "Создано" if created else "Существует"
        print(f"   🔹 Разрешение {perm.code}: {status}")

        # Добавляем разрешение роли, если его нет
        if not admin_role.permissions.filter(id=perm.id).exists():
            admin_role.permissions.add(perm)
            print(f"      ➕ Добавлено роли {admin_role.code}")
        else:
            print(f"      ✓ У роли уже есть")

    print(f"\n✅ Настройка завершена! Роль {admin_role.code} обновлена.")

if __name__ == '__main__':
    setup_permissions()
