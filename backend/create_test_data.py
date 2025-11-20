#!/usr/bin/env python
"""
Скрипт для создания полного набора тестовых данных для CRM системы
Включает: компании, отделы, пользователей, роли, проекты, дома, клиентов, заявки, сделки и т.д.
"""
import os
import sys
import django
from datetime import datetime, timedelta
from decimal import Decimal
import random

# Настраиваем Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from permissions.models import (
    Company, Department, Permission, Role, UserProfile
)
from apps.crm.models import Client, Application, RejectionReason
from apps.realty.models import (
    Project, Building, Property, Layout, Discount, BuildingType
)
from apps.deals.models import Deal
from apps.finances.models import PaymentType, BeneficiaryAccount, Payment

User = get_user_model()

print("🚀 Начинаем создание тестовых данных...\n")

# ==================== 1. КОМПАНИИ И ОТДЕЛЫ ====================
print("📊 Создание компаний и отделов...")

company1, _ = Company.objects.get_or_create(
    code="REALESTATE",
    defaults={
        'name': 'РеалЭстейт Групп',
        'description': 'Основная компания по продаже недвижимости',
        'is_active': True
    }
)

company2, _ = Company.objects.get_or_create(
    code="PREMIUM",
    defaults={
        'name': 'Премиум Недвижимость',
        'description': 'Компания премиум-класса',
        'is_active': True
    }
)

# Отделы для первой компании
dept_sales, _ = Department.objects.get_or_create(
    company=company1,
    code="SALES",
    defaults={
        'name': 'Отдел продаж',
        'description': 'Основной отдел продаж',
        'is_active': True
    }
)

dept_vip, _ = Department.objects.get_or_create(
    company=company1,
    code="VIP",
    defaults={
        'name': 'VIP отдел',
        'description': 'Отдел VIP клиентов',
        'is_active': True,
        'parent_department': dept_sales
    }
)

dept_marketing, _ = Department.objects.get_or_create(
    company=company1,
    code="MARKETING",
    defaults={
        'name': 'Отдел маркетинга',
        'description': 'Маркетинг и реклама',
        'is_active': True
    }
)

dept_finance, _ = Department.objects.get_or_create(
    company=company1,
    code="FINANCE",
    defaults={
        'name': 'Финансовый отдел',
        'description': 'Бухгалтерия и финансы',
        'is_active': True
    }
)

print(f"✅ Создано компаний: {Company.objects.count()}")
print(f"✅ Создано отделов: {Department.objects.count()}\n")

# ==================== 2. РАЗРЕШЕНИЯ И РОЛИ ====================
print("🔐 Создание разрешений и ролей...")

