#!/usr/bin/env python
"""
Скрипт для добавления разрешений на просмотр скидок для менеджеров
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Role, Permission

print("🔧 Добавление разрешений на скидки для менеджеров...\n")

# Получаем разрешение на просмотр скидок
try:
    discount_view_perm = Permission.objects.get(resource='DISCOUNT', action='VIEW')
    print(f"✅ Найдено разрешение: {discount_view_perm}")
except Permission.DoesNotExist:
    print("❌ Разрешение DISCOUNT VIEW не найдено!")
    sys.exit(1)

# Получаем роль SALES_MANAGER
try:
    sales_manager_role = Role.objects.get(code='SALES_MANAGER')
    print(f"✅ Найдена роль: {sales_manager_role.name}")
except Role.DoesNotExist:
    print("❌ Роль SALES_MANAGER не найдена!")
    sys.exit(1)

# Проверяем текущие разрешения роли
current_perms = sales_manager_role.permissions.all()
print(f"\n📋 Текущие разрешения роли '{sales_manager_role.name}':")
for perm in current_perms:
    print(f"   - {perm.resource} : {perm.action}")

# Добавляем разрешение на просмотр скидок, если его нет
if discount_view_perm in current_perms:
    print(f"\n⚠️  Разрешение DISCOUNT VIEW уже есть у роли {sales_manager_role.name}")
else:
    sales_manager_role.permissions.add(discount_view_perm)
    print(f"\n✅ Добавлено разрешение DISCOUNT VIEW для роли {sales_manager_role.name}")

# Выводим обновленные разрешения
updated_perms = sales_manager_role.permissions.all()
print(f"\n📋 Обновленные разрешения роли '{sales_manager_role.name}':")
for perm in updated_perms:
    print(f"   - {perm.resource} : {perm.action}")

# Показываем количество пользователей с этой ролью
users_count = sales_manager_role.user_profiles.count()
print(f"\n👥 Пользователей с ролью '{sales_manager_role.name}': {users_count}")
if users_count > 0:
    print("   Пользователи:")
    for profile in sales_manager_role.user_profiles.all():
        print(f"   - {profile.user.username} ({profile.user.get_full_name()})")

print("\n✅ Готово!")
