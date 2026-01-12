#!/usr/bin/env python
"""
Скрипт для сброса паролей всех пользователей
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User

NEW_PASSWORD = 'qweqweqwe'

print("="*80)
print("СБРОС ПАРОЛЕЙ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ")
print("="*80)

users = User.objects.all()
print(f"\nНайдено пользователей: {users.count()}")
print(f"Новый пароль: {NEW_PASSWORD}\n")

for user in users:
    user.set_password(NEW_PASSWORD)
    user.save()
    print(f"✅ {user.username} ({user.get_full_name() or 'без имени'}) - пароль изменён")

print("\n" + "="*80)
print(f"ГОТОВО! Пароли {users.count()} пользователей изменены на: {NEW_PASSWORD}")
print("="*80)