# Создаем разрешения для разных действий и ресурсов
permissions_data = [
    # Клиенты
    ('VIEW', 'CLIENT', 'SYSTEM'), ('VIEW', 'CLIENT', 'COMPANY'), ('VIEW', 'CLIENT', 'DEPARTMENT'), ('VIEW', 'CLIENT', 'OWN'),
    ('ADD', 'CLIENT', 'COMPANY'), ('EDIT', 'CLIENT', 'OWN'), ('DELETE', 'CLIENT', 'OWN'),
    
    # Заявки
    ('VIEW', 'APPLICATION', 'SYSTEM'), ('VIEW', 'APPLICATION', 'COMPANY'), ('VIEW', 'APPLICATION', 'DEPARTMENT'), ('VIEW', 'APPLICATION', 'OWN'),
    ('ADD', 'APPLICATION', 'COMPANY'), ('EDIT', 'APPLICATION', 'OWN'), ('DELETE', 'APPLICATION', 'OWN'),
    ('ASSIGN', 'APPLICATION', 'DEPARTMENT'),
    
    # Встречи
    ('VIEW', 'MEETING', 'SYSTEM'), ('VIEW', 'MEETING', 'COMPANY'), ('VIEW', 'MEETING', 'DEPARTMENT'), ('VIEW', 'MEETING', 'OWN'),
    ('ADD', 'MEETING', 'COMPANY'), ('EDIT', 'MEETING', 'OWN'), ('DELETE', 'MEETING', 'OWN'),
    
    # Проекты
    ('VIEW', 'PROJECT', 'SYSTEM'), ('VIEW', 'PROJECT', 'COMPANY'),
    ('ADD', 'PROJECT', 'COMPANY'), ('EDIT', 'PROJECT', 'COMPANY'),
    
    # Объекты недвижимости
    ('VIEW', 'PROPERTY', 'SYSTEM'), ('VIEW', 'PROPERTY', 'COMPANY'),
    ('EDIT', 'PROPERTY', 'COMPANY'),
    
    # Сделки
    ('VIEW', 'DEAL', 'SYSTEM'), ('VIEW', 'DEAL', 'COMPANY'), ('VIEW', 'DEAL', 'DEPARTMENT'), ('VIEW', 'DEAL', 'OWN'),
    ('ADD', 'DEAL', 'COMPANY'), ('EDIT', 'DEAL', 'OWN'), ('APPROVE', 'DEAL', 'DEPARTMENT'),
    
    # Платежи
    ('VIEW', 'PAYMENT', 'SYSTEM'), ('VIEW', 'PAYMENT', 'COMPANY'), ('VIEW', 'PAYMENT', 'DEPARTMENT'),
    ('ADD', 'PAYMENT', 'COMPANY'), ('APPROVE', 'PAYMENT', 'DEPARTMENT'),
    
    # Отчеты
    ('VIEW', 'REPORT', 'SYSTEM'), ('VIEW', 'REPORT', 'COMPANY'), ('VIEW', 'REPORT', 'DEPARTMENT'),
    ('EXPORT', 'REPORT', 'COMPANY'),
]

for action, resource, scope in permissions_data:
    Permission.objects.get_or_create(
        action=action,
        resource=resource,
        scope=scope,
        defaults={
            'code': f'{action}_{resource}_{scope}',
            'name': f'{Permission.Action(action).label} {Permission.Resource(resource).label} ({Permission.Scope(scope).label})',
            'is_active': True
        }
    )

# Создаем роли с правильными scope и category
role_admin, _ = Role.objects.get_or_create(
    code='ADMIN',
    defaults={
        'name': 'Администратор',
        'description': 'Полный доступ к системе',
        'scope': Role.RoleScope.SYSTEM,
        'category': Role.RoleCategory.ADMINISTRATIVE,
        'is_system': True,
        'is_active': True
    }
)
role_admin.permissions.set(Permission.objects.all())

role_manager, _ = Role.objects.get_or_create(
    code='SALES_MANAGER',
    defaults={
        'name': 'Менеджер по продажам',
        'description': 'Работа с клиентами и заявками',
        'scope': Role.RoleScope.COMPANY,
        'category': Role.RoleCategory.OPERATIONAL,
        'is_active': True
    }
)
manager_perms = Permission.objects.filter(
    code__in=[
        'VIEW_CLIENT_COMPANY', 'ADD_CLIENT_COMPANY', 'EDIT_CLIENT_OWN',
        'VIEW_APPLICATION_COMPANY', 'ADD_APPLICATION_COMPANY', 'EDIT_APPLICATION_OWN',
        'VIEW_MEETING_COMPANY', 'ADD_MEETING_COMPANY', 'EDIT_MEETING_OWN',
        'VIEW_PROJECT_COMPANY', 'VIEW_PROPERTY_COMPANY',
        'VIEW_DEAL_COMPANY', 'ADD_DEAL_COMPANY', 'EDIT_DEAL_OWN',
    ]
)
role_manager.permissions.set(manager_perms)

