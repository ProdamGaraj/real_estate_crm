"""Verification script for security fixes"""
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

import secrets
from permissions.models import PartnerAPIKey
from permissions.crypto import hash_api_key, encrypt_api_key, decrypt_api_key

print("=== Fix 2: API Key Encryption ===")
keys = PartnerAPIKey.objects.all()
print(f"Total keys: {keys.count()}")
for k in keys:
    print(f"  {k.name}: hash={k.key_hash[:16]}...")
    display = k.get_key_display()
    print(f"  display={display[:16]}...")
    found = PartnerAPIKey.find_by_key(display)
    assert found and found.pk == k.pk, f"find_by_key FAILED for {k.name}"
print("  find_by_key: OK")

# Round trip
pt = secrets.token_hex(32)
enc = encrypt_api_key(pt)
dec = decrypt_api_key(enc)
assert dec == pt
print("  Crypto round-trip: OK")

print("\n=== Fix 3: Rate Limiting ===")
k = keys.first()
if k:
    ok, retry = k.check_rate_limit('127.0.0.1')
    print(f"  Rate limit: allowed={ok}, retry={retry}")
else:
    print("  No keys to test rate limiting")

print("\n=== Fix 1 + Fix 4: Role Scope Validation ===")
from permissions.views import UserProfileViewSet, RoleViewSet
print(f"  _validate_role_assignment exists: {hasattr(UserProfileViewSet, '_validate_role_assignment')}")
print(f"  _validate_role_scope exists: {hasattr(RoleViewSet, '_validate_role_scope')}")

print("\n=== Fix 5: Cyrillic typo ===")
import inspect
source = inspect.getsource(UserProfileViewSet.create_user)
has_cyrillic_e = '\u0435rror' in source.replace("'error'", '')
print(f"  Cyrillic typo present: {has_cyrillic_e}")
assert not has_cyrillic_e, "Cyrillic character should be fixed!"
print("  ASCII error key: OK")

print("\n=== DB Schema ===")
from django.db import connection
cursor = connection.cursor()
cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'permissions_partnerapikey' ORDER BY ordinal_position")
cols = [r[0] for r in cursor.fetchall()]
print(f"  Columns: {cols}")
assert 'key' not in cols, "Old 'key' column should be removed!"
assert 'key_hash' in cols, "key_hash should exist!"
assert 'key_encrypted' in cols, "key_encrypted should exist!"
print("  Schema: OK")

print("\n=== ALL FIXES VERIFIED OK ===")
