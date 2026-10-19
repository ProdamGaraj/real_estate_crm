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


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)
class UserProfileEditTests(TestCase):
    """
    Правка сотрудника. Имя, фамилия и e-mail молча не сохранялись (поле user было
    только для чтения), а администратору компании отказывало в любой правке:
    форма всегда присылала флаг системного администратора.
    """

    def setUp(self):
        call_command('init_permissions', stdout=_io.StringIO())
        self.company = Company.objects.create(name='Андижан', code='AND')
        self.root = self._user('root', system_admin=True)
        company_admin_role = Role.objects.create(name='Админ компании', code='CA_TEST')
        company_admin_role.permissions.set(Permission.objects.filter(resource='USER', scope='COMPANY'))
        self.admin = self._user('boss', roles=[company_admin_role])
        self.employee = self._user('mpp')

    def _user(self, username, system_admin=False, roles=()):
        user = User.objects.create_user(username, password='pass-for-tests', first_name='Старое', last_name='Имя')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company = self.company
        profile.is_system_admin = system_admin
        profile.save()
        profile.roles.set(roles)
        return User.objects.get(pk=user.pk)

    def patch(self, actor, target, data):
        api = APIClient()
        api.force_authenticate(actor)
        return api.patch(f'/api/permissions/user-profiles/{target.profile.id}/', data, format='json')

    def test_system_admin_changes_name_and_email(self):
        response = self.patch(self.root, self.employee, {
            'first_name': ' Шохиста ', 'last_name': 'Арипджанова', 'email': 'sh@example.com',
            'is_system_admin': False, 'role_ids': [],
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.employee.refresh_from_db()
        self.assertEqual((self.employee.first_name, self.employee.last_name, self.employee.email),
                         ('Шохиста', 'Арипджанова', 'sh@example.com'))

    def test_company_admin_edits_employee_with_unchanged_flag(self):
        # Форма присылает is_system_admin=false — это не попытка его менять
        response = self.patch(self.admin, self.employee, {
            'phone': '+998901112233', 'last_name': 'Новая', 'is_system_admin': False, 'role_ids': [],
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.last_name, 'Новая')
        self.assertEqual(self.employee.profile.phone, '+998901112233')

    def test_company_admin_cannot_grant_system_admin(self):
        response = self.patch(self.admin, self.employee, {'is_system_admin': True, 'role_ids': []})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(UserProfile.objects.get(user=self.employee).is_system_admin)

    def test_system_admin_grants_flag_but_not_removes_own(self):
        self.assertEqual(self.patch(self.root, self.employee, {'is_system_admin': True, 'role_ids': []}).status_code, 200)
        self.assertTrue(UserProfile.objects.get(user=self.employee).is_system_admin)
        response = self.patch(self.root, self.root, {'is_system_admin': False, 'role_ids': []})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(UserProfile.objects.get(user=self.root).is_system_admin)


from django.core.cache import cache as _cache
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PermissionLog


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)
class SelfServiceProfileTests(TestCase):
    """
    Сотрудник сам меняет имя и пароль из меню профиля. Роли, компанию, флаги
    и e-mail так не поменять; смена пароля выбивает другие устройства.
    """

    def setUp(self):
        _cache.clear()  # счётчики лимита запросов живут в кеше
        self.company = Company.objects.create(name='Андижан', code='AND')
        self.other_company = Company.objects.create(name='Ташкент', code='TAS')
        self.user = User.objects.create_user('mpp', password='Old-pass-2026', first_name='Старое',
                                             last_name='Имя', email='mpp@example.com')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.company = self.company
        profile.save()
        # Заново из базы: у созданного объекта закеширован профиль из сигнала,
        # ещё без компании (в работе пользователь загружается на каждый запрос)
        self.user = User.objects.get(pk=self.user.pk)
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def change_password(self, current, new, confirm=None):
        return self.api.post('/api/permissions/me/change-password/', {
            'current_password': current, 'new_password': new, 'confirm_password': confirm or new,
        }, format='json')

    def test_user_changes_own_name(self):
        response = self.api.patch('/api/permissions/me/', {'first_name': ' Шохиста ', 'last_name': 'Арипджанова'},
                                  format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertEqual((self.user.first_name, self.user.last_name), ('Шохиста', 'Арипджанова'))
        log = PermissionLog.objects.get(action='PROFILE_UPDATE')
        self.assertEqual((log.details['old_name'], log.details['new_name']), ('Имя Старое', 'Арипджанова Шохиста'))

    def test_blank_name_is_rejected(self):
        response = self.api.patch('/api/permissions/me/', {'first_name': '  '}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('first_name', response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Старое')

    def test_cannot_change_email_roles_company_or_flags(self):
        role = Role.objects.create(name='Админ', code='ADM_TEST')
        response = self.api.patch('/api/permissions/me/', {
            'email': 'new@example.com', 'is_system_admin': True, 'role_ids': [role.id],
            'company_id': self.other_company.id, 'is_active': False,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.user.email, 'mpp@example.com')
        self.assertFalse(profile.is_system_admin)
        self.assertEqual(profile.company, self.company)
        self.assertFalse(profile.roles.exists())
        self.assertTrue(profile.is_active)

    def test_password_change_keeps_this_session_and_logs_out_other_devices(self):
        other_device = RefreshToken.for_user(self.user)
        response = self.change_password('Old-pass-2026', 'Novyi-parol-2026')
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Novyi-parol-2026'))
        self.assertTrue(PermissionLog.objects.filter(action='PASSWORD_CHANGE', user=self.user).exists())

        # Текущий сеанс получил новый access-токен и новый refresh в cookie
        self.assertIn('access', response.data)
        this_device = APIClient()
        this_device.cookies['crm_refresh'] = response.cookies['crm_refresh'].value
        self.assertEqual(this_device.post('/api/token/refresh/', {}, format='json').status_code, 200)

        # Другое устройство со старым refresh-токеном выходит из системы
        stale = APIClient().post('/api/token/refresh/', {'refresh': str(other_device)}, format='json')
        self.assertEqual(stale.status_code, 401)

    def test_wrong_current_password_is_rejected(self):
        response = self.change_password('not-my-password', 'Novyi-parol-2026')
        self.assertEqual(response.status_code, 400)
        self.assertIn('current_password', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Old-pass-2026'))

    def test_weak_or_mismatched_password_is_rejected(self):
        weak = self.change_password('Old-pass-2026', '12345678')
        self.assertEqual(weak.status_code, 400)
        self.assertIn('new_password', weak.data)
        mismatch = self.change_password('Old-pass-2026', 'Novyi-parol-2026', 'Drugoi-parol-2026')
        self.assertEqual(mismatch.status_code, 400)
        self.assertIn('confirm_password', mismatch.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Old-pass-2026'))

    def test_guessing_current_password_is_throttled(self):
        for _ in range(5):
            self.assertEqual(self.change_password('guess', 'Novyi-parol-2026').status_code, 400)
        self.assertEqual(self.change_password('Old-pass-2026', 'Novyi-parol-2026').status_code, 429)


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
)
class AdminBlockAndPasswordTests(TestCase):
    """
    Блокировка и смена пароля администратором выбивают сотрудника:
    блокировка — сразу, смена пароля — со всех устройств.
    """

    def setUp(self):
        _cache.clear()
        call_command('init_permissions', stdout=_io.StringIO())
        self.company = Company.objects.create(name='Андижан', code='AND')
        role = Role.objects.create(name='Админ компании', code='CA_TEST')
        role.permissions.set(Permission.objects.filter(resource='USER', scope='COMPANY'))
        self.admin = self._user('boss', roles=[role])
        self.employee = self._user('mpp')
        self.admin_api = APIClient()
        self.admin_api.force_authenticate(self.admin)

    def _user(self, username, roles=()):
        user = User.objects.create_user(username, password='Old-pass-2026')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.company = self.company
        profile.save()
        profile.roles.set(roles)
        return User.objects.get(pk=user.pk)

    def test_blocked_user_is_logged_out_at_once(self):
        access = str(RefreshToken.for_user(self.employee).access_token)
        employee_api = APIClient(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(employee_api.get('/api/permissions/me/').status_code, 200)

        response = self.admin_api.post(f'/api/permissions/user-profiles/{self.employee.profile.id}/ban/')
        self.assertEqual(response.status_code, 200, response.data)
        # Access-токен ещё не истёк, но заблокированного он больше не пускает
        self.assertEqual(employee_api.get('/api/permissions/me/').status_code, 401)

    def test_admin_password_change_logs_user_out_everywhere(self):
        session = RefreshToken.for_user(self.employee)
        response = self.admin_api.post(
            f'/api/permissions/user-profiles/{self.employee.profile.id}/change_password/',
            {'new_password': 'Novyi-parol-2026', 'confirm_password': 'Novyi-parol-2026'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        stale = APIClient().post('/api/token/refresh/', {'refresh': str(session)}, format='json')
        self.assertEqual(stale.status_code, 401)