role_head, _ = Role.objects.get_or_create(
    code='DEPARTMENT_HEAD',
    defaults={
        'name': 'Руководитель отдела',
        'description': 'Управление отделом и сотрудниками',
        'scope': Role.RoleScope.DEPARTMENT,
        'category': Role.RoleCategory.MANAGEMENT,
        'is_active': True
    }
)
head_perms = Permission.objects.filter(
    code__in=[
        'VIEW_CLIENT_DEPARTMENT', 'VIEW_APPLICATION_DEPARTMENT', 'ASSIGN_APPLICATION_DEPARTMENT',
        'VIEW_MEETING_DEPARTMENT',
        'VIEW_DEAL_DEPARTMENT', 'APPROVE_DEAL_DEPARTMENT',
        'VIEW_PAYMENT_DEPARTMENT', 'APPROVE_PAYMENT_DEPARTMENT',
        'VIEW_REPORT_DEPARTMENT', 'EXPORT_REPORT_COMPANY',
    ]
)
role_head.permissions.set(role_head.permissions.all() | head_perms)

role_analyst, _ = Role.objects.get_or_create(
    code='ANALYST',
    defaults={
        'name': 'Аналитик',
        'description': 'Просмотр отчетов и аналитики',
        'scope': Role.RoleScope.COMPANY,
        'category': Role.RoleCategory.READONLY,
        'is_active': True
    }
)
analyst_perms = Permission.objects.filter(
    code__in=[
        'VIEW_CLIENT_COMPANY', 'VIEW_APPLICATION_COMPANY',
        'VIEW_DEAL_COMPANY', 'VIEW_PAYMENT_COMPANY',
        'VIEW_REPORT_COMPANY', 'EXPORT_REPORT_COMPANY',
    ]
)
role_analyst.permissions.set(analyst_perms)

print(f"✅ Создано разрешений: {Permission.objects.count()}")
print(f"✅ Создано ролей: {Role.objects.count()}\n")

# ==================== 3. ПОЛЬЗОВАТЕЛИ ====================
print("👥 Создание пользователей...")

users_data = [
    # Руководители
    ('director', 'Директор', 'Иванов', 'Иван', 'director@realestate.ru', company1, None, True, [role_admin]),
    ('head_sales', 'Руководитель', 'Петрова', 'Анна', 'head.sales@realestate.ru', company1, dept_sales, False, [role_head]),
    ('head_vip', 'Руководитель VIP', 'Сидоров', 'Петр', 'head.vip@realestate.ru', company1, dept_vip, False, [role_head]),
    
    # Менеджеры отдела продаж
    ('manager1', 'Менеджер', 'Кузнецова', 'Мария', 'manager1@realestate.ru', company1, dept_sales, False, [role_manager]),
    ('manager2', 'Менеджер', 'Смирнов', 'Алексей', 'manager2@realestate.ru', company1, dept_sales, False, [role_manager]),
    ('manager3', 'Менеджер', 'Волкова', 'Елена', 'manager3@realestate.ru', company1, dept_sales, False, [role_manager]),
    
    # VIP менеджеры
    ('vip_manager1', 'VIP Менеджер', 'Морозов', 'Дмитрий', 'vip1@realestate.ru', company1, dept_vip, False, [role_manager]),
    ('vip_manager2', 'VIP Менеджер', 'Новикова', 'Ольга', 'vip2@realestate.ru', company1, dept_vip, False, [role_manager]),
    
    # Аналитики
    ('analyst1', 'Аналитик', 'Соколов', 'Игорь', 'analyst@realestate.ru', company1, dept_marketing, False, [role_analyst]),
]

for username, position, last_name, first_name, email, company, department, is_admin, roles in users_data:
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'is_active': True,
            'is_staff': is_admin,
        }
    )
    
    if created:
        user.set_password('password123')  # Простой пароль для тестирования
        user.save()
    
    # Создаём или обновляем профиль (важно для корректного заполнения данных)
    profile, profile_created = UserProfile.objects.get_or_create(user=user)
    
    # Обновляем данные профиля
    profile.company = company
    profile.department = department
    profile.position = position
    profile.is_system_admin = is_admin
    profile.is_active = True
    
    if profile_created or not profile.phone:
        profile.phone = f'+7 (999) {random.randint(100, 999)}-{random.randint(10, 99)}-{random.randint(10, 99)}'
    
    profile.save()
    profile.roles.set(roles)

print(f"✅ Создано пользователей: {User.objects.count()}\n")

# ==================== 4. ПРОЕКТЫ И ЗДАНИЯ ====================
print("🏗️ Создание проектов и зданий...")

