#!/usr/bin/env python
"""
Проверка разрешений для встреч (MEETING)
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role, UserProfile
from django.contrib.auth.models import User

print("="*80)
print("ПРОВЕРКА РАЗРЕШЕНИЙ ДЛЯ ВСТРЕЧ (MEETING)")
print("="*80)

# Проверяем, есть ли разрешения для MEETING
meeting_permissions = Permission.objects.filter(resource='MEETING')

print(f"\n📋 Разрешения для MEETING: {meeting_permissions.count()}")
if meeting_permissions.exists():
    for perm in meeting_permissions:
        print(f"  • {perm.code}: {perm.name}")
        print(f"    Action: {perm.get_action_display()}, Scope: {perm.get_scope_display()}")
else:
    print("  ❌ НЕТ РАЗРЕШЕНИЙ ДЛЯ MEETING!")

# Проверяем роль менеджера
print("\n" + "="*80)
print("РАЗРЕШЕНИЯ РОЛИ 'Менеджер по продажам'")
print("="*80)

try:
    manager_role = Role.objects.get(code='SALES_MANAGER')
    all_perms = manager_role.permissions.all()
    
    print(f"\nВсего разрешений: {all_perms.count()}")
    
    # Группируем по ресурсам
    resources = {}
    for perm in all_perms:
        resource = perm.resource
        if resource not in resources:
            resources[resource] = []
        resources[resource].append(f"{perm.get_action_display()} ({perm.get_scope_display()})")
    
    for resource, actions in sorted(resources.items()):
        print(f"\n{resource}:")
        for action in actions:
            print(f"  • {action}")
    
    # Проверяем конкретно MEETING
    meeting_perms = all_perms.filter(resource='MEETING')
    print(f"\n🎯 Разрешения для MEETING: {meeting_perms.count()}")
    if not meeting_perms.exists():
        print("  ❌ У менеджеров НЕТ разрешений на встречи!")
        
except Role.DoesNotExist:
    print("❌ Роль SALES_MANAGER не найдена!")

# Проверяем конкретного пользователя manager3
print("\n" + "="*80)
print("ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ manager3")
print("="*80)

try:
    user = User.objects.get(username='manager3')
    profile = user.profile
    
    print(f"\nПользователь: {user.get_full_name()}")
    print(f"Роли: {', '.join([r.name for r in profile.roles.all()])}")
    
    # Все разрешения пользователя
    all_user_perms = profile.get_all_permissions()
    print(f"\nВсего разрешений: {all_user_perms.count()}")
    
    # Разрешения на MEETING
    meeting_user_perms = all_user_perms.filter(resource='MEETING')
    print(f"\nРазрешения на MEETING: {meeting_user_perms.count()}")
    
    if meeting_user_perms.exists():
        for perm in meeting_user_perms:
            print(f"  • {perm.code}: {perm.name}")
    else:
        print("  ❌ У manager3 НЕТ разрешений на встречи!")
    
    # Проверяем конкретные разрешения
    print("\n📋 Проверка конкретных разрешений:")
    can_view = profile.has_permission_for_action('VIEW', 'MEETING', 'COMPANY')
    can_add = profile.has_permission_for_action('ADD', 'MEETING', 'COMPANY')
    can_edit = profile.has_permission_for_action('EDIT', 'MEETING', 'OWN')
    
    print(f"  • VIEW MEETING (COMPANY): {'✅' if can_view else '❌'}")
    print(f"  • ADD MEETING (COMPANY): {'✅' if can_add else '❌'}")
    print(f"  • EDIT MEETING (OWN): {'✅' if can_edit else '❌'}")
    
except User.DoesNotExist:
    print("❌ Пользователь manager3 не найден!")

print("\n" + "="*80)
print("ВЫВОД")
print("="*80)

if not meeting_permissions.exists():
    print("""
❌ ПРОБЛЕМА: В базе данных НЕТ разрешений для MEETING!

Решение:
1. Необходимо создать разрешения для встреч
2. Добавить эти разрешения к роли "Менеджер по продажам"
3. Обновить скрипт create_test_data.py для создания этих разрешений
""")
else:
    print("""
✅ Разрешения для MEETING существуют, но проверьте:
1. Назначены ли они роли менеджера?
2. Есть ли у пользователя эта роль?
""")
