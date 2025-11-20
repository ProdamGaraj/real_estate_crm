#!/usr/bin/env python
"""
Скрипт для исправления ролей и профилей пользователей
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Company, Department, Role, UserProfile
from django.contrib.auth.models import User

print("🔧 Исправление ролей и профилей пользователей...\n")

# ==================== 1. ИСПРАВЛЯЕМ РОЛИ ====================
print("🎭 Обновление параметров ролей...")

roles_update = {
    'ADMIN': {
        'scope': Role.RoleScope.SYSTEM,
        'category': Role.RoleCategory.ADMINISTRATIVE,
        'is_system': True,
    },
    'SALES_MANAGER': {
        'scope': Role.RoleScope.COMPANY,
        'category': Role.RoleCategory.OPERATIONAL,
    },
    'DEPARTMENT_HEAD': {
        'scope': Role.RoleScope.DEPARTMENT,
        'category': Role.RoleCategory.MANAGEMENT,
    },
    'ANALYST': {
        'scope': Role.RoleScope.COMPANY,
        'category': Role.RoleCategory.READONLY,
    },
}

for code, updates in roles_update.items():
    try:
        role = Role.objects.get(code=code)
        for field, value in updates.items():
            setattr(role, field, value)
        role.save()
        print(f"✅ Обновлена роль '{role.name}': scope={role.get_scope_display()}, category={role.get_category_display()}")
    except Role.DoesNotExist:
        print(f"⚠️  Роль '{code}' не найдена")

print()

# ==================== 2. ИСПРАВЛЯЕМ ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ ====================
print("👥 Обновление профилей пользователей...")

# Получаем компании и отделы
company1 = Company.objects.get(code="REALESTATE")
dept_sales = Department.objects.get(company=company1, code="SALES")
dept_vip = Department.objects.get(company=company1, code="VIP")
dept_marketing = Department.objects.get(company=company1, code="MARKETING")

# Обновляем профили
users_update = {
    'director': {
        'position': 'Директор',
        'company': company1,
        'department': None,
    },
    'head_sales': {
        'position': 'Руководитель отдела продаж',
        'company': company1,
        'department': dept_sales,
    },
    'head_vip': {
        'position': 'Руководитель VIP отдела',
        'company': company1,
        'department': dept_vip,
    },
    'manager1': {
        'position': 'Менеджер по продажам',
        'company': company1,
        'department': dept_sales,
    },
    'manager2': {
        'position': 'Менеджер по продажам',
        'company': company1,
        'department': dept_sales,
    },
    'manager3': {
        'position': 'Менеджер по продажам',
        'company': company1,
        'department': dept_sales,
    },
    'vip_manager1': {
        'position': 'VIP менеджер',
        'company': company1,
        'department': dept_vip,
    },
    'vip_manager2': {
        'position': 'VIP менеджер',
        'company': company1,
        'department': dept_vip,
    },
    'analyst1': {
        'position': 'Аналитик',
        'company': company1,
        'department': dept_marketing,
    },
}

for username, updates in users_update.items():
    try:
        user = User.objects.get(username=username)
        profile = user.profile
        
        for field, value in updates.items():
            setattr(profile, field, value)
        profile.save()
        
        company_name = profile.company.name if profile.company else 'Нет'
        dept_name = profile.department.name if profile.department else 'Нет'
        roles_names = ', '.join([r.name for r in profile.roles.all()])
        
        print(f"✅ {username}: {profile.position} | {company_name} | {dept_name} | Роли: {roles_names}")
    except User.DoesNotExist:
        print(f"⚠️  Пользователь '{username}' не найден")
    except Exception as e:
        print(f"❌ Ошибка при обновлении {username}: {e}")

print("\n✅ Обновление завершено!")

# Выводим итоговую статистику
print("\n" + "="*60)
print("ИТОГОВАЯ СТАТИСТИКА")
print("="*60)

print("\n🎭 РОЛИ:")
for role in Role.objects.all().order_by('category', 'scope'):
    users_count = role.user_profiles.count()
    print(f"  • {role.name}")
    print(f"    Область: {role.get_scope_display()} | Категория: {role.get_category_display()}")
    print(f"    Пользователей: {users_count}")

print("\n👥 ПОЛЬЗОВАТЕЛИ:")
for profile in UserProfile.objects.all().order_by('company', 'department', 'user__username'):
    company = profile.company.name if profile.company else '—'
    department = profile.department.name if profile.department else '—'
    roles = ', '.join([r.name for r in profile.roles.all()]) or 'НЕТ РОЛЕЙ'
    
    print(f"  • {profile.user.username} ({profile.user.get_full_name()})")
    print(f"    {profile.position or '—'} | {company} | {department}")
    print(f"    Роли: {roles}")
    print()