# Типы зданий
building_type_residential, _ = BuildingType.objects.get_or_create(
    name='Монолитный'
)
building_type_commercial, _ = BuildingType.objects.get_or_create(
    name='Кирпичный'
)
building_type_panel, _ = BuildingType.objects.get_or_create(
    name='Панельный'
)

# Проекты
project1, _ = Project.objects.get_or_create(
    name='ЖК "Солнечный"',
    defaults={
        'address': 'г. Москва, ул. Солнечная, 10',
        'description': 'Современный жилой комплекс в зеленой зоне',
        'min_floors': 10,
        'max_floors': 15,
        'created_by': User.objects.get(username='director')
    }
)

project2, _ = Project.objects.get_or_create(
    name='ЖК "Премиум Парк"',
    defaults={
        'address': 'г. Москва, Кутузовский проспект, 25',
        'description': 'Элитный жилой комплекс премиум-класса',
        'min_floors': 20,
        'max_floors': 25,
        'created_by': User.objects.get(username='director')
    }
)

project3, _ = Project.objects.get_or_create(
    name='БЦ "Центральный"',
    defaults={
        'address': 'г. Москва, ул. Тверская, 1',
        'description': 'Современный бизнес-центр класса А',
        'min_floors': 15,
        'max_floors': 20,
        'created_by': User.objects.get(username='director')
    }
)

# Дома
buildings_data = [
    (project1, 'Корпус 1', 12, 'FOR_SALE', building_type_residential),
    (project1, 'Корпус 2', 15, 'FOR_SALE', building_type_residential),
    (project1, 'Корпус 3', 10, 'UNDER_REVIEW', building_type_residential),
    (project2, 'Башня А', 25, 'FOR_SALE', building_type_commercial),
    (project2, 'Башня Б', 25, 'UNDER_REVIEW', building_type_commercial),
    (project3, 'Офисный блок', 20, 'UNDER_REVIEW', building_type_panel),
]

buildings = []
for project, name, floors_count, status, btype in buildings_data:
    building, _ = Building.objects.get_or_create(
        project=project,
        name=name,
        defaults={
            'address_detail': f'{project.address}, {name}',
            'floors_count': floors_count,
            'status': status,
            'building_type': btype,
            'created_by': User.objects.get(username='director')
        }
    )
    buildings.append(building)

print(f"✅ Создано проектов: {Project.objects.count()}")
print(f"✅ Создано зданий: {Building.objects.count()}\n")

# ==================== 5. ПЛАНИРОВКИ И КВАРТИРЫ ====================
print("🏠 Создание планировок и квартир...")

# Создаем планировки для каждого дома
layouts_dict = {}
for building in buildings:
    layouts_data_for_building = [
        (building, '1-комнатная', Decimal('45.5')),
        (building, '2-комнатная', Decimal('65.0')),
        (building, '3-комнатная', Decimal('85.0')),
    ]
    
    for bldg, layout_name, area in layouts_data_for_building:
        layout, _ = Layout.objects.get_or_create(
            building=bldg,
            name=layout_name,
        )
        if bldg not in layouts_dict:
            layouts_dict[bldg] = []
        layouts_dict[bldg].append((layout, area))

# Создаем квартиры
property_counter = 0
for building in buildings[:4]:  # Только для первых 4 домов
    if building not in layouts_dict:
        continue
        
    floors_range = range(1, min(building.floors_count + 1, 11)) if building.floors_count else range(1, 6)
    for floor in floors_range:
        for apt_num in range(1, 5):  # 4 квартиры на этаже
            layout, area = random.choice(layouts_dict[building])
            apt_number = f"{floor}{apt_num:02d}"
            
            # Цена зависит от этажа и площади
            base_price_per_sqm = Decimal('150000')
            floor_coefficient = Decimal('1.0') + (Decimal(floor) / Decimal('100'))
            price = base_price_per_sqm * area * floor_coefficient
            
            # Статусы квартир
            statuses = ['SELECTION', 'SELECTION', 'SELECTION', 'RESERVE', 'SOLD']
            status = random.choice(statuses)
            
            property_obj, created = Property.objects.get_or_create(
                building=building,
                unit_number=apt_number,
                defaults={
                    'property_type': 'APARTMENT',
                    'floor': floor,
                    'area': area,
                    'price': price,
                    'status': status,
                    'layout': layout,
                    'has_finishing': random.choice([True, False]),
                    'created_by': User.objects.get(username='director')
                }
            )
            
            if created:
                property_counter += 1

