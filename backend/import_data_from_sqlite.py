"""
Скрипт импорта данных в PostgreSQL
Запускается внутри Docker контейнера:
docker exec -it crm_backend_dev python import_data_from_sqlite.py
"""
import os
import sys
import json
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User
from django.db import transaction
from datetime import datetime


def load_from_file(filename='sqlite_export.json'):
    """Загрузка данных из JSON файла"""
    with open(filename, 'r', encoding='utf-8') as f:
        return json.load(f)


def import_users(users_data):
    """Импорт пользователей"""
    print("\nИмпорт пользователей...")
    created = 0
    updated = 0
    
    for user_data in users_data:
        user, is_new = User.objects.update_or_create(
            username=user_data['username'],
            defaults={
                'email': user_data['email'],
                'password': user_data['password'],  # Хэш пароля сохраняется как есть
                'first_name': user_data['first_name'],
                'last_name': user_data['last_name'],
                'is_active': user_data['is_active'],
                'is_staff': user_data['is_staff'],
                'is_superuser': user_data['is_superuser'],
            }
        )
        
        # Обновляем date_joined если это новый пользователь
        if is_new and user_data.get('date_joined'):
            user.date_joined = datetime.fromisoformat(user_data['date_joined'])
            user.save(update_fields=['date_joined'])
        
        if is_new:
            created += 1
            print(f"  + Создан: {user.username}")
        else:
            updated += 1
            print(f"  ~ Обновлён: {user.username}")
    
    return created, updated


def import_permissions_app(perm_data):
    """Импорт данных приложения permissions"""
    from permissions.models import Company, Department, Role, Permission as AppPermission, UserProfile
    
    # 1. Импорт компаний
    print("\nИмпорт компаний...")
    company_id_map = {}  # old_id -> new_id
    for company_data in perm_data.get('companies', []):
        old_id = company_data['id']
        company, created = Company.objects.update_or_create(
            code=company_data['code'],
            defaults={
                'name': company_data['name'],
                'is_active': company_data['is_active'],
            }
        )
        company_id_map[old_id] = company.id
        status = "+" if created else "~"
        print(f"  {status} {company.name}")
    
    # 2. Импорт отделов
    print("\nИмпорт отделов...")
    dept_id_map = {}
    # Сначала создаём отделы без parent
    for dept_data in perm_data.get('departments', []):
        old_id = dept_data['id']
        new_company_id = company_id_map.get(dept_data['company_id'])
        if not new_company_id:
            print(f"  ! Пропущен отдел {dept_data['name']}: компания не найдена")
            continue
        
        dept, created = Department.objects.update_or_create(
            company_id=new_company_id,
            code=dept_data['code'],
            defaults={
                'name': dept_data['name'],
            }
        )
        dept_id_map[old_id] = dept.id
        status = "+" if created else "~"
        print(f"  {status} {dept.name}")
    
    # Затем обновляем parent_department
    for dept_data in perm_data.get('departments', []):
        if dept_data.get('parent_department_id'):
            old_id = dept_data['id']
            new_dept_id = dept_id_map.get(old_id)
            new_parent_id = dept_id_map.get(dept_data['parent_department_id'])
            if new_dept_id and new_parent_id:
                Department.objects.filter(id=new_dept_id).update(parent_department_id=new_parent_id)
    
    # 3. Импорт разрешений
    print("\nИмпорт разрешений...")
    perm_id_map = {}
    for perm in perm_data.get('app_permissions', []):
        old_id = perm['id']
        app_perm, created = AppPermission.objects.update_or_create(
            code=perm['code'],
            defaults={
                'name': perm['name'],
                'description': perm.get('description', ''),
                'resource': perm['resource'],
                'action': perm['action'],
                'scope': perm['scope'],
                'is_active': perm.get('is_active', True),
            }
        )
        perm_id_map[old_id] = app_perm.id
    print(f"  Импортировано разрешений: {len(perm_id_map)}")
    
    # 4. Импорт ролей
    print("\nИмпорт ролей...")
    role_id_map = {}
    for role_data in perm_data.get('roles', []):
        old_id = role_data['id']
        role, created = Role.objects.update_or_create(
            code=role_data['code'],
            defaults={
                'name': role_data['name'],
                'description': role_data.get('description', ''),
                'is_system': role_data.get('is_system', False),
                'is_active': role_data.get('is_active', True),
                'category': role_data.get('category', 'CUSTOM'),
                'scope': role_data.get('scope', 'OWN'),
            }
        )
        role_id_map[old_id] = role.id
        
        # Добавляем разрешения к роли
        new_perm_ids = [perm_id_map[old_perm_id] for old_perm_id in role_data.get('permission_ids', []) if old_perm_id in perm_id_map]
        if new_perm_ids:
            role.permissions.set(new_perm_ids)
        
        # Добавляем компании к роли
        new_company_ids = [company_id_map[old_comp_id] for old_comp_id in role_data.get('company_ids', []) if old_comp_id in company_id_map]
        if new_company_ids:
            role.companies.set(new_company_ids)
        
        status = "+" if created else "~"
        print(f"  {status} {role.name} (perms: {len(new_perm_ids)}, companies: {len(new_company_ids)})")
    
    # 5. Импорт профилей пользователей
    print("\nИмпорт профилей пользователей...")
    for profile_data in perm_data.get('user_profiles', []):
        try:
            user = User.objects.get(id=profile_data['user_id'])
        except User.DoesNotExist:
            # Пробуем найти по порядковому номеру (если ID сбились)
            users = list(User.objects.order_by('id'))
            idx = profile_data['user_id'] - 1
            if 0 <= idx < len(users):
                user = users[idx]
            else:
                print(f"  ! Пропущен профиль: пользователь {profile_data['user_id']} не найден")
                continue
        
        new_company_id = company_id_map.get(profile_data['company_id']) if profile_data.get('company_id') else None
        new_dept_id = dept_id_map.get(profile_data['department_id']) if profile_data.get('department_id') else None
        
        profile, created = UserProfile.objects.update_or_create(
            user=user,
            defaults={
                'company_id': new_company_id,
                'department_id': new_dept_id,
                'position': profile_data.get('position', ''),
                'phone': profile_data.get('phone', ''),
                'is_system_admin': profile_data.get('is_system_admin', False),
                'is_active': profile_data.get('is_active', True),
            }
        )
        
        # Добавляем роли к профилю
        new_role_ids = [role_id_map[old_role_id] for old_role_id in profile_data.get('role_ids', []) if old_role_id in role_id_map]
        if new_role_ids:
            profile.roles.set(new_role_ids)
        
        status = "+" if created else "~"
        print(f"  {status} Профиль для {user.username} (roles: {len(new_role_ids)})")
    
    return company_id_map, dept_id_map, role_id_map, perm_id_map


@transaction.atomic
def main():
    print("=" * 50)
    print("ИМПОРТ ДАННЫХ В PostgreSQL")
    print("=" * 50)
    
    data = load_from_file()
    
    # Импорт пользователей
    users_created, users_updated = import_users(data['users'])
    
    # Импорт данных permissions
    if data.get('permissions_app'):
        import_permissions_app(data['permissions_app'])
    
    print("\n" + "=" * 50)
    print("ИМПОРТ ЗАВЕРШЁН!")
    print(f"  Пользователей создано: {users_created}")
    print(f"  Пользователей обновлено: {users_updated}")
    print("=" * 50)


if __name__ == '__main__':
    main()
