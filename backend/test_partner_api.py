"""
Тестирование партнёрского API - все сценарии
"""
import os
import sys
import django
import requests

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
django.setup()

from permissions.models import PartnerAPIKey

BASE_URL = "http://localhost:8000/api/public"

def print_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} | {name}")
    if details:
        print(f"       {details}")

def test_api():
    from permissions.models import PartnerAPIKey
    
    # Получаем тестовый ключ
    key = PartnerAPIKey.objects.first()
    if not key:
        print("❌ Нет API-ключей для тестирования")
        return
    
    API_KEY = key.key
    headers = {"X-API-Key": API_KEY}
    
    print("=" * 60)
    print("ТЕСТИРОВАНИЕ ПАРТНЁРСКОГО API")
    print(f"API-ключ: {API_KEY[:16]}...")
    print(f"Scopes: {key.allowed_scopes}")
    print("=" * 60)
    
    # ========================================
    # 1. ТЕСТЫ БЕЗ API-КЛЮЧА (должны вернуть 401 или 403)
    # ========================================
    print("\n📋 1. ЗАПРОСЫ БЕЗ API-КЛЮЧА (ожидаем отказ)")
    print("-" * 40)
    
    endpoints = [
        ("GET", "/projects/", "Список проектов"),
        ("GET", "/buildings/1/", "Детали здания"),
        ("GET", "/buildings/1/layouts/", "Планировки"),
        ("POST", "/applications/", "Создание заявки"),
    ]
    
    for method, endpoint, name in endpoints:
        try:
            if method == "GET":
                r = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
            else:
                r = requests.post(f"{BASE_URL}{endpoint}", json={}, timeout=5)
            # 401 или 403 - оба означают отказ в доступе
            print_test(f"{name} без ключа", r.status_code in [401, 403], f"Status: {r.status_code}")
        except Exception as e:
            print_test(f"{name} без ключа", False, str(e))
    
    # ========================================
    # 2. ТЕСТЫ С НЕВЕРНЫМ API-КЛЮЧОМ (должны вернуть 401 или 403)
    # ========================================
    print("\n📋 2. ЗАПРОСЫ С НЕВЕРНЫМ API-КЛЮЧОМ (ожидаем отказ)")
    print("-" * 40)
    
    bad_headers = {"X-API-Key": "invalid_key_12345"}
    
    for method, endpoint, name in endpoints:
        try:
            if method == "GET":
                r = requests.get(f"{BASE_URL}{endpoint}", headers=bad_headers, timeout=5)
            else:
                r = requests.post(f"{BASE_URL}{endpoint}", headers=bad_headers, json={}, timeout=5)
            print_test(f"{name} с неверным ключом", r.status_code in [401, 403], f"Status: {r.status_code}")
        except Exception as e:
            print_test(f"{name} с неверным ключом", False, str(e))
    
    # ========================================
    # 3. ТЕСТЫ С ВАЛИДНЫМ API-КЛЮЧОМ
    # ========================================
    print("\n📋 3. ЗАПРОСЫ С ВАЛИДНЫМ API-КЛЮЧОМ")
    print("-" * 40)
    
    # GET /projects/ - список проектов
    try:
        r = requests.get(f"{BASE_URL}/projects/", headers=headers, timeout=5)
        print_test("GET /projects/", r.status_code == 200, f"Status: {r.status_code}, Count: {len(r.json()) if r.status_code == 200 else 'N/A'}")
        projects = r.json() if r.status_code == 200 else []
    except Exception as e:
        print_test("GET /projects/", False, str(e))
        projects = []
    
    # GET /projects/{id}/ - детали проекта
    if projects:
        project_id = projects[0].get('id')
        try:
            r = requests.get(f"{BASE_URL}/projects/{project_id}/", headers=headers, timeout=5)
            print_test(f"GET /projects/{project_id}/", r.status_code == 200, f"Status: {r.status_code}")
            project_data = r.json() if r.status_code == 200 else {}
        except Exception as e:
            print_test(f"GET /projects/{project_id}/", False, str(e))
            project_data = {}
    else:
        print_test("GET /projects/{id}/", False, "Нет проектов для тестирования")
        project_data = {}
    
    # Получаем ID здания для тестов
    building_id = None
    if project_data.get('buildings'):
        building_id = project_data['buildings'][0].get('id')
    
    # GET /buildings/{id}/ - детали здания
    if building_id:
        try:
            r = requests.get(f"{BASE_URL}/buildings/{building_id}/", headers=headers, timeout=5)
            print_test(f"GET /buildings/{building_id}/", r.status_code == 200, f"Status: {r.status_code}")
        except Exception as e:
            print_test(f"GET /buildings/{building_id}/", False, str(e))
        
        # GET /buildings/{id}/layouts/ - планировки
        try:
            r = requests.get(f"{BASE_URL}/buildings/{building_id}/layouts/", headers=headers, timeout=5)
            print_test(f"GET /buildings/{building_id}/layouts/", r.status_code == 200, f"Status: {r.status_code}, Count: {len(r.json()) if r.status_code == 200 else 'N/A'}")
        except Exception as e:
            print_test(f"GET /buildings/{building_id}/layouts/", False, str(e))
    else:
        print_test("GET /buildings/{id}/", False, "Нет зданий для тестирования")
        print_test("GET /buildings/{id}/layouts/", False, "Нет зданий для тестирования")
    
    # GET несуществующего проекта
    try:
        r = requests.get(f"{BASE_URL}/projects/99999/", headers=headers, timeout=5)
        print_test("GET /projects/99999/ (не существует)", r.status_code == 404, f"Status: {r.status_code}")
    except Exception as e:
        print_test("GET /projects/99999/", False, str(e))
    
    # ========================================
    # 4. ТЕСТ СОЗДАНИЯ ЗАЯВКИ
    # ========================================
    print("\n📋 4. СОЗДАНИЕ ЗАЯВКИ (POST /applications/)")
    print("-" * 40)
    
    # Валидные данные
    valid_application = {
        "full_name": "Тестовый Партнёр",
        "phone_number": "+998901234599",
        "source": "INTERNET",
        "notes": "Тестовая заявка от партнёра"
    }
    
    try:
        r = requests.post(f"{BASE_URL}/applications/", headers=headers, json=valid_application, timeout=5)
        print_test("POST /applications/ (валидные данные)", r.status_code == 201, f"Status: {r.status_code}, Response: {r.json()}")
    except Exception as e:
        print_test("POST /applications/ (валидные данные)", False, str(e))
    
    # Невалидные данные (без обязательных полей)
    invalid_application = {"notes": "только комментарий"}
    try:
        r = requests.post(f"{BASE_URL}/applications/", headers=headers, json=invalid_application, timeout=5)
        print_test("POST /applications/ (невалидные данные)", r.status_code == 400, f"Status: {r.status_code}")
    except Exception as e:
        print_test("POST /applications/ (невалидные данные)", False, str(e))
    
    # ========================================
    # 5. ТЕСТ ОГРАНИЧЕНИЯ ПО SCOPES
    # ========================================
    print("\n📋 5. ТЕСТ ОГРАНИЧЕНИЯ ПО SCOPES")
    print("-" * 40)
    
    # Создаём ключ с ограниченными scopes
    from permissions.models import PartnerAPIKey
    limited_key = PartnerAPIKey.objects.create(
        name="Test Limited Key",
        description="Только для теста",
        allowed_scopes=["VIEW_PROJECTS"]  # Только проекты!
    )
    limited_headers = {"X-API-Key": limited_key.key}
    
    # Должен работать - VIEW_PROJECTS
    try:
        r = requests.get(f"{BASE_URL}/projects/", headers=limited_headers, timeout=5)
        print_test("Ключ с VIEW_PROJECTS -> GET /projects/", r.status_code == 200, f"Status: {r.status_code}")
    except Exception as e:
        print_test("Ключ с VIEW_PROJECTS -> GET /projects/", False, str(e))
    
    # Должен вернуть 403 - нет VIEW_BUILDINGS
    if building_id:
        try:
            r = requests.get(f"{BASE_URL}/buildings/{building_id}/", headers=limited_headers, timeout=5)
            print_test("Ключ БЕЗ VIEW_BUILDINGS -> GET /buildings/{id}/", r.status_code == 403, f"Status: {r.status_code}")
        except Exception as e:
            print_test("Ключ БЕЗ VIEW_BUILDINGS -> GET /buildings/{id}/", False, str(e))
    
    # Должен вернуть 403 - нет VIEW_LAYOUTS
    if building_id:
        try:
            r = requests.get(f"{BASE_URL}/buildings/{building_id}/layouts/", headers=limited_headers, timeout=5)
            print_test("Ключ БЕЗ VIEW_LAYOUTS -> GET /buildings/{id}/layouts/", r.status_code == 403, f"Status: {r.status_code}")
        except Exception as e:
            print_test("Ключ БЕЗ VIEW_LAYOUTS -> GET /buildings/{id}/layouts/", False, str(e))
    
    # Должен вернуть 403 - нет CREATE_APPLICATION
    try:
        r = requests.post(f"{BASE_URL}/applications/", headers=limited_headers, json=valid_application, timeout=5)
        print_test("Ключ БЕЗ CREATE_APPLICATION -> POST /applications/", r.status_code == 403, f"Status: {r.status_code}")
    except Exception as e:
        print_test("Ключ БЕЗ CREATE_APPLICATION -> POST /applications/", False, str(e))
    
    # Удаляем тестовый ключ
    limited_key.delete()
    print("       (тестовый ключ удалён)")
    
    # ========================================
    # 6. ТЕСТ ДЕАКТИВИРОВАННОГО КЛЮЧА
    # ========================================
    print("\n📋 6. ТЕСТ ДЕАКТИВИРОВАННОГО КЛЮЧА")
    print("-" * 40)
    
    # Создаём деактивированный ключ
    inactive_key = PartnerAPIKey.objects.create(
        name="Test Inactive Key",
        is_active=False,
        allowed_scopes=["VIEW_PROJECTS", "VIEW_BUILDINGS", "VIEW_LAYOUTS", "CREATE_APPLICATION"]
    )
    inactive_headers = {"X-API-Key": inactive_key.key}
    
    try:
        r = requests.get(f"{BASE_URL}/projects/", headers=inactive_headers, timeout=5)
        print_test("Деактивированный ключ -> GET /projects/", r.status_code in [401, 403], f"Status: {r.status_code}")
    except Exception as e:
        print_test("Деактивированный ключ -> GET /projects/", False, str(e))
    
    inactive_key.delete()
    print("       (тестовый ключ удалён)")
    
    # ========================================
    # 7. ТЕСТ ИСТЁКШЕГО КЛЮЧА
    # ========================================
    print("\n📋 7. ТЕСТ ИСТЁКШЕГО КЛЮЧА")
    print("-" * 40)
    
    from django.utils import timezone
    from datetime import timedelta
    
    expired_key = PartnerAPIKey.objects.create(
        name="Test Expired Key",
        expires_at=timezone.now() - timedelta(days=1),  # Истёк вчера
        allowed_scopes=["VIEW_PROJECTS"]
    )
    expired_headers = {"X-API-Key": expired_key.key}
    
    try:
        r = requests.get(f"{BASE_URL}/projects/", headers=expired_headers, timeout=5)
        print_test("Истёкший ключ -> GET /projects/", r.status_code in [401, 403], f"Status: {r.status_code}")
    except Exception as e:
        print_test("Истёкший ключ -> GET /projects/", False, str(e))
    
    expired_key.delete()
    print("       (тестовый ключ удалён)")
    
    # ========================================
    # ИТОГО
    # ========================================
    print("\n" + "=" * 60)
    print("ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print("=" * 60)


if __name__ == "__main__":
    test_api()