print(f"✅ Создано планировок: {Layout.objects.count()}")
print(f"✅ Создано квартир: {property_counter}\n")

# ==================== 6. СКИДКИ ====================
print("💰 Создание скидок...")

discounts_data = [
    ('Раннее бронирование', Decimal('5.0'), timezone.now().date(), timezone.now().date() + timedelta(days=90)),
    ('Первый взнос 50%', Decimal('7.0'), timezone.now().date(), timezone.now().date() + timedelta(days=60)),
    ('Военная ипотека', Decimal('3.0'), timezone.now().date() - timedelta(days=30), timezone.now().date() + timedelta(days=365)),
    ('Семейная программа', Decimal('4.0'), timezone.now().date(), timezone.now().date() + timedelta(days=180)),
]

for name, percentage, start_date, end_date in discounts_data:
    Discount.objects.get_or_create(
        name=name,
        defaults={
            'percentage_value': percentage,
            'start_date': start_date,
            'end_date': end_date,
        }
    )

print(f"✅ Создано скидок: {Discount.objects.count()}\n")

# ==================== 7. КЛИЕНТЫ ====================
print("👤 Создание клиентов...")

from apps.crm.models import ClientPhoneNumber

clients_data = [
    ('Александров Сергей Петрович', '+7 (915) 123-45-67', 'alexandrov@example.com', 'manager1'),
    ('Белова Ирина Александровна', '+7 (916) 234-56-78', 'belova@example.com', 'manager1'),
    ('Григорьев Максим Олегович', '+7 (917) 345-67-89', 'grigoriev@example.com', 'manager2'),
    ('Дмитриева Наталья Сергеевна', '+7 (918) 456-78-90', 'dmitrieva@example.com', 'manager2'),
    ('Егоров Андрей Владимирович', '+7 (919) 567-89-01', 'egorov@example.com', 'manager3'),
    ('Федорова Светлана Ивановна', '+7 (920) 678-90-12', 'fedorova@example.com', 'manager3'),
    ('Козлов Владимир Михайлович', '+7 (921) 789-01-23', 'kozlov@example.com', 'vip_manager1'),
    ('Павлова Екатерина Дмитриевна', '+7 (922) 890-12-34', 'pavlova@example.com', 'vip_manager1'),
    ('Романов Николай Александрович', '+7 (923) 901-23-45', 'romanov@example.com', 'vip_manager2'),
    ('Семенова Анастасия Викторовна', '+7 (924) 012-34-56', 'semenova@example.com', 'vip_manager2'),
    ('Тихонов Евгений Сергеевич', '+7 (925) 123-45-67', 'tikhonov@example.com', 'manager1'),
    ('Ушакова Мария Александровна', '+7 (926) 234-56-78', 'ushakova@example.com', 'manager2'),
]

clients = []
for full_name, phone, email, manager_username in clients_data:
    client, created = Client.objects.get_or_create(
        full_name=full_name,
        defaults={
            'email': email,
            'status': 'ACTIVE',
            'gender': random.choice(['MALE', 'FEMALE']),
            'created_by': User.objects.get(username=manager_username)
        }
    )
    
    if created:
        # Создаем телефонный номер для клиента
        ClientPhoneNumber.objects.get_or_create(
            client=client,
            phone_number=phone,
            defaults={'is_primary': True}
        )
    
    clients.append(client)

print(f"✅ Создано клиентов: {Client.objects.count()}\n")

# ==================== 8. ПРИЧИНЫ ОТКАЗА ====================
print("❌ Создание причин отказа...")

