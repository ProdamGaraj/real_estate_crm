import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import Role

roles = Role.objects.all()
print(f'Total roles: {roles.count()}')

nulls = roles.filter(scope__isnull=True) | roles.filter(category__isnull=True)
print(f'Roles with NULL scope/category: {nulls.count()}')

print('\nFirst 10 roles:')
for r in roles[:10]:
    print(f'ID: {r.id}, Name: {r.name}, Scope: {r.scope}, Category: {r.category}')

if nulls.exists():
    print('\n⚠️ Roles with NULL values:')
    for r in nulls:
        print(f'ID: {r.id}, Name: {r.name}, Scope: {r.scope}, Category: {r.category}')
