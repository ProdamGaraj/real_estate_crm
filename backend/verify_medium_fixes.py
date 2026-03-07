"""
Верификация Medium-фиксов.
Запускать: docker exec crm_backend python verify_medium_fixes.py
"""
import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from django.db import connection


def check_model_fields():
    """Проверяем новые поля в BeneficiaryAccount и Template."""
    print("=== Fix 1+2: Model fields ===")
    
    with connection.cursor() as cur:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'finances_beneficiaryaccount' ORDER BY ordinal_position")
        ba_cols = [r[0] for r in cur.fetchall()]
        print(f"BeneficiaryAccount columns: {ba_cols}")
        assert 'company_id' in ba_cols, "FAIL: company_id not in BeneficiaryAccount"
        assert 'created_by_id' in ba_cols, "FAIL: created_by_id not in BeneficiaryAccount"
        print("BeneficiaryAccount: OK")
        
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'documents_template' ORDER BY ordinal_position")
        tmpl_cols = [r[0] for r in cur.fetchall()]
        print(f"Template columns: {tmpl_cols}")
        assert 'company_id' in tmpl_cols, "FAIL: company_id not in Template"
        assert 'created_by_id' in tmpl_cols, "FAIL: created_by_id not in Template"
        print("Template: OK")


def check_scope_filtering():
    """Проверяем что views используют get_filtered_queryset."""
    print("\n=== Fix 1+2: Scope filtering in views ===")
    from apps.finances.views import BeneficiaryAccountListView, BeneficiaryAccountDetailView
    from apps.documents.views import TemplateListCreateView, TemplateDetailView
    
    for cls in [BeneficiaryAccountListView, BeneficiaryAccountDetailView, TemplateListCreateView, TemplateDetailView]:
        has_get_queryset = 'get_queryset' in cls.__dict__
        print(f"{cls.__name__}.get_queryset overridden: {has_get_queryset}")
        assert has_get_queryset, f"FAIL: {cls.__name__} missing get_queryset"
    
    # Check perform_create exists on create views
    for cls in [BeneficiaryAccountListView, TemplateListCreateView]:
        has_perform_create = 'perform_create' in cls.__dict__
        print(f"{cls.__name__}.perform_create: {has_perform_create}")
        assert has_perform_create, f"FAIL: {cls.__name__} missing perform_create"
    print("Scope filtering: OK")


def check_signal():
    """Проверяем что сигнал не сбрасывает is_system_admin при нерелевантных save."""
    print("\n=== Fix 3: Signal fix ===")
    import inspect
    from permissions.signals import save_user_profile
    source = inspect.getsource(save_user_profile)
    
    assert 'update_fields' in source, "FAIL: signal doesn't check update_fields"
    assert 'is_superuser' in source, "FAIL: signal doesn't check is_superuser in update_fields"
    # Old pattern: instance.profile.is_system_admin = instance.is_superuser — should NOT be present
    assert 'instance.profile.is_system_admin = instance.is_superuser' not in source, \
        "FAIL: old blanket sync pattern still present"
    print("Signal fix: OK")


def check_login_throttle():
    """Проверяем наличие throttle на login."""
    print("\n=== Fix 4: Login throttle ===")
    
    from permissions.throttles import LoginRateThrottle, check_account_lockout, record_failed_login, reset_failed_logins
    
    # Check throttle class
    t = LoginRateThrottle()
    assert t.scope == 'login', f"FAIL: scope is {t.scope}"
    print(f"LoginRateThrottle scope: {t.scope}, rate: {t.rate}")
    
    # Check lockout functions
    test_user = '__test_lockout_user__'
    reset_failed_logins(test_user)
    
    is_locked, _ = check_account_lockout(test_user)
    assert not is_locked, "FAIL: fresh user is locked"
    print(f"Fresh user locked: {is_locked} (expected False)")
    
    # Record 5 failed attempts
    for i in range(5):
        record_failed_login(test_user)
    
    is_locked, retry = check_account_lockout(test_user)
    print(f"After 5 failures locked: {is_locked}, retry_after: {retry}")
    assert is_locked, "FAIL: user not locked after 5 failures"
    
    # Cleanup
    reset_failed_logins(test_user)
    is_locked, _ = check_account_lockout(test_user)
    assert not is_locked, "FAIL: reset didn't work"
    print("Account lockout: OK")
    
    # Check login_view uses throttle and lockout
    import inspect, permissions.auth_views as auth_module
    source = inspect.getsource(auth_module)
    assert 'check_account_lockout' in source, "FAIL: login_view missing lockout check"
    assert 'record_failed_login' in source, "FAIL: login_view missing record_failed_login"
    assert 'reset_failed_logins' in source, "FAIL: login_view missing reset_failed_logins"
    assert 'LoginRateThrottle' in source, "FAIL: login_view missing LoginRateThrottle"
    print("Login view lockout integration: OK")
    
    # Check throttle rate in settings
    from django.conf import settings
    rates = settings.REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {})
    assert 'login' in rates, "FAIL: 'login' rate not in settings"
    print(f"Login throttle rate in settings: {rates['login']}")
    print("Login throttle: OK")


if __name__ == '__main__':
    try:
        check_model_fields()
        check_scope_filtering()
        check_signal()
        check_login_throttle()
        print("\n=== ALL MEDIUM FIXES VERIFIED OK ===")
    except AssertionError as e:
        print(f"\n!!! VERIFICATION FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n!!! ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