rejection_reasons_data = [
    ('Высокая цена', 'REJECTED'),
    ('Не подходит планировка', 'REJECTED'),
    ('Неудобное расположение', 'REJECTED'),
    ('Не получил ипотеку', 'REJECTED'),
    ('Передумал покупать', 'REJECTED'),
    ('Купил в другом месте', 'REJECTED'),
    ('Недостаточная инфраструктура', 'REJECTED'),
    ('Спам', 'JUNK'),
    ('Неверный контакт', 'JUNK'),
]

for reason, reason_type in rejection_reasons_data:
    RejectionReason.objects.get_or_create(
        name=reason,
        defaults={'reason_type': reason_type, 'is_active': True}
    )

print(f"✅ Создано причин отказа: {RejectionReason.objects.count()}\n")

# ==================== 9. ЗАЯВКИ ====================
print("📝 Создание заявок...")

applications_counter = 0

for i, client in enumerate(clients):
    # Каждому клиенту создаем 1-3 заявки
    num_applications = random.randint(1, 3)
    
    for _ in range(num_applications):
        statuses = ['NEW', 'IN_PROGRESS', 'JUNK', 'REJECTED', 'CLOSED_WON', 'CLOSED_LOST']
        status = random.choice(statuses)
        
        created_date = timezone.now() - timedelta(days=random.randint(1, 90))
        
        application, created = Application.objects.get_or_create(
            client=client,
            created_at=created_date,
            defaults={
                'status': status,
                'source': random.choice(['INTERNET', 'SOCIAL_MEDIA', 'OFFICE', 'CALL']),
                'notes': f'Заявка от {client.full_name}. Интересуется покупкой недвижимости.',
                'created_by': client.created_by,
            }
        )
        
        if created:
            applications_counter += 1
            
            # Если статус REJECTED или JUNK - добавляем причину
            if status in ['REJECTED', 'JUNK'] and RejectionReason.objects.exists():
                reason_type = 'REJECTED' if status == 'REJECTED' else 'JUNK'
                reasons = RejectionReason.objects.filter(reason_type=reason_type)
                if reasons.exists():
                    application.rejection_reason = random.choice(list(reasons))
                    application.save()

print(f"✅ Создано заявок: {applications_counter}\n")

# ==================== 10. ТИПЫ ПЛАТЕЖЕЙ И СЧЕТА ====================
print("💳 Создание типов платежей и счетов...")

payment_types_data = [
    'Бронирование',
    'Первоначальный взнос',
    'Рассрочка',
    'Полная оплата',
    'Ипотека',
]

for name in payment_types_data:
    PaymentType.objects.get_or_create(name=name)

# Счета получателей
accounts_data = [
    ('Основной счет РеалЭстейт', '40702810100000001234 (SBERBANK, БИК: 044525225)'),
    ('Счет для ипотеки', '40702810200000005678 (VTBBANK, БИК: 044525187)'),
    ('Резервный счет', '40702810300000009012 (ALFABANK, БИК: 044525593)'),
]

for name, details in accounts_data:
    BeneficiaryAccount.objects.get_or_create(
        name=name,
        defaults={'details': details}
    )

print(f"✅ Создано типов платежей: {PaymentType.objects.count()}")
print(f"✅ Создано счетов: {BeneficiaryAccount.objects.count()}\n")

# ==================== 11. СДЕЛКИ ====================
print("🤝 Создание сделок...")

# Выбираем заявки со статусом CLOSED_WON
won_applications = Application.objects.filter(status='CLOSED_WON')
available_properties = list(Property.objects.filter(status__in=['SELECTION', 'RESERVE'])[:20])

deals_counter = 0
payments_counter = 0

