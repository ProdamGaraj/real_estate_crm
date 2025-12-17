"""
Скрипт миграции данных из SQLite в PostgreSQL
Запуск: python migrate_data_to_postgres.py
"""
import os
import sys
import django

# Настройка Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
os.environ['USE_SQLITE'] = 'True'  # Сначала читаем из SQLite

django.setup()

import json
from django.contrib.auth.models import User, Group, Permission
from django.contrib.contenttypes.models import ContentType


def export_from_sqlite():
    """Экспорт данных из SQLite"""
    data = {
        'users': [],
        'groups': [],
        'permissions_app': {},
    }
    
    # Экспорт пользователей
    print("Экспорт пользователей...")
    for user in User.objects.all():
        user_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'password': user.password,  # Хэш пароля
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_active': user.is_active,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'date_joined': user.date_joined.isoformat(),
            'last_login': user.last_login.isoformat() if user.last_login else None,
            'groups': list(user.groups.values_list('name', flat=True)),
            'user_permissions': list(user.user_permissions.values_list('codename', flat=True)),
        }
        data['users'].append(user_data)
        print(f"  - {user.username} (staff={user.is_staff}, superuser={user.is_superuser})")
    
    # Экспорт групп
    print("\nЭкспорт групп...")
    for group in Group.objects.all():
        group_data = {
            'id': group.id,
            'name': group.name,
            'permissions': list(group.permissions.values_list('codename', flat=True)),
        }
        data['groups'].append(group_data)
        print(f"  - {group.name}")
    
    # Экспорт данных из приложения permissions
    print("\nЭкспорт ролей и разрешений...")
    try:
        from permissions.models import Role, Permission as AppPermission, Company, UserProfile, Department
        
        # Компании
        data['permissions_app']['companies'] = []
        for company in Company.objects.all():
            data['permissions_app']['companies'].append({
                'id': company.id,
                'name': company.name,
                'code': company.code,
                'is_active': company.is_active,
            })
            print(f"  Компания: {company.name}")
        
        # Отделы
        data['permissions_app']['departments'] = []
        for dept in Department.objects.all():
            data['permissions_app']['departments'].append({
                'id': dept.id,
                'name': dept.name,
                'code': dept.code,
                'company_id': dept.company_id,
                'parent_department_id': dept.parent_department_id,
            })
            print(f"  Отдел: {dept.name}")
        
        # Роли
        data['permissions_app']['roles'] = []
        for role in Role.objects.all():
            role_data = {
                'id': role.id,
                'name': role.name,
                'code': role.code,
                'description': role.description,
                'is_system': role.is_system,
                'is_active': role.is_active,
                'category': role.category,
                'scope': role.scope,
                # Permissions (M2M)
                'permission_ids': list(role.permissions.values_list('id', flat=True)),
                # Companies (M2M)
                'company_ids': list(role.companies.values_list('id', flat=True)),
            }
            data['permissions_app']['roles'].append(role_data)
            print(f"  Роль: {role.name} ({role.code})")
        
        # Разрешения приложения
        data['permissions_app']['app_permissions'] = []
        for perm in AppPermission.objects.all():
            data['permissions_app']['app_permissions'].append({
                'id': perm.id,
                'code': perm.code,
                'name': perm.name,
                'description': perm.description,
                'resource': perm.resource,
                'action': perm.action,
                'scope': perm.scope,
                'is_active': perm.is_active,
            })
        print(f"  App Permissions: {AppPermission.objects.count()}")
        
        # Профили пользователей
        data['permissions_app']['user_profiles'] = []
        for profile in UserProfile.objects.all():
            profile_data = {
                'id': profile.id,
                'user_id': profile.user_id,
                'company_id': profile.company_id,
                'department_id': profile.department_id,
                'position': profile.position,
                'phone': profile.phone,
                'is_system_admin': profile.is_system_admin,
                'is_active': profile.is_active,
                'role_ids': list(profile.roles.values_list('id', flat=True)),
            }
            data['permissions_app']['user_profiles'].append(profile_data)
        print(f"  UserProfiles: {UserProfile.objects.count()}")
        
    except Exception as e:
        import traceback
        print(f"  Ошибка при экспорте permissions: {e}")
        traceback.print_exc()
    
    return data


def save_to_file(data, filename='sqlite_export.json'):
    """Сохранение в JSON файл"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nДанные сохранены в {filename}")


if __name__ == '__main__':
    print("=" * 50)
    print("ЭКСПОРТ ДАННЫХ ИЗ SQLite")
    print("=" * 50)
    
    data = export_from_sqlite()
    save_to_file(data)
    
    print("\n" + "=" * 50)
    print("ИТОГО:")
    print(f"  Пользователей: {len(data['users'])}")
    print(f"  Групп: {len(data['groups'])}")
    if data['permissions_app']:
        print(f"  Компаний: {len(data['permissions_app'].get('companies', []))}")
        print(f"  Ролей: {len(data['permissions_app'].get('roles', []))}")
        print(f"  Профилей: {len(data['permissions_app'].get('user_profiles', []))}")
    print("=" * 50)
