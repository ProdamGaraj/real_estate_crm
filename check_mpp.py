import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
import django
django.setup()

from permissions.models import UserProfile
from permissions.serializers import UserProfileDetailSerializer
import json

prof = UserProfile.objects.get(user__username='manager_2')
data = UserProfileDetailSerializer(prof).data

print('=== user.is_system_admin:', data.get('is_system_admin'))
roles = data.get('roles', [])
print('=== roles count:', len(roles))
for r in roles:
    rname = r.get('name')
    rcode = r.get('code')
    print(f'  Role: {rname} (code={rcode})')
    perms = r.get('permissions', [])
    print(f'  permissions count: {len(perms)}')
    view_perms = [p for p in perms if p.get('action') == 'VIEW']
    print(f'  VIEW permissions: {len(view_perms)}')
    for p in view_perms[:10]:
        act = p.get('action')
        res = p.get('resource')
        scp = p.get('scope')
        print(f'    - action={act}, resource={res}, scope={scp}')
    if len(view_perms) > 10:
        print(f'    ... and {len(view_perms)-10} more VIEW permissions')

# Also check how the frontend stores it
print('\n=== Simulating frontend mapping ===')
user_data = data
user_obj = {
    'id': user_data['id'],
    'is_system_admin': user_data['is_system_admin'],
    'roles': user_data.get('roles', []),
}

# Check what hasAnyViewPermission would see
all_permissions = []
for role in user_obj['roles']:
    all_permissions.extend(role.get('permissions', []))

print(f'Total permissions collected: {len(all_permissions)}')
resources_to_check = ['DASHBOARD', 'CLIENT', 'APPLICATION', 'MEETING', 'TASK', 'DEAL', 'PROJECT', 'PAYMENT', 'REPORT', 'DISCOUNT']
for res in resources_to_check:
    has_view = any(p.get('action') == 'VIEW' and p.get('resource') == res for p in all_permissions)
    print(f'  VIEW {res}: {has_view}')
