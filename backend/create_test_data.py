import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.contrib.auth.models import User
from permissions.models import Company
from crm.models import Client, Application, ApplicationSource, ApplicationStatus

# Get manager_company2 and set password  
manager_c2 = User.objects.get(username='manager_company2')
manager_c2.set_password('Manager123!')
manager_c2.save()
print('Password set for manager_company2')
print(f'Company: {manager_c2.profile.company}')

# Get source and status for applications
source = ApplicationSource.objects.first()
status = ApplicationStatus.objects.first()
print(f'Source: {source}, Status: {status}')

# Create clients for Company 2 (created_by = manager_c2)
c1 = Client.objects.create(
    full_name='Компания2 Клиент Первый', 
    phone_number='+998901111111', 
    created_by=manager_c2
)
print(f'Created client {c1.id}: {c1.full_name}')

c2 = Client.objects.create(
    full_name='Компания2 Клиент Второй', 
    phone_number='+998902222222', 
    created_by=manager_c2
)
print(f'Created client {c2.id}: {c2.full_name}')

# Create applications for these clients
a1 = Application.objects.create(client=c1, source=source, status=status, created_by=manager_c2)
print(f'Created application {a1.id} for client {c1.full_name}')

a2 = Application.objects.create(client=c2, source=source, status=status, created_by=manager_c2)
print(f'Created application {a2.id} for client {c2.full_name}')

print('\nDONE - Created 2 clients and 2 applications for Company 2')
print(f'Total clients in DB: {Client.objects.count()}')
print(f'Total applications in DB: {Application.objects.count()}')
