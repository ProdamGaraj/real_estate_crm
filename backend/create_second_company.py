#!/usr/bin/env python
"""
Создание второй компании и перенос туда менеджеров для тестирования разделения клиентов
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User
from permissions.models import Company, Department

print("="*80)
print("СОЗДАНИЕ ВТОРОЙ КОМПАНИИ")
print("="*80)

# Создаем вторую компанию
company2, created = Company.objects.get_or_create(
    code='PROP_INVEST',
    defaults={
        'name': 'Пропэрти Инвест',
        'description': 'Вторая компания для тестирования'
    }
)

if created:
    print(f"\n✅ Создана компания: {company2.name}")
else:
    print(f"\n✓ Компания уже существует: {company2.name}")

# Создаем отделы для второй компании
dept_sales2, created = Department.objects.get_or_create(
    company=company2,
    code='SALES',
    defaults={
        'name': 'Отдел продаж',
        'description': 'Отдел продаж компании ' + company2.name
    }
)

if created:
    print(f"✅ Создан отдел: {dept_sales2.name}")
else:
    print(f"✓ Отдел уже существует: {dept_sales2.name}")

dept_finance2, created = Department.objects.get_or_create(
    company=company2,
    code='FINANCE',
    defaults={
        'name': 'Финансовый отдел',
        'description': 'Финансовый отдел компании ' + company2.name
    }
)

if created:
    print(f"✅ Создан отдел: {dept_finance2.name}")
else:
    print(f"✓ Отдел уже существует: {dept_finance2.name}")

print("\n" + "="*80)
print("ПЕРЕНОС МЕНЕДЖЕРОВ")
print("="*80)

# Переносим manager3 и manager4 во вторую компанию
users_to_transfer = ['manager3', 'manager4', 'accountant2']

for username in users_to_transfer:
    try:
        user = User.objects.get(username=username)
        profile = user.profile
        
        old_company = profile.company.name if profile.company else "Нет"
        
        # Определяем новый отдел
        if 'manager' in username:
            profile.department = dept_sales2
        elif 'accountant' in username:
            profile.department = dept_finance2
        
        profile.company = company2
        profile.save()
        
        print(f"\n✅ {user.get_full_name()} ({username})")
        print(f"   {old_company} → {company2.name}")
        print(f"   Отдел: {profile.department.name}")
        
    except User.DoesNotExist:
        print(f"\n⚠️ Пользователь {username} не найден")

print("\n" + "="*80)
print("ИТОГОВОЕ РАСПРЕДЕЛЕНИЕ")
print("="*80)

company1 = Company.objects.get(code='REALESTATE')

print(f"\n📊 {company1.name}:")
profiles1 = User.objects.filter(profile__company=company1).select_related('profile')
for user in profiles1:
    role_names = ', '.join([r.name for r in user.profile.roles.all()])
    print(f"   • {user.get_full_name()} ({user.username}) - {role_names}")

print(f"\n📊 {company2.name}:")
profiles2 = User.objects.filter(profile__company=company2).select_related('profile')
for user in profiles2:
    role_names = ', '.join([r.name for r in user.profile.roles.all()])
    print(f"   • {user.get_full_name()} ({user.username}) - {role_names}")

print("\n" + "="*80)
print("✅ ГОТОВО!")
print("="*80)
print("""
Теперь у нас есть две компании:
1. РеалЭстейт Групп - manager1, manager2, accountant1, admin
2. Пропэрти Инвест - manager3, manager4, accountant2

Запустите test_client_filtering.py для проверки разделения клиентов!
""")
