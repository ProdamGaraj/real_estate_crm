"""
Скрипт подготовки чистой базы данных для production.
Удаляет все пользовательские данные, оставляя системные настройки.

Использование:
    docker exec crm_backend python prepare_prod_db.py
"""

import os
import sys
import django

# Настройка Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
sys.path.insert(0, '/app')
django.setup()

from django.contrib.auth.models import User
from django.db import connection

def clean_database():
    """Очистка базы данных для production"""
    
    print("=" * 60)
    print("ПОДГОТОВКА БАЗЫ ДАННЫХ ДЛЯ PRODUCTION")
    print("=" * 60)
    
    # Проверяем наличие admin
    admin_user = User.objects.filter(username='admin').first()
    if not admin_user:
        print("\n⚠️  Пользователь admin не найден! Создаём...")
        admin_user = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='admin123',
            first_name='Администратор',
            last_name='Системы'
        )
        print("✅ Создан пользователь admin с паролем: admin123")
    else:
        print(f"\n✅ Пользователь admin найден (ID: {admin_user.id})")
    
    admin_id = admin_user.id
    
    # Таблицы для полной очистки (пользовательские данные)
    tables_to_truncate = [
        # Логи (удаляем первыми из-за FK)
        'crm_applicationlog',
        'crm_clientlog',
        'crm_meetinglog',
        'deals_deallog',
        'finances_paymentlog',
        'tasks_tasklog',
        'realty_buildinglog',
        'realty_discountlog',
        'permissions_permissionlog',
        
        # Связующие таблицы
        'crm_application_interested_projects',
        'crm_client_relatives',
        'deals_deal_applied_discounts',
        'tasks_task_watchers',
        'realty_discount_buildings',
        'documents_template_applies_to_buildings',
        'documents_template_applies_to_projects',
        
        # Файлы
        'crm_clientfile',
        'realty_buildingimage',
        'realty_projectimage',
        
        # Задачи
        'tasks_taskcomment',
        'tasks_task',
        
        # Платежи
        'finances_payment',
        
        # Сделки
        'deals_deal',
        
        # Встречи
        'crm_meeting',
        
        # Заявки
        'crm_application',
        
        # Телефоны клиентов
        'crm_clientphonenumber',
        
        # Клиенты
        'crm_client',
        
        # Скидки
        'realty_discount',
        
        # Недвижимость (помещения -> планировки -> здания -> проекты)
        # Оставляем проект ID=1 и здание ID=1
        'realty_property',  # Помещения удаляем, т.к. они привязаны к сделкам
        'realty_layout',    # Планировки оставляем (удалим отдельно лишние)
        # 'realty_building', # НЕ очищаем - оставляем здание ID=1
        # 'realty_project',  # НЕ очищаем - оставляем проект ID=1
        
        # Планы
        'reports_employeeplan',
        'reports_plan',
        
        # Сессии и токены
        'django_session',
        'token_blacklist_blacklistedtoken',
        'token_blacklist_outstandingtoken',
        
        # Админ логи
        'django_admin_log',
    ]
    
    print("\n📋 Удаление пользовательских данных...")
    
    with connection.cursor() as cursor:
        # Отключаем проверку FK временно
        cursor.execute("SET CONSTRAINTS ALL DEFERRED;")
        
        for table in tables_to_truncate:
            try:
                cursor.execute(f"TRUNCATE TABLE {table} CASCADE;")
                print(f"   ✓ {table}")
            except Exception as e:
                print(f"   ✗ {table}: {e}")
    
    print("\n👥 Удаление пользователей (кроме admin)...")
    
    # Удаляем лишние проекты и здания (оставляем ID=1)
    from apps.realty.models import Project, Building, Layout, Property
    
    # Удаляем планировки и изображения зданий кроме здания 1
    Layout.objects.exclude(building_id=1).delete()
    Building.objects.exclude(id=1).delete()
    Project.objects.exclude(id=1).delete()
    print("   ✓ Оставлен проект ID=1 и здание ID=1")
    
    # Удаляем профили пользователей кроме admin
    from permissions.models import UserProfile
    deleted_profiles = UserProfile.objects.exclude(user_id=admin_id).delete()
    print(f"   ✓ Удалено профилей: {deleted_profiles[0]}")
    
    # Удаляем пользователей кроме admin
    deleted_users = User.objects.exclude(id=admin_id).delete()
    print(f"   ✓ Удалено пользователей: {deleted_users[0]}")
    
    # Проверяем/создаём профиль admin
    profile, created = UserProfile.objects.get_or_create(
        user=admin_user,
        defaults={'is_system_admin': True}
    )
    if not profile.is_system_admin:
        profile.is_system_admin = True
        profile.save()
    print(f"   ✓ Профиль admin {'создан' if created else 'существует'} (is_system_admin=True)")
    
    print("\n📊 Статистика оставшихся системных данных:")
    
    # Показываем что осталось
    from apps.crm.models import ApplicationStatus, RejectionReason, PreciseSource
    from apps.realty.models import BuildingType
    from apps.deals.models import PaymentType as DealPaymentType, PurchasePurpose
    from apps.finances.models import PaymentType as FinancePaymentType, BeneficiaryAccount
    from permissions.models import Company, Department, Role, Permission
    from apps.documents.models import Template
    from apps.realty.models import Project, Building, Layout
    
    stats = [
        ('Статусы заявок', ApplicationStatus.objects.count()),
        ('Причины отказа', RejectionReason.objects.count()),
        ('Источники', PreciseSource.objects.count()),
        ('Типы зданий', BuildingType.objects.count()),
        ('Типы платежей (сделки)', DealPaymentType.objects.count()),
        ('Типы платежей (финансы)', FinancePaymentType.objects.count()),
        ('Цели покупки', PurchasePurpose.objects.count()),
        ('Счета получателей', BeneficiaryAccount.objects.count()),
        ('Шаблоны документов', Template.objects.count()),
        ('Компании', Company.objects.count()),
        ('Отделы', Department.objects.count()),
        ('Роли', Role.objects.count()),
        ('Разрешения', Permission.objects.count()),
        ('Пользователи', User.objects.count()),
        ('Проекты', Project.objects.count()),
        ('Здания', Building.objects.count()),
        ('Планировки', Layout.objects.count()),
    ]
    
    for name, count in stats:
        print(f"   • {name}: {count}")
    
    print("\n" + "=" * 60)
    print("✅ БАЗА ДАННЫХ ГОТОВА К PRODUCTION!")
    print("=" * 60)
    print("\n⚠️  Не забудьте:")
    print("   1. Сменить пароль admin")
    print("   2. Настроить компании и отделы")
    print("   3. Создать пользователей")
    print("   4. Добавить проекты и объекты недвижимости")


if __name__ == '__main__':
    import sys
    # Если передан аргумент --force, выполняем без подтверждения
    if len(sys.argv) > 1 and sys.argv[1] == '--force':
        clean_database()
    else:
        # Запрашиваем подтверждение
        print("\n⚠️  ВНИМАНИЕ! Этот скрипт удалит ВСЕ пользовательские данные!")
        print("   Будут сохранены только системные настройки и пользователь admin.\n")
        
        confirm = input("Введите 'YES' для подтверждения: ")
        
        if confirm == 'YES':
            clean_database()
        else:
            print("\n❌ Операция отменена.")
