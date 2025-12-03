"""
Script to create PARTNER_API_KEY permissions and assign to top-level role
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Permission, Role

# Создаём разрешения для PARTNER_API_KEY
permissions_data = [
    ('VIEW_PARTNER_API_KEY_COMPANY', 'VIEW', 'PARTNER_API_KEY', 'COMPANY', 'Просмотр API-ключей партнёров (компания)'),
    ('ADD_PARTNER_API_KEY_COMPANY', 'ADD', 'PARTNER_API_KEY', 'COMPANY', 'Создание API-ключей партнёров (компания)'),
    ('EDIT_PARTNER_API_KEY_COMPANY', 'EDIT', 'PARTNER_API_KEY', 'COMPANY', 'Редактирование API-ключей партнёров (компания)'),
    ('DELETE_PARTNER_API_KEY_COMPANY', 'DELETE', 'PARTNER_API_KEY', 'COMPANY', 'Удаление API-ключей партнёров (компания)'),
]

created_perms = []
for code, action, resource, scope, desc in permissions_data:
    perm, created = Permission.objects.get_or_create(
        code=code,
        defaults={'action': action, 'resource': resource, 'scope': scope, 'description': desc}
    )
    created_perms.append(perm)
    print(f'Permission {code}: {"created" if created else "exists"}')

# Находим верхнеуровневую роль
# Сначала пробуем SYSTEM_ADMIN, затем любую системную роль
top_role = Role.objects.filter(code='SYSTEM_ADMIN').first()
if not top_role:
    top_role = Role.objects.filter(is_system=True).first()
if not top_role:
    # Берём роль с наибольшим количеством permissions
    top_role = Role.objects.annotate(
        perm_count=django.db.models.Count('permissions')
    ).order_by('-perm_count').first()

if top_role:
    top_role.permissions.add(*created_perms)
    print(f'\nAdded permissions to role: {top_role.name} (code: {top_role.code})')
    print(f'Total permissions in role: {top_role.permissions.count()}')
else:
    print('ERROR: No suitable role found')
    sys.exit(1)

print('\nDone!')
