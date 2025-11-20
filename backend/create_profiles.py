#!/usr/bin/env python
"""
Скрипт для создания профилей для существующих пользователей
"""
import os
import sys
import django

# Настраиваем Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth import get_user_model
from permissions.models import UserProfile

User = get_user_model()

# Создаем профили для всех пользователей без профилей
users_without_profile = User.objects.filter(profile__isnull=True)

for user in users_without_profile:
    profile = UserProfile.objects.create(
        user=user,
        is_system_admin=user.is_superuser,
        is_active=user.is_active
    )
    print(f"✅ Создан профиль для пользователя: {user.username}")

if not users_without_profile.exists():
    print("ℹ️  Все пользователи уже имеют профили")

print(f"\nВсего пользователей: {User.objects.count()}")
print(f"Пользователей с профилями: {UserProfile.objects.count()}")
