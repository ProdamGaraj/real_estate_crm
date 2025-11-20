#!/usr/bin/env python
"""
Скрипт для проверки разрешений в системе
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission

print("📋 Список всех разрешений в системе:\n")

permissions = Permission.objects.all().order_by('resource', 'action')

current_resource = None
for perm in permissions:
    if perm.resource != current_resource:
        current_resource = perm.resource
        print(f"\n{perm.resource}:")
    print(f"  - {perm.action} (ID: {perm.id}, активно: {perm.is_active})")

print(f"\n\nВсего разрешений: {permissions.count()}")
