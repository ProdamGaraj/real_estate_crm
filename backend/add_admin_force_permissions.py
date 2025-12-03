"""
Скрипт для создания и добавления администраторских разрешений:
- FORCE_EDIT для задач (редактирование завершенных/отмененных)
- DELETE_LOG для логов задач (удаление логов)
"""
import os
import sys
import django

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role

def create_admin_force_permissions():
    """Создать административные разрешения для экстренного редактирования"""
    
    created_permissions = []
    
    # FORCE_EDIT разрешения для задач (все уровни доступа)
    force_edit_scopes = [
        ('SYSTEM', 'Все объекты системы'),
        ('COMPANY', 'Объекты своей компании'),
        ('DEPARTMENT', 'Объекты своего отдела'),
        ('OWN', 'Только свои объекты'),
    ]
    
    for scope_code, scope_name in force_edit_scopes:
        code = f"FORCE_EDIT_TASK_{scope_code}"
        perm, created = Permission.objects.get_or_create(
            code=code,
            defaults={
                'name': f'Принудительное редактирование задач - {scope_name}',
                'description': 'Позволяет редактировать завершенные и отмененные задачи (для исправления ошибок)',
                'action': 'FORCE_EDIT',
                'resource': 'TASK',
                'scope': scope_code,
                'is_active': True
            }
        )
        if created:
            created_permissions.append(perm)
            print(f"✅ Создано: {perm.code} - {perm.name}")
        else:
            print(f"⏭️  Уже существует: {perm.code}")
    
    # DELETE_LOG разрешения для логов задач
    delete_log_scopes = [
        ('SYSTEM', 'Все объекты системы'),
        ('COMPANY', 'Объекты своей компании'),
        ('DEPARTMENT', 'Объекты своего отдела'),
        ('OWN', 'Только свои объекты'),
    ]
    
    for scope_code, scope_name in delete_log_scopes:
        code = f"DELETE_LOG_TASK_LOG_{scope_code}"
        perm, created = Permission.objects.get_or_create(
            code=code,
            defaults={
                'name': f'Удаление логов задач - {scope_name}',
                'description': 'Позволяет удалять записи из истории изменений задач',
                'action': 'DELETE_LOG',
                'resource': 'TASK_LOG',
                'scope': scope_code,
                'is_active': True
            }
        )
        if created:
            created_permissions.append(perm)
            print(f"✅ Создано: {perm.code} - {perm.name}")
        else:
            print(f"⏭️  Уже существует: {perm.code}")
    
    print(f"\n{'='*60}")
    print(f"Создано новых разрешений: {len(created_permissions)}")
    print(f"{'='*60}")
    
    return created_permissions

def assign_to_admins():
    """Назначить новые разрешения администраторам"""
    
    # Получаем все разрешения FORCE_EDIT и DELETE_LOG
    force_permissions = Permission.objects.filter(
        action__in=['FORCE_EDIT', 'DELETE_LOG']
    )
    
    print(f"\n{'='*60}")
    print(f"Найдено административных разрешений: {force_permissions.count()}")
    print(f"{'='*60}\n")
    
    # Назначаем системному администратору
    system_admin = Role.objects.filter(code='SYSTEM_ADMIN').first()
    if system_admin:
        added = 0
        for perm in force_permissions:
            if not system_admin.permissions.filter(id=perm.id).exists():
                system_admin.permissions.add(perm)
                added += 1
        print(f"✅ SYSTEM_ADMIN: добавлено {added} разрешений")
        print(f"   Всего разрешений у роли: {system_admin.permissions.count()}")
    else:
        print("⚠️  Роль SYSTEM_ADMIN не найдена")
    
    # Назначаем администратору компании (только COMPANY scope)
    company_admin = Role.objects.filter(code='COMPANY_ADMIN').first()
    if company_admin:
        company_perms = force_permissions.filter(scope__in=['COMPANY', 'DEPARTMENT', 'OWN'])
        added = 0
        for perm in company_perms:
            if not company_admin.permissions.filter(id=perm.id).exists():
                company_admin.permissions.add(perm)
                added += 1
        print(f"✅ COMPANY_ADMIN: добавлено {added} разрешений")
        print(f"   Всего разрешений у роли: {company_admin.permissions.count()}")
    else:
        print("⚠️  Роль COMPANY_ADMIN не найдена")
    
    print(f"\n{'='*60}")

if __name__ == '__main__':
    print("Создание административных разрешений для задач...\n")
    create_admin_force_permissions()
    print("\nНазначение разрешений администраторам...")
    assign_to_admins()
    print("\n✅ Готово!")
