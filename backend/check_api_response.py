#!/usr/bin/env python
"""
Проверка, что возвращает API для профилей пользователей
"""
import os
import sys
import django
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import UserProfile
from permissions.serializers import UserProfileListSerializer

print("=== ПРОВЕРКА API RESPONSE ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ===\n")

# Получаем всех пользователей
profiles = UserProfile.objects.all()[:3]  # Берём первых 3 для примера

for profile in profiles:
    print(f"\n👤 {profile.user.username}:")
    print(f"   Роли в БД: {list(profile.roles.values_list('name', flat=True))}")
    
    # Сериализуем как API
    serializer = UserProfileListSerializer(profile)
    data = serializer.data
    
    print(f"   API ответ - roles_names: {data.get('roles_names', [])}")
    print(f"   API ответ - roles: {data.get('roles', 'НЕТ ПОЛЯ')}")
    
    # Полный JSON
    print(f"\n   Полный JSON:")
    print(f"   {json.dumps(data, indent=2, ensure_ascii=False)}")
