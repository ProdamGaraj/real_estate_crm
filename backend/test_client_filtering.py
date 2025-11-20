#!/usr/bin/env python
"""
Тест фильтрации клиентов по компаниям
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User
from apps.crm.models import Client, Application
from permissions.backends import get_filtered_queryset

print("="*80)
print("ТЕСТ ФИЛЬТРАЦИИ КЛИЕНТОВ ПО КОМПАНИЯМ")
print("="*80)

# Получаем менеджеров из разных компаний
manager1 = User.objects.get(username='manager1')  # Компания 1
manager3 = User.objects.get(username='manager3')  # Компания 2

print(f"\n👤 Менеджер 1: {manager1.get_full_name()}")
print(f"   Компания: {manager1.profile.company.name if manager1.profile.company else 'Нет'}")

print(f"\n👤 Менеджер 3: {manager3.get_full_name()}")
print(f"   Компания: {manager3.profile.company.name if manager3.profile.company else 'Нет'}")

print("\n" + "="*80)
print("ВСЕ КЛИЕНТЫ И ИХ ЗАЯВКИ")
print("="*80)

all_clients = Client.objects.all()
for client in all_clients:
    print(f"\n📋 {client.full_name}")
    applications = client.applications.all()
    if applications.exists():
        for app in applications:
            creator = app.created_by
            company = creator.profile.company.name if creator and creator.profile.company else "Нет компании"
            print(f"   • Заявка #{app.id} создана {creator.get_full_name() if creator else 'Системой'} ({company})")
    else:
        print(f"   • Нет заявок")

print("\n" + "="*80)
print("КЛИЕНТЫ, ВИДИМЫЕ МЕНЕДЖЕРУ 1 (Компания 1)")
print("="*80)

queryset1 = Client.objects.all()
filtered1 = get_filtered_queryset(manager1, queryset1, 'CLIENT')

print(f"\nВсего клиентов в системе: {all_clients.count()}")
print(f"Видит менеджер 1: {filtered1.count()}")
print()

for client in filtered1:
    print(f"✅ {client.full_name}")
    apps = client.applications.filter(created_by__profile__company=manager1.profile.company)
    for app in apps:
        print(f"   └─ Заявка #{app.id} от {app.created_by.get_full_name()}")

print("\n" + "="*80)
print("КЛИЕНТЫ, ВИДИМЫЕ МЕНЕДЖЕРУ 3 (Компания 2)")
print("="*80)

queryset3 = Client.objects.all()
filtered3 = get_filtered_queryset(manager3, queryset3, 'CLIENT')

print(f"\nВсего клиентов в системе: {all_clients.count()}")
print(f"Видит менеджер 3: {filtered3.count()}")
print()

for client in filtered3:
    print(f"✅ {client.full_name}")
    apps = client.applications.filter(created_by__profile__company=manager3.profile.company)
    for app in apps:
        print(f"   └─ Заявка #{app.id} от {app.created_by.get_full_name()}")

print("\n" + "="*80)
print("ПРОВЕРКА РАЗДЕЛЕНИЯ")
print("="*80)

# Клиенты только в компании 1
only_company1 = set(filtered1) - set(filtered3)
# Клиенты только в компании 2
only_company2 = set(filtered3) - set(filtered1)
# Клиенты в обеих компаниях
in_both = set(filtered1) & set(filtered3)

print(f"\n📊 Только в компании 1: {len(only_company1)}")
for client in only_company1:
    print(f"   • {client.full_name}")

print(f"\n📊 Только в компании 2: {len(only_company2)}")
for client in only_company2:
    print(f"   • {client.full_name}")

print(f"\n📊 В обеих компаниях: {len(in_both)}")
for client in in_both:
    print(f"   • {client.full_name}")
    print(f"      (имеет заявки от менеджеров обеих компаний)")

print("\n" + "="*80)
print("✅ ТЕСТ ЗАВЕРШЕН")
print("="*80)

if len(only_company1) > 0 and len(only_company2) > 0:
    print("\n✅ УСПЕХ! Клиенты корректно разделены по компаниям")
else:
    print("\n⚠️ ВНИМАНИЕ! Возможно, нужно создать больше тестовых данных")
