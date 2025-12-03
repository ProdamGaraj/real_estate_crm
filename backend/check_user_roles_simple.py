import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth.models import User
from permissions.models import UserProfile

print("Users and their roles:")
for user in User.objects.all():
    if hasattr(user, 'profile'):
        roles = list(user.profile.roles.all().values_list('code', flat=True))
        print(f"  {user.username}: {roles}")
    else:
        print(f"  {user.username}: NO PROFILE")
