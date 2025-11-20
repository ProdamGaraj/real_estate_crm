#!/usr/bin/env python
"""
Исправление разрешений менеджеров - они должны видеть только свои сделки
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role
from django.contrib.auth.models import User

print("="*80)
print("ИСПРАВЛЕНИЕ РАЗРЕШЕНИЙ МЕНЕДЖЕРОВ")
print("="*80)

# Текущие разрешения менеджера
role_manager = Role.objects.get(code='SALES_MANAGER')

print(f"\n📋 Текущие разрешения роли '{role_manager.name}':")
for perm in role_manager.permissions.all().order_by('resource', 'action', 'scope'):
    print(f"  • {perm.code}")

print("\n" + "="*80)
print("АНАЛИЗ ПРОБЛЕМЫ")
print("="*80)

# Проверяем разрешения на сделки
deal_perms = role_manager.permissions.filter(resource='DEAL')
print(f"\nРазрешения на DEAL ({deal_perms.count()}):")
for perm in deal_perms:
    print(f"  • {perm.code} - {perm.get_scope_display()}")

if deal_perms.filter(code='VIEW_DEAL_COMPANY').exists():
    print("\n❌ ПРОБЛЕМА: Менеджеры имеют VIEW_DEAL_COMPANY!")
    print("   Это позволяет им видеть ВСЕ сделки компании.")
    print("   Должно быть только VIEW_DEAL_OWN!")

print("\n" + "="*80)
print("ИСПРАВЛЕНИЕ")
print("="*80)

# Правильные разрешения для менеджера
correct_manager_perms = Permission.objects.filter(
    code__in=[
        # Клиенты - вся компания
        'VIEW_CLIENT_COMPANY', 'ADD_CLIENT_COMPANY', 'EDIT_CLIENT_OWN',
        # Заявки - вся компания
        'VIEW_APPLICATION_COMPANY', 'ADD_APPLICATION_COMPANY', 'EDIT_APPLICATION_OWN',
        # Встречи - вся компания
        'VIEW_MEETING_COMPANY', 'ADD_MEETING_COMPANY', 'EDIT_MEETING_OWN',
        # Проекты - только просмотр всей компании
        'VIEW_PROJECT_COMPANY', 'VIEW_PROPERTY_COMPANY',
        # Сделки - ТОЛЬКО СВОИ!
        'VIEW_DEAL_OWN', 'ADD_DEAL_COMPANY', 'EDIT_DEAL_OWN',
    ]
)

print(f"\n✅ Устанавливаем правильные разрешения:")
for perm in correct_manager_perms.order_by('resource', 'action', 'scope'):
    print(f"  • {perm.code}")

role_manager.permissions.set(correct_manager_perms)

print(f"\n✅ Роль обновлена. Всего разрешений: {role_manager.permissions.count()}")

# Проверяем
print("\n" + "="*80)
print("ПРОВЕРКА")
print("="*80)

user = User.objects.get(username='manager3')
profile = user.profile

print(f"\n👤 Пользователь: {user.get_full_name()} (manager3)")

# Проверяем разрешения на сделки
can_view_company = profile.has_permission_for_action('VIEW', 'DEAL', 'COMPANY')
can_view_own = profile.has_permission_for_action('VIEW', 'DEAL', 'OWN')
can_add = profile.has_permission_for_action('ADD', 'DEAL', 'COMPANY')
can_edit_own = profile.has_permission_for_action('EDIT', 'DEAL', 'OWN')

print(f"\n📋 Разрешения на сделки:")
print(f"  • VIEW DEAL (COMPANY): {'✅' if can_view_company else '❌'}")
print(f"  • VIEW DEAL (OWN): {'✅' if can_view_own else '❌'}")
print(f"  • ADD DEAL (COMPANY): {'✅' if can_add else '❌'}")
print(f"  • EDIT DEAL (OWN): {'✅' if can_edit_own else '❌'}")

if not can_view_company and can_view_own:
    print(f"\n✅ УСПЕХ! Теперь менеджер видит только СВОИ сделки!")
elif can_view_company:
    print(f"\n❌ ОШИБКА! Менеджер все еще может видеть сделки всей компании!")

print("\n" + "="*80)
print("ГОТОВО!")
print("="*80)
print("""
✅ Разрешения менеджеров исправлены!

Изменения:
- VIEW_DEAL_COMPANY → VIEW_DEAL_OWN
- Менеджеры теперь видят только СВОИ сделки
- Могут создавать сделки для компании
- Могут редактировать только СВОИ сделки

Обновите страницу в браузере и проверьте!
""")
