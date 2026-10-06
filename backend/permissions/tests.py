"""
Контракт API-ключей партнёров.

Ключ в открытом виде сервер отдаёт ровно один раз — в ответе на создание и
на перегенерацию. В списке приходит только замаскированный `key_masked`.
Тесты закрепляют это: интерфейс однажды ждал в списке поле `key`, не получал
его и падал на всей странице настроек.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Company, PartnerAPIKey, UserProfile

User = get_user_model()

LIST_URL = '/api/permissions/partner-api-keys/'


# Кэш прав и счётчики запросов ходят в Redis: в тестах его нет
@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)
class PartnerAPIKeyContractTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Тестовая компания')
        self.user = User.objects.create_superuser(
            username='root', email='root@example.com', password='pass-for-tests'
        )
        # Профиль заводится сигналом при создании пользователя — дополняем его
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.is_system_admin = True
        profile.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_key(self, name='Партнёр'):
        return self.client.post(
            LIST_URL,
            {
                'name': name,
                'description': '',
                'companies': [self.company.id],
                'allowed_scopes': ['VIEW_PROJECTS'],
            },
            format='json',
        )

    def test_create_returns_plaintext_key_once(self):
        response = self._create_key()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn('key', response.data)
        self.assertTrue(response.data['key'])

    def test_list_returns_masked_key_and_never_plaintext(self):
        self._create_key()

        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 200)

        rows = response.data if isinstance(response.data, list) else response.data['results']
        self.assertEqual(len(rows), 1)

        row = rows[0]
        # Поле, на которое рассчитывает таблица настроек
        self.assertIn('key_masked', row)
        self.assertTrue(row['key_masked'])
        self.assertTrue(row['key_masked'].endswith('***'))
        # Открытого ключа в списке быть не должно
        self.assertNotIn('key', row)

    def test_regenerate_returns_new_plaintext_key(self):
        created = self._create_key()
        key_id = created.data['id']
        first_key = created.data['key']

        response = self.client.post(f'{LIST_URL}{key_id}/regenerate/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('key', response.data)
        self.assertNotEqual(response.data['key'], first_key)

        # Старый ключ больше не находится, новый — находится
        self.assertIsNone(PartnerAPIKey.find_by_key(first_key))
        self.assertEqual(
            PartnerAPIKey.find_by_key(response.data['key']).id, key_id
        )


# --- Общесистемные справочники и защита своих ролей -------------------------

import io as _io
import shutil as _shutil
import tempfile as _tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from .models import Department, Permission, Role

_MEDIA_ROOT = _tempfile.mkdtemp(prefix='crm-test-refs-')


@override_settings(
    MEDIA_ROOT=_MEDIA_ROOT,
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class SharedReferenceVisibilityTests(TestCase):
    """
    Счета получателей и шаблоны договоров без компании — общесистемные.

    Раньше их видела только компания автора: менеджер не находил в графике
    платежей счёт, а в сделке — шаблон договора, заведённые администратором.
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        _shutil.rmtree(_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        from apps.documents.models import Template
        from apps.finances.models import BeneficiaryAccount

        call_command('init_permissions', stdout=_io.StringIO())
        self.company = Company.objects.create(name='Продажи', code='SALES')
        self.other = Company.objects.create(name='Система', code='SYS')
        dept = Department.objects.create(company=self.company, name='Отдел', code='D1')

        role = Role.objects.create(name='Менеджер продаж', code='SALES_MANAGER')
        role.permissions.set(Permission.objects.filter(
            action='VIEW', resource__in=['BENEFICIARY_ACCOUNT', 'TEMPLATE'], scope='COMPANY'
        ))
        self.user = User.objects.create_user('mpp', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company, profile.department = self.company, dept
        profile.save()
        profile.roles.set([role])
        self.user = User.objects.get(pk=self.user.pk)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        def account(name, company):
            return BeneficiaryAccount.objects.create(name=name, details='-', company=company)

        def template(name, company):
            return Template.objects.create(
                name=name, company=company,
                file=SimpleUploadedFile(f'{name}.docx', b'docx'),
            )

        self.acc_shared = account('Общий счёт', None)
        self.acc_own = account('Счёт компании', self.company)
        self.acc_other = account('Чужой счёт', self.other)
        self.tpl_shared = template('shared', None)
        self.tpl_own = template('own', self.company)
        self.tpl_other = template('other', self.other)

    @staticmethod
    def _ids(response):
        data = response.data if isinstance(response.data, list) else response.data['results']
        return {row['id'] for row in data}

    def test_accounts_include_shared_but_not_foreign(self):
        response = self.client.get('/api/finances/beneficiary-accounts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ids(response), {self.acc_shared.id, self.acc_own.id})

    def test_templates_include_shared_but_not_foreign(self):
        response = self.client.get('/api/templates/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ids(response), {self.tpl_shared.id, self.tpl_own.id})

    def test_shared_template_is_offered_in_own_deal(self):
        from datetime import timedelta
        from decimal import Decimal
        from django.utils import timezone
        from apps.crm.models import Client
        from apps.deals.models import Deal
        from apps.realty.models import Building, Project, Property

        role = self.user.profile.roles.first()
        role.permissions.add(*Permission.objects.filter(action='VIEW', resource='DEAL', scope='OWN'))
        project = Project.objects.create(name='ЖК', address='Адрес', company=self.company)
        building = Building.objects.create(project=project, name='1', floors_count=9)
        prop = Property.objects.create(building=building, property_type='APARTMENT', unit_number='5',
                                       floor=2, area=Decimal('40'), price=Decimal('100'))
        client = Client.objects.create(full_name='Клиент', company=self.company, created_by=self.user)
        deal = Deal.objects.create(company=self.company, client=client, property=prop, created_by=self.user,
                                   booking_end_date=timezone.now() + timedelta(days=5),
                                   initial_price=Decimal('100'), initial_price_per_sqm=Decimal('2'))

        response = self.client.get(f'/api/deals/{deal.id}/available-templates/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ids(response), {self.tpl_shared.id, self.tpl_own.id})

    def test_shared_records_are_read_only_for_non_admin(self):
        # Изменить и удалить общесистемную запись может только администратор
        response = self.client.patch(f'/api/templates/{self.tpl_shared.id}/', {'name': 'x'})
        self.assertIn(response.status_code, (403, 404))
        response = self.client.delete(f'/api/finances/beneficiary-accounts/{self.acc_shared.id}/')
        self.assertIn(response.status_code, (403, 404))

    def test_no_permission_no_shared_records(self):
        stranger = User.objects.create_user('nobody', password='pass-for-tests')
        profile, _ = UserProfile.objects.get_or_create(user=stranger)
        profile.company = self.company
        profile.save()
        api = APIClient()
        api.force_authenticate(User.objects.get(pk=stranger.pk))
        self.assertEqual(api.get('/api/templates/').status_code, 403)


class InitPermissionsSyncGuardTests(TestCase):
    """--sync-roles не трогает роли, заведённые вручную с кодом типовой роли."""

    def test_custom_role_with_template_code_is_not_overwritten(self):
        call_command('init_permissions', stdout=_io.StringIO())
        Role.objects.filter(code='MANAGER').delete()
        custom = Role.objects.create(name='Наш менеджер', code='MANAGER', is_system=False)
        own_rights = list(Permission.objects.filter(action='VIEW', resource='CLIENT', scope='COMPANY'))
        custom.permissions.set(own_rights)

        out = _io.StringIO()
        call_command('init_permissions', sync_roles=True, stdout=out)

        custom.refresh_from_db()
        self.assertEqual(list(custom.permissions.all()), own_rights)
        self.assertIn('заведена вручную', out.getvalue())

    def test_system_role_is_still_synced(self):
        call_command('init_permissions', stdout=_io.StringIO())
        role = Role.objects.get(code='DEPARTMENT_MANAGER')
        role.permissions.clear()

        call_command('init_permissions', sync_roles=True, stdout=_io.StringIO())

        self.assertTrue(role.permissions.exists())


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)
class TypicalRolesScheduleReferencesTests(TestCase):
    """Менеджер и руководитель отдела видят типы платежей и счета для графика."""

    def test_schedule_references_are_readable(self):
        call_command('init_permissions', stdout=_io.StringIO())
        company = Company.objects.create(name='Справочники')
        for code in ('MANAGER', 'DEPARTMENT_MANAGER'):
            user = User.objects.create_user(f'u_{code.lower()}', password='pass-for-tests')
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.company = company
            profile.save()
            profile.roles.set([Role.objects.get(code=code)])
            api = APIClient()
            api.force_authenticate(User.objects.get(pk=user.pk))
            for url in ('/api/finances/payment-types/', '/api/finances/beneficiary-accounts/'):
                self.assertEqual(api.get(url).status_code, 200, (code, url))
            # Изменять справочники эти роли по-прежнему не могут
            self.assertEqual(api.post('/api/finances/payment-types/', {'name': 'X'}).status_code, 403, code)


class InitPermissionsTypicalRolesTests(TestCase):
    """Типовые роли создаются только при первичной установке или по ключу."""

    TYPICAL = {'SYSTEM_ADMIN', 'COMPANY_ADMIN', 'DEPARTMENT_MANAGER', 'MANAGER', 'VIEWER'}

    def test_fresh_install_gets_typical_roles(self):
        call_command('init_permissions', stdout=_io.StringIO())
        self.assertEqual(set(Role.objects.values_list('code', flat=True)), self.TYPICAL)

    def test_existing_roles_get_no_duplicates(self):
        # Как на проде: свои роли уже заведены, после обновления запускают команду
        Role.objects.create(name='Администратор', code='ADMINISTRATOR', is_system=False)
        Role.objects.create(name='Руководитель', code='RUKOVODITEL', is_system=False)
        out = _io.StringIO()

        call_command('init_permissions', stdout=out)

        self.assertEqual(set(Role.objects.values_list('code', flat=True)), {'ADMINISTRATOR', 'RUKOVODITEL'})
        # Разрешения на новые ресурсы при этом создаются
        self.assertTrue(Permission.objects.filter(resource='EXCHANGE_RATE').exists())
        self.assertIn('--with-roles', out.getvalue())

    def test_with_roles_creates_missing_typical_roles(self):
        Role.objects.create(name='Руководитель', code='RUKOVODITEL', is_system=False)

        call_command('init_permissions', with_roles=True, stdout=_io.StringIO())

        self.assertEqual(set(Role.objects.values_list('code', flat=True)), self.TYPICAL | {'RUKOVODITEL'})

    def test_setup_admin_works_without_system_admin_role(self):
        # На проде типовой роли SYSTEM_ADMIN нет — полный доступ даёт признак профиля
        Role.objects.create(name='Администратор', code='ADMINISTRATOR', is_system=False)
        get_user_model().objects.create_user('boss', password='pass-for-tests')

        call_command('setup_admin_permissions', username='boss', stdout=_io.StringIO())

        self.assertTrue(UserProfile.objects.get(user__username='boss').is_system_admin)
