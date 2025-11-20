#!/usr/bin/env python
"""
Скрипт для проверки назначенных ролей пользователям
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import UserProfile, Role
from django.contrib.auth.models import User

print("=== ПРОВЕРКА РОЛЕЙ ПОЛЬЗОВАТЕЛЕЙ ===\n")

# Все пользователи
users = User.objects.all().order_by('id')
print(f"Всего пользователей: {users.count()}\n")

for user in users:
    try:
        profile = user.profile
        roles = profile.roles.all()
        print(f"👤 {user.username} ({user.get_full_name()}):")
        print(f"   Компания: {profile.company.name if profile.company else 'Нет'}")
        print(f"   Отдел: {profile.department.name if profile.department else 'Нет'}")
        print(f"   Должность: {profile.position or 'Не указана'}")
        print(f"   Системный админ: {'Да' if profile.is_system_admin else 'Нет'}")
        print(f"   Роли ({roles.count()}): {', '.join([r.name for r in roles]) or 'НЕТ РОЛЕЙ!'}")
        print()
    except UserProfile.DoesNotExist:
        print(f"👤 {user.username}: НЕТ ПРОФИЛЯ!")
        print()

print("\n=== СТАТИСТИКА ПО РОЛЯМ ===\n")
for role in Role.objects.all():
    users_count = role.user_profiles.count()
    print(f"🎭 {role.name}:")
    print(f"   Область: {role.get_scope_display()}")
    print(f"   Категория: {role.get_category_display()}")
    print(f"   Пользователей с этой ролью: {users_count}")
    if users_count > 0:
        print(f"   Пользователи: {', '.join([p.user.username for p in role.user_profiles.all()])}")
    print()
