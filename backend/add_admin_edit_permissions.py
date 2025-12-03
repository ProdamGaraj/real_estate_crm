"""
Скрипт для добавления админу разрешений на редактирование задач в любом статусе
"""
import os
import sys
import django

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role

def add_admin_edit_permissions():
    """Добавить админу разрешения EDIT_IN_PROGRESS для всех областей"""
    
    # Выводим все доступные роли
    all_roles = Role.objects.all()
    print(f"Доступные роли: {[r.code for r in all_roles]}")
    
    # Ищем роль системного администратора
    admin_role = None
    for role in all_roles:
        if 'admin' in role.code.lower() or 'администратор' in role.name.lower():
            admin_role = role
            break
    
    if not admin_role:
        print("❌ Роль администратора не найдена!")
        return
    
    print(f"Найдена роль: {admin_role.name} ({admin_role.code})")
    
    # Получаем разрешения EDIT_IN_PROGRESS для задач
    edit_permissions = Permission.objects.filter(
        resource='TASK',
        action='EDIT_IN_PROGRESS'
    )
    
    print(f"\nНайдено разрешений EDIT_IN_PROGRESS: {edit_permissions.count()}")
    
    added_count = 0
    for perm in edit_permissions:
        if not admin_role.permissions.filter(id=perm.id).exists():
            admin_role.permissions.add(perm)
            print(f"✅ Добавлено: {perm.code} - {perm.name}")
            added_count += 1
        else:
            print(f"⏭️  Уже есть: {perm.code}")
    
    print(f"\n{'='*60}")
    print(f"Добавлено новых разрешений: {added_count}")
    print(f"Всего разрешений у роли {admin_role.name}: {admin_role.permissions.count()}")
    print(f"{'='*60}")

if __name__ == '__main__':
    add_admin_edit_permissions()
