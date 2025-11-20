#!/usr/bin/env python
"""
Скрипт для добавления разрешений для встреч (MEETING)
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role

print("="*80)
print("ДОБАВЛЕНИЕ РАЗРЕШЕНИЙ ДЛЯ ВСТРЕЧ (MEETING)")
print("="*80)

# Создаем разрешения для встреч
meeting_permissions_data = [
    ('VIEW', 'MEETING', 'SYSTEM'),
    ('VIEW', 'MEETING', 'COMPANY'),
    ('VIEW', 'MEETING', 'DEPARTMENT'),
    ('VIEW', 'MEETING', 'OWN'),
    ('ADD', 'MEETING', 'COMPANY'),
    ('EDIT', 'MEETING', 'OWN'),
    ('DELETE', 'MEETING', 'OWN'),
]

print("\n📋 Создание разрешений для MEETING...")
created_count = 0

for action, resource, scope in meeting_permissions_data:
    perm, created = Permission.objects.get_or_create(
        action=action,
        resource=resource,
        scope=scope,
        defaults={
            'code': f'{action}_{resource}_{scope}',
            'name': f'{Permission.Action(action).label} {Permission.Resource(resource).label} ({Permission.Scope(scope).label})',
            'is_active': True
        }
    )
    
    if created:
        print(f"  ✅ Создано: {perm.code}")
        created_count += 1
    else:
        print(f"  ℹ️  Уже существует: {perm.code}")

print(f"\n✅ Создано новых разрешений: {created_count}")

# Обновляем роль менеджера
print("\n" + "="*80)
print("ОБНОВЛЕНИЕ РОЛЕЙ")
print("="*80)

try:
    role_manager = Role.objects.get(code='SALES_MANAGER')
    
    # Добавляем разрешения на встречи для менеджеров
    meeting_manager_perms = Permission.objects.filter(
        code__in=[
            'VIEW_MEETING_COMPANY',
            'ADD_MEETING_COMPANY',
            'EDIT_MEETING_OWN',
        ]
    )
    
    # Получаем текущие разрешения
    current_perms = set(role_manager.permissions.all())
    new_perms = set(meeting_manager_perms)
    
    # Объединяем
    all_perms = current_perms | new_perms
    role_manager.permissions.set(all_perms)
    
    print(f"\n✅ Роль '{role_manager.name}' обновлена")
    print(f"   Всего разрешений: {role_manager.permissions.count()}")
    print(f"   Добавлено разрешений на встречи: {len(new_perms)}")
    
except Role.DoesNotExist:
    print("❌ Роль SALES_MANAGER не найдена!")

# Обновляем роль руководителя
try:
    role_head = Role.objects.get(code='DEPARTMENT_HEAD')
    
    # Добавляем разрешения на просмотр встреч для руководителей
    meeting_head_perms = Permission.objects.filter(
        code__in=[
            'VIEW_MEETING_DEPARTMENT',
        ]
    )
    
    current_perms = set(role_head.permissions.all())
    new_perms = set(meeting_head_perms)
    all_perms = current_perms | new_perms
    role_head.permissions.set(all_perms)
    
    print(f"\n✅ Роль '{role_head.name}' обновлена")
    print(f"   Всего разрешений: {role_head.permissions.count()}")
    print(f"   Добавлено разрешений на встречи: {len(new_perms)}")
    
except Role.DoesNotExist:
    print("❌ Роль DEPARTMENT_HEAD не найдена!")

# Обновляем роль администратора (всегда имеет все разрешения)
try:
    role_admin = Role.objects.get(code='ADMIN')
    role_admin.permissions.set(Permission.objects.all())
    
    print(f"\n✅ Роль '{role_admin.name}' обновлена")
    print(f"   Всего разрешений: {role_admin.permissions.count()}")
    
except Role.DoesNotExist:
    print("❌ Роль ADMIN не найдена!")

print("\n" + "="*80)
print("ПРОВЕРКА")
print("="*80)

# Проверяем разрешения менеджера
from django.contrib.auth.models import User

try:
    user = User.objects.get(username='manager3')
    profile = user.profile
    
    print(f"\n👤 Пользователь: {user.get_full_name()} (manager3)")
    
    # Проверяем разрешения
    can_view = profile.has_permission_for_action('VIEW', 'MEETING', 'COMPANY')
    can_add = profile.has_permission_for_action('ADD', 'MEETING', 'COMPANY')
    can_edit = profile.has_permission_for_action('EDIT', 'MEETING', 'OWN')
    
    print(f"\n📋 Разрешения на встречи:")
    print(f"  • VIEW MEETING (COMPANY): {'✅' if can_view else '❌'}")
    print(f"  • ADD MEETING (COMPANY): {'✅' if can_add else '❌'}")
    print(f"  • EDIT MEETING (OWN): {'✅' if can_edit else '❌'}")
    
    if can_view and can_add and can_edit:
        print(f"\n✅ УСПЕХ! Пользователь manager3 теперь имеет доступ к встречам!")
    else:
        print(f"\n⚠️  ВНИМАНИЕ! Некоторые разрешения все еще отсутствуют!")
        
except User.DoesNotExist:
    print("❌ Пользователь manager3 не найден!")

print("\n" + "="*80)
print("ГОТОВО!")
print("="*80)
print("""
✅ Разрешения для встреч добавлены и назначены ролям.

Теперь:
1. Обновите страницу в браузере
2. Попробуйте зайти на /meetings под пользователем manager3
3. Страница должна открыться без ошибки 403
""")
