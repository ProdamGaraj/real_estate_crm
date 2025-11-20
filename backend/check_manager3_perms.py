#!/usr/bin/env python
import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User

u = User.objects.get(username='manager3')
p = u.profile

resources = ['CLIENT', 'APPLICATION', 'MEETING', 'DEAL', 'PROJECT', 'PROPERTY', 'PAYMENT', 'DISCOUNT']

print('\nРазрешения manager3:')
for r in resources:
    has_view = p.has_permission_for_action('VIEW', r)
    print(f'{r}: VIEW={has_view}')

print('\nВсе разрешения роли:')
for role in p.roles.all():
    print(f'\n{role.name}:')
    for perm in role.permissions.all().order_by('resource', 'action'):
        print(f'  {perm.code}')
