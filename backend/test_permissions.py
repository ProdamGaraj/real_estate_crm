#!/usr/bin/env python
"""
Скрипт для тестирования системы разграничения доступа
Проверяем, какие данные видит каждый пользователь согласно его роли
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User
from permissions.models import UserProfile, Company, Department
from apps.crm.models import Client, Application
from apps.deals.models import Deal
from apps.realty.models import Property, Project

print("="*80)
print("ТЕСТИРОВАНИЕ СИСТЕМЫ РАЗГРАНИЧЕНИЯ ДОСТУПА")
print("="*80)

# Получаем всех пользователей с ролями
users_to_test = User.objects.exclude(username='admin').order_by('id')

for user in users_to_test:
    try:
        profile = user.profile
        roles = profile.roles.all()
        
        print(f"\n{'='*80}")
        print(f"👤 ПОЛЬЗОВАТЕЛЬ: {user.username} ({user.get_full_name()})")
        print(f"{'='*80}")
        print(f"Должность: {profile.position or 'Не указана'}")
        print(f"Компания: {profile.company.name if profile.company else 'Нет'}")
        print(f"Отдел: {profile.department.name if profile.department else 'Нет'}")
        print(f"Системный админ: {'Да' if profile.is_system_admin else 'Нет'}")
        
        print(f"\n🎭 РОЛИ ({roles.count()}):")
        for role in roles:
            print(f"  • {role.name}")
            print(f"    - Область: {role.get_scope_display()}")
            print(f"    - Категория: {role.get_category_display()}")
            print(f"    - Разрешений: {role.permissions.count()}")
        
        # Проверяем доступные компании
        accessible_companies = profile.get_accessible_companies()
        print(f"\n🏢 ДОСТУПНЫЕ КОМПАНИИ ({accessible_companies.count()}):")
        for company in accessible_companies:
            print(f"  • {company.name}")
        
        # Проверяем доступные отделы
        accessible_departments = profile.get_accessible_departments()
        print(f"\n🏪 ДОСТУПНЫЕ ОТДЕЛЫ ({accessible_departments.count()}):")
        for dept in accessible_departments:
            print(f"  • {dept.name} ({dept.company.name})")
        
        # Проверяем разрешения
        all_permissions = profile.get_all_permissions()
        print(f"\n🔐 ВСЕ РАЗРЕШЕНИЯ ({all_permissions.count()}):")
        
        # Группируем по ресурсам
        resources = {}
        for perm in all_permissions:
            resource = perm.get_resource_display()
            if resource not in resources:
                resources[resource] = []
            resources[resource].append(f"{perm.get_action_display()} ({perm.get_scope_display()})")
        
        for resource, actions in sorted(resources.items()):
            print(f"  • {resource}:")
            for action in sorted(set(actions)):
                print(f"    - {action}")
        
        # Проверяем конкретные разрешения
        print(f"\n✅ ПРОВЕРКА КОНКРЕТНЫХ РАЗРЕШЕНИЙ:")
        
        # Клиенты
        can_view_clients = profile.has_permission_for_action('VIEW', 'CLIENT', 'COMPANY')
        can_add_clients = profile.has_permission_for_action('ADD', 'CLIENT', 'COMPANY')
        print(f"  • Просмотр клиентов (COMPANY): {'✅' if can_view_clients else '❌'}")
        print(f"  • Добавление клиентов (COMPANY): {'✅' if can_add_clients else '❌'}")
        
        # Заявки
        can_view_apps = profile.has_permission_for_action('VIEW', 'APPLICATION', 'COMPANY')
        can_edit_apps = profile.has_permission_for_action('EDIT', 'APPLICATION', 'OWN')
        print(f"  • Просмотр заявок (COMPANY): {'✅' if can_view_apps else '❌'}")
        print(f"  • Редактирование заявок (OWN): {'✅' if can_edit_apps else '❌'}")
        
        # Сделки
        can_view_deals = profile.has_permission_for_action('VIEW', 'DEAL', 'COMPANY')
        can_approve_deals = profile.has_permission_for_action('APPROVE', 'DEAL', 'DEPARTMENT')
        print(f"  • Просмотр сделок (COMPANY): {'✅' if can_view_deals else '❌'}")
        print(f"  • Утверждение сделок (DEPARTMENT): {'✅' if can_approve_deals else '❌'}")
        
        # Проекты
        can_view_projects = profile.has_permission_for_action('VIEW', 'PROJECT', 'COMPANY')
        can_edit_projects = profile.has_permission_for_action('EDIT', 'PROJECT', 'COMPANY')
        print(f"  • Просмотр проектов (COMPANY): {'✅' if can_view_projects else '❌'}")
        print(f"  • Редактирование проектов (COMPANY): {'✅' if can_edit_projects else '❌'}")
        
        # Отчеты
        can_view_reports = profile.has_permission_for_action('VIEW', 'REPORT', 'COMPANY')
        can_export_reports = profile.has_permission_for_action('EXPORT', 'REPORT', 'COMPANY')
        print(f"  • Просмотр отчетов (COMPANY): {'✅' if can_view_reports else '❌'}")
        print(f"  • Экспорт отчетов (COMPANY): {'✅' if can_export_reports else '❌'}")
        
        # Считаем фактические данные в системе
        print(f"\n📊 СТАТИСТИКА ДАННЫХ В СИСТЕМЕ:")
        total_clients = Client.objects.count()
        total_applications = Application.objects.count()
        total_deals = Deal.objects.count()
        total_projects = Project.objects.count()
        total_properties = Property.objects.count()
        
        print(f"  • Всего клиентов: {total_clients}")
        print(f"  • Всего заявок: {total_applications}")
        print(f"  • Всего сделок: {total_deals}")
        print(f"  • Всего проектов: {total_projects}")
        print(f"  • Всего объектов недвижимости: {total_properties}")
        
    except UserProfile.DoesNotExist:
        print(f"\n❌ {user.username}: НЕТ ПРОФИЛЯ!")
    except Exception as e:
        print(f"\n❌ {user.username}: ОШИБКА - {e}")

print(f"\n{'='*80}")
print("РЕКОМЕНДАЦИИ ПО ТЕСТИРОВАНИЮ:")
print("="*80)
print("""
1. Войдите в систему под каждым пользователем через frontend
2. Используйте следующие учётные данные:
   - Username: [см. выше]
   - Password: password123

3. Проверьте для каждого пользователя:
   ✓ Видит ли он только свои данные (для scope=OWN)
   ✓ Видит ли данные своего отдела (для scope=DEPARTMENT)
   ✓ Видит ли данные своей компании (для scope=COMPANY)
   ✓ Видит ли все данные (для scope=SYSTEM)
   
4. Попробуйте выполнить действия:
   ✓ Создать клиента
   ✓ Создать заявку
   ✓ Редактировать заявку (свою и чужую)
   ✓ Создать сделку
   ✓ Просмотреть отчёты
   
5. Проверьте ограничения:
   ✗ Обычный менеджер НЕ должен видеть данные других отделов
   ✗ Руководитель отдела НЕ должен видеть данные других компаний
   ✗ Аналитик НЕ должен иметь возможность создавать/редактировать
""")

print("\n💡 УЧЁТНЫЕ ДАННЫЕ ДЛЯ ВХОДА:")
print("-" * 80)
for user in users_to_test:
    try:
        profile = user.profile
        roles_str = ', '.join([r.name for r in profile.roles.all()])
        print(f"Username: {user.username:15} | Password: password123 | Роль: {roles_str}")
    except:
        pass
print("="*80)
