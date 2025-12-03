"""
Скрипт для добавления расширенных разрешений для задач
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role

def add_task_advanced_permissions():
    """Добавить расширенные разрешения для задач"""
    
    # Новые разрешения для задач
    new_permissions = [
        # Редактирование задачи в работе
        {
            'action': 'EDIT_IN_PROGRESS',
            'resource': 'TASK',
            'scope': 'OWN',
            'description': 'Редактирование своей задачи в работе'
        },
        {
            'action': 'EDIT_IN_PROGRESS',
            'resource': 'TASK',
            'scope': 'DEPARTMENT',
            'description': 'Редактирование задач отдела в работе'
        },
        {
            'action': 'EDIT_IN_PROGRESS',
            'resource': 'TASK',
            'scope': 'COMPANY',
            'description': 'Редактирование задач компании в работе'
        },
        {
            'action': 'EDIT_IN_PROGRESS',
            'resource': 'TASK',
            'scope': 'SYSTEM',
            'description': 'Редактирование всех задач в работе'
        },
        # Возврат отменённой задачи
        {
            'action': 'REOPEN',
            'resource': 'TASK',
            'scope': 'OWN',
            'description': 'Возврат своей отменённой задачи'
        },
        {
            'action': 'REOPEN',
            'resource': 'TASK',
            'scope': 'DEPARTMENT',
            'description': 'Возврат отменённых задач отдела'
        },
        {
            'action': 'REOPEN',
            'resource': 'TASK',
            'scope': 'COMPANY',
            'description': 'Возврат отменённых задач компании'
        },
        {
            'action': 'REOPEN',
            'resource': 'TASK',
            'scope': 'SYSTEM',
            'description': 'Возврат всех отменённых задач'
        },
    ]
    
    created_count = 0
    for perm_data in new_permissions:
        perm, created = Permission.objects.get_or_create(
            action=perm_data['action'],
            resource=perm_data['resource'],
            scope=perm_data['scope'],
            defaults={'description': perm_data['description']}
        )
        if created:
            created_count += 1
            print(f"✓ Создано разрешение: {perm}")
        else:
            print(f"- Разрешение уже существует: {perm}")
    
    print(f"\n Всего создано новых разрешений: {created_count}")
    
    # Назначение разрешений ролям
    print("\n=== Назначение разрешений ролям ===")
    
    # Менеджер - может редактировать задачи отдела в работе и возвращать их
    manager_role = Role.objects.filter(name='Менеджер').first()
    if manager_role:
        manager_perms = Permission.objects.filter(
            resource='TASK',
            action__in=['EDIT_IN_PROGRESS', 'REOPEN'],
            scope__in=['OWN', 'DEPARTMENT']
        )
        for perm in manager_perms:
            manager_role.permissions.add(perm)
        print(f"✓ Добавлены разрешения для роли Менеджер")
    
    # Старший менеджер - компания
    senior_manager_role = Role.objects.filter(name='Старший менеджер').first()
    if senior_manager_role:
        senior_perms = Permission.objects.filter(
            resource='TASK',
            action__in=['EDIT_IN_PROGRESS', 'REOPEN'],
            scope__in=['OWN', 'DEPARTMENT', 'COMPANY']
        )
        for perm in senior_perms:
            senior_manager_role.permissions.add(perm)
        print(f"✓ Добавлены разрешения для роли Старший менеджер")
    
    # Директор и Администратор - все права
    for role_name in ['Директор', 'Администратор']:
        role = Role.objects.filter(name=role_name).first()
        if role:
            all_perms = Permission.objects.filter(
                resource='TASK',
                action__in=['EDIT_IN_PROGRESS', 'REOPEN']
            )
            for perm in all_perms:
                role.permissions.add(perm)
            print(f"✓ Добавлены разрешения для роли {role_name}")
    
    print("\n✅ Расширенные разрешения для задач успешно добавлены!")

if __name__ == '__main__':
    add_task_advanced_permissions()