# Создаем сделки для успешных заявок
for application in won_applications:
    if available_properties:
        property_obj = random.choice(available_properties)
        
        booking_end = timezone.now() + timedelta(days=random.randint(7, 30))
        
        deal, created = Deal.objects.get_or_create(
            client=application.client,
            property=property_obj,
            defaults={
                'status': random.choice(['BOOKING', 'IN_PROGRESS', 'CLOSED_WON', 'CANCELLED']),
                'booking_end_date': booking_end,
                'initial_price': property_obj.price,
                'initial_price_per_sqm': property_obj.price_per_sqm if property_obj.price_per_sqm else Decimal('150000'),
                'contract_price': property_obj.price * Decimal('0.95'),  # 5% скидка
                'created_by': application.created_by,
            }
        )
        
        if created:
            deals_counter += 1
            
            # Обновляем статус квартиры
            if deal.status in ['IN_PROGRESS', 'CLOSED_WON']:
                property_obj.status = 'IN_DEAL' if deal.status == 'IN_PROGRESS' else 'SOLD'
                property_obj.save()
            
            # Создаем платежи для сделки
            if deal.status in ['IN_PROGRESS', 'CLOSED_WON']:
                payment_type_booking = PaymentType.objects.filter(name__icontains='Бронь').first() or PaymentType.objects.first()
                payment_type_down = PaymentType.objects.filter(name__icontains='взнос').first() or PaymentType.objects.first()
                account = BeneficiaryAccount.objects.first()
                
                if payment_type_booking and account:
                    # Платеж за бронирование
                    Payment.objects.get_or_create(
                        deal=deal,
                        client=application.client,
                        defaults={
                            'amount': Decimal('50000'),
                            'payment_type': payment_type_booking,
                            'method': 'CASHLESS',
                            'beneficiary_account': account,
                            'due_date': timezone.now().date(),
                            'payment_date': timezone.now().date(),
                            'status': 'PAID',
                            'created_by': deal.created_by,
                        }
                    )
                    payments_counter += 1
                
                if payment_type_down and account and deal.contract_price:
                    # Первоначальный взнос
                    down_payment_amount = deal.contract_price * Decimal('0.3')  # 30%
                    Payment.objects.get_or_create(
                        deal=deal,
                        client=application.client,
                        defaults={
                            'amount': down_payment_amount,
                            'payment_type': payment_type_down,
                            'method': 'CASHLESS',
                            'beneficiary_account': account,
                            'due_date': timezone.now().date() + timedelta(days=7),
                            'payment_date': timezone.now().date() + timedelta(days=7) if deal.status == 'CLOSED_WON' else None,
                            'status': 'PAID' if deal.status == 'CLOSED_WON' else 'PENDING',
                            'created_by': deal.created_by,
                        }
                    )
                    payments_counter += 1

print(f"✅ Создано сделок: {deals_counter}")
print(f"✅ Создано платежей: {payments_counter}\n")

# ==================== ИТОГОВАЯ СТАТИСТИКА ====================
print("=" * 60)
print("📊 ИТОГОВАЯ СТАТИСТИКА")
print("=" * 60)
print(f"👥 Пользователей: {User.objects.count()}")
print(f"🏢 Компаний: {Company.objects.count()}")
print(f"🏬 Отделов: {Department.objects.count()}")
print(f"🔐 Разрешений: {Permission.objects.count()}")
print(f"👔 Ролей: {Role.objects.count()}")
print(f"🏗️ Проектов: {Project.objects.count()}")
print(f"🏢 Зданий: {Building.objects.count()}")
print(f"📐 Планировок: {Layout.objects.count()}")
print(f"🏠 Квартир: {Property.objects.count()}")
print(f"💰 Скидок: {Discount.objects.count()}")
print(f"👤 Клиентов: {Client.objects.count()}")
print(f"📝 Заявок: {Application.objects.count()}")
print(f"❌ Причин отказа: {RejectionReason.objects.count()}")
print(f"🤝 Сделок: {Deal.objects.count()}")
print(f"💳 Типов платежей: {PaymentType.objects.count()}")
print(f"🏦 Счетов: {BeneficiaryAccount.objects.count()}")
print(f"💵 Платежей: {Payment.objects.count()}")
print("=" * 60)
print("\n✅ Тестовые данные успешно созданы!")
print("\n📌 Учетные данные для входа:")
print("   Admin: admin / password123")
print("   Руководитель продаж: head_sales / password123")
print("   Менеджер 1: manager1 / password123")
print("   Менеджер 2: manager2 / password123")
print("   VIP менеджер: vip_manager1 / password123")
print("   Аналитик: analyst1 / password123")
