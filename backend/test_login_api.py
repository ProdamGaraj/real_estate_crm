#!/usr/bin/env python
"""
Тест API логина для manager3
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User
from permissions.serializers import UserProfileListSerializer
import json

print("="*80)
print("ТЕСТ API ЛОГИНА ДЛЯ MANAGER3")
print("="*80)

user = User.objects.get(username='manager3')
profile = user.profile

# Симулируем ответ API при логине
serializer = UserProfileListSerializer(profile)
data = serializer.data

print(f"\n👤 Пользователь: {user.get_full_name()}")
print(f"📍 Компания: {data.get('company_name')}")
print(f"📍 Роли: {data.get('roles_names')}")

print(f"\n📋 Структура данных roles[0]:")
if data.get('roles'):
    role = data['roles'][0]
    print(f"   id: {role.get('id')}")
    print(f"   name: {role.get('name')}")
    print(f"   code: {role.get('code')}")
    print(f"   permissions (всего): {len(role.get('permissions', []))}")
    
    print(f"\n📋 Разрешения роли:")
    for perm in role.get('permissions', [])[:5]:  # Первые 5
        print(f"   • {perm['code']} ({perm['action']} {perm['resource']})")
    
    if len(role.get('permissions', [])) > 5:
        print(f"   ... и ещё {len(role.get('permissions', [])) - 5}")

print("\n" + "="*80)
print("ПРОВЕРКА hasPermission НА ФРОНТЕНДЕ")
print("="*80)

# Симулируем работу hasPermission
roles = data.get('roles', [])

resources_to_check = ['CLIENT', 'APPLICATION', 'MEETING', 'DEAL', 'PROJECT', 'PROPERTY', 'PAYMENT', 'DISCOUNT']

print("\nРезультаты hasAnyViewPermission:")
for resource in resources_to_check:
    # Проверяем наличие VIEW разрешения
    has_view = False
    for role in roles:
        for perm in role.get('permissions', []):
            if perm['action'] == 'VIEW' and perm['resource'] == resource:
                has_view = True
                break
        if has_view:
            break
    
    print(f"   {resource}: {'✅' if has_view else '❌'}")

print("\n" + "="*80)
print("ПУНКТЫ МЕНЮ, КОТОРЫЕ ДОЛЖНЫ БЫТЬ ВИДНЫ")
print("="*80)

menu_items = [
    ('Дашборд', None),
    ('Клиенты', 'CLIENT'),
    ('Заявки', 'APPLICATION'),
    ('Встречи', 'MEETING'),
    ('Сделки', 'DEAL'),
    ('Проекты', 'PROJECT'),
    ('Финансы', 'PAYMENT'),
    ('Отчеты', None),
    ('Скидки', 'DISCOUNT'),
    ('Настройки', 'ADMIN'),
]

print("\nДоступные пункты меню:")
for label, resource in menu_items:
    if resource == 'ADMIN':
        # Настройки только для админа
        visible = data.get('is_system_admin', False)
    elif resource is None:
        # Всегда доступны
        visible = True
    else:
        # Проверяем VIEW разрешение
        visible = False
        for role in roles:
            for perm in role.get('permissions', []):
                if perm['action'] == 'VIEW' and perm['resource'] == resource:
                    visible = True
                    break
            if visible:
                break
    
    print(f"   {label}: {'✅ ВИДИМ' if visible else '❌ СКРЫТ'}")

print("\n" + "="*80)
