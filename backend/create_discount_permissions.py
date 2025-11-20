#!/usr/bin/env python
"""
Скрипт для создания недостающих разрешений для DISCOUNT
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role

print("🔧 Создание разрешений для ресурса DISCOUNT...\n")

# Определяем разрешения для скидок
discount_permissions = [
    {'resource': 'DISCOUNT', 'action': 'VIEW', 'description': 'Просмотр скидок'},
    {'resource': 'DISCOUNT', 'action': 'ADD', 'description': 'Создание скидок'},
    {'resource': 'DISCOUNT', 'action': 'EDIT', 'description': 'Редактирование скидок'},
    {'resource': 'DISCOUNT', 'action': 'DELETE', 'description': 'Удаление скидок'},
]

created_permissions = []

for perm_data in discount_permissions:
    perm, created = Permission.objects.get_or_create(
        resource=perm_data['resource'],
        action=perm_data['action'],
        defaults={
            'description': perm_data['description'],
            'is_active': True,
        }
    )
    
    if created:
        print(f"✅ Создано разрешение: {perm.resource} - {perm.action}")
        created_permissions.append(perm)
    else:
        print(f"⚠️  Разрешение уже существует: {perm.resource} - {perm.action}")

print(f"\n📊 Создано новых разрешений: {len(created_permissions)}")

# Теперь добавим VIEW разрешение для менеджеров
if created_permissions:
    print("\n🔧 Добавление разрешения VIEW для роли SALES_MANAGER...")
    
    try:
        discount_view = Permission.objects.get(resource='DISCOUNT', action='VIEW')
        sales_manager_role = Role.objects.get(code='SALES_MANAGER')
        
        if discount_view not in sales_manager_role.permissions.all():
            sales_manager_role.permissions.add(discount_view)
            print(f"✅ Добавлено разрешение DISCOUNT VIEW для роли {sales_manager_role.name}")
        else:
            print(f"⚠️  Разрешение DISCOUNT VIEW уже есть у роли {sales_manager_role.name}")
            
        # Показываем количество пользователей с этой ролью
        users_count = sales_manager_role.user_profiles.count()
        print(f"\n👥 Пользователей с ролью '{sales_manager_role.name}': {users_count}")
        if users_count > 0:
            print("   Пользователи:")
            for profile in sales_manager_role.user_profiles.all():
                print(f"   - {profile.user.username} ({profile.user.get_full_name()})")
                
    except Role.DoesNotExist:
        print("❌ Роль SALES_MANAGER не найдена!")

print("\n✅ Готово!")
