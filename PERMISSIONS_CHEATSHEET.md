# ШПАРГАЛКА: Система ролей и разрешений

## БЫСТРЫЙ СПРАВОЧНИК

### Иерархия доступа (от высшего к низшему)
```
SYSTEM → COMPANY → DEPARTMENT → OWN
   ↓         ↓           ↓        ↓
  Всё    Компания     Отдел    Своё
```

### Проверка прав: кто имеет полный доступ
- `user.is_superuser` → ВСЁ
- `user.profile.is_system_admin` → ВСЁ
- Роль с `scope=SYSTEM` → все объекты ресурса

---

## МОДЕЛИ

### Permission (Разрешение)
```python
# Формат кода: ACTION_RESOURCE_SCOPE
# Пример: VIEW_CLIENT_COMPANY

# Actions (действия):
VIEW, ADD, EDIT, DELETE, EXPORT, IMPORT, APPROVE, ASSIGN
EDIT_IN_PROGRESS, REOPEN, FORCE_EDIT, DELETE_LOG

# Resources (ресурсы):
CLIENT, APPLICATION, MEETING          # CRM
PROJECT, BUILDING, BUILDING_TYPE      # Realty  
PROPERTY, LAYOUT, DISCOUNT            # Realty
DEAL                                  # Deals
PAYMENT, PAYMENT_TYPE, BENEFICIARY_ACCOUNT  # Finances
TEMPLATE                              # Documents
REPORT, PLAN                          # Reports
TASK, TASK_LOG                        # Tasks
USER, ROLE, PERMISSION                # Permissions
COMPANY, DEPARTMENT, PARTNER_API_KEY  # Permissions
DASHBOARD, SETTINGS                   # System

# Scopes (области видимости):
OWN        # Только свои (created_by == user)
DEPARTMENT # Объекты своего отдела
COMPANY    # Объекты своей компании
SYSTEM     # Все объекты
```

### Role (Роль)
```python
# Категории:
ADMINISTRATIVE, MANAGEMENT, OPERATIONAL, READONLY, CUSTOM

# Scope роли:
SYSTEM, COMPANY, DEPARTMENT, OWN

# Связи:
permissions: M2M → Permission
companies: M2M → Company
```

### UserProfile (Профиль)
```python
user: OneToOne → User
company: FK → Company
department: FK → Department  
roles: M2M → Role
is_system_admin: bool  # Полный доступ!
```

---

## КЛЮЧЕВЫЕ ФУНКЦИИ

### backends.py

```python
# Фильтрация queryset по правам
get_filtered_queryset(user, queryset, resource_type) → QuerySet

# Проверка права на действие
can_user_perform_action(user, action, resource_type, obj=None, scope=None) → bool

# Определение scope объекта относительно пользователя
_determine_scope(user, obj) → 'OWN'|'DEPARTMENT'|'COMPANY'|'SYSTEM'

# Проверка принадлежности объекта к scope
_is_object_in_scope(user, obj, scope) → bool
```

### Логика фильтрации CLIENT (особая!)
```python
# Клиент виден если есть заявка от:
if COMPANY scope:
    applications__created_by__profile__company == user.profile.company
if DEPARTMENT scope:
    applications__created_by__profile__department == user.profile.department
if OWN scope:
    applications__created_by == user
```

### UserProfile методы
```python
profile.has_permission(permission_code) → bool
profile.has_permission_for_action(action, resource, scope=None) → bool
profile.get_all_permissions() → QuerySet[Permission]
profile.get_accessible_companies() → QuerySet[Company]
profile.get_accessible_departments() → QuerySet[Department]
```

---

## HTTP → ACTION MAPPING

```python
GET    → VIEW
POST   → ADD
PUT    → EDIT
PATCH  → EDIT
DELETE → DELETE
```

---

## PERMISSION КЛАССЫ (DRF)

### Базовый класс
```python
BaseResourcePermission
    resource_type = 'RESOURCE_NAME'
    has_permission(request, view) → bool      # Для списков
    has_object_permission(request, view, obj) → bool  # Для объектов
```

### Доступные классы
```python
ClientPermission, ApplicationPermission, MeetingPermission
ProjectPermission, BuildingPermission, BuildingTypePermission
PropertyPermission, LayoutPermission, DiscountPermission
DealPermission, PaymentPermission, PaymentTypePermission
BeneficiaryAccountPermission, TemplatePermission
ReportPermission, PlanPermission, TaskPermission
UserPermission, RolePermission, PermissionManagementPermission
CompanyPermission, DepartmentPermission
DashboardPermission, SettingsPermission
IsSystemAdmin, IsCompanyAdmin, IsDepartmentManager
```

### Partner API Permissions
```python
HasValidPartnerAPIKey          # Базовый класс
HasPartnerViewProjectsScope    # VIEW_PROJECTS
HasPartnerViewBuildingsScope   # VIEW_BUILDINGS
HasPartnerViewLayoutsScope     # VIEW_LAYOUTS
HasPartnerCreateApplicationScope  # CREATE_APPLICATION
```

---

## API ENDPOINTS

### Permissions модуль
```
/api/permissions/companies/              GET, POST
/api/permissions/companies/{id}/         GET, PUT, PATCH, DELETE
/api/permissions/companies/accessible/   GET

/api/permissions/departments/            GET, POST
/api/permissions/departments/{id}/       GET, PUT, PATCH, DELETE
/api/permissions/departments/accessible/ GET

/api/permissions/permissions/            GET (ReadOnly)
/api/permissions/permissions/grouped_by_resource/ GET

/api/permissions/roles/                  GET, POST
/api/permissions/roles/{id}/             GET, PUT, PATCH, DELETE
/api/permissions/roles/{id}/assign_permissions/ POST
/api/permissions/roles/{id}/users/       GET

/api/permissions/user-profiles/          GET, POST
/api/permissions/user-profiles/{id}/     GET, PUT, PATCH, DELETE
/api/permissions/user-profiles/create_user/ POST
/api/permissions/user-profiles/{id}/permissions/ GET
/api/permissions/user-profiles/{id}/check_permission/ POST

/api/permissions/me/                     GET, PATCH
/api/permissions/stats/                  GET (IsCompanyAdmin)
/api/permissions/logs/                   GET (IsSystemAdmin)

/api/permissions/partner-api-keys/       GET, POST
/api/permissions/partner-api-keys/{id}/  GET, PUT, PATCH, DELETE
/api/permissions/partner-api-keys/{id}/regenerate/ POST
/api/permissions/partner-api-keys/{id}/toggle_active/ POST
```

### Auth endpoints
```
/api/permissions/auth/login/             POST
/api/permissions/auth/logout/            POST
/api/permissions/auth/password-reset/    POST
/api/permissions/auth/password-reset/confirm/ POST
```

---

## TASKS: СПЕЦИАЛЬНЫЕ ДЕЙСТВИЯ

```python
# Действия над задачами
POST /tasks/{id}/start/     # NEW → IN_PROGRESS
POST /tasks/{id}/complete/  # → COMPLETED
POST /tasks/{id}/cancel/    # → CANCELLED
POST /tasks/{id}/reopen/    # CANCELLED → RETURNED (требует REOPEN право)

# Логи задач
GET /tasks/{id}/logs/
DELETE /tasks/{id}/logs/{log_id}/  # Требует DELETE_LOG право
```

---

## PARTNER API KEYS

### Проверки при запросе
1. Наличие ключа в `X-API-Key` header
2. Ключ существует в БД
3. `is_active == True`
4. `expires_at` не истёк
5. IP в белом списке (если настроен)
6. Требуемый scope есть в `allowed_scopes`

### Scopes
```python
VIEW_PROJECTS, VIEW_BUILDINGS, VIEW_LAYOUTS, CREATE_APPLICATION
```

---

## FRONTEND

### utils/permissions.ts
```typescript
hasPermission(user, action, resource, scope?) → boolean
hasAnyViewPermission(user, resource) → boolean
isSystemAdmin(user) → boolean
getMaxScope(user, action, resource) → ScopeType | null
```

### PermissionRoute компонент
```tsx
// Проверка конкретного права
<PermissionRoute action="VIEW" resource="SETTINGS">
  <SettingsPage />
</PermissionRoute>

// Проверка админа
<PermissionRoute requireAdmin>
  <AdminPage />
</PermissionRoute>
```

---

## ТЕСТОВЫЕ ПОЛЬЗОВАТЕЛИ

| Тип | Проверить |
|-----|-----------|
| superuser | Видит ВСЁ |
| is_system_admin | Видит ВСЁ |
| SYSTEM scope | Видит все объекты ресурса |
| COMPANY scope | Видит объекты своей компании |
| DEPARTMENT scope | Видит объекты своего отдела |
| OWN scope | Видит только свои объекты |
| Без прав | Пустой список / 403 |

---

## ЧАСТЫЕ ОШИБКИ

| Ошибка | Причина |
|--------|---------|
| 401 Unauthorized | Не аутентифицирован / невалидный токен |
| 403 Forbidden | Нет разрешения на действие |
| 404 Not Found | Объект не найден ИЛИ нет доступа к нему |
| Пустой список | Нет VIEW права или фильтрация по scope |

---

## ЛОГИРОВАНИЕ

```python
# PermissionLog создаётся при:
- Изменении разрешений роли (assign_permissions)
- Создании пользователя (create_user)

# Поля лога:
user, action, entity_type, entity_id, details, ip_address, created_at
```

---

## БЫСТРЫЕ ПРОВЕРКИ

### Есть ли у пользователя право?
```python
# В коде:
can_user_perform_action(user, 'VIEW', 'CLIENT')

# Через API:
POST /api/permissions/user-profiles/{id}/check_permission/
{"action": "VIEW", "resource": "CLIENT", "scope": "COMPANY"}
```

### Какие права у пользователя?
```python
# В коде:
user.profile.get_all_permissions()

# Через API:
GET /api/permissions/user-profiles/{id}/permissions/
GET /api/permissions/me/  # Текущий пользователь
```

### Какие объекты видит пользователь?
```python
# В коде:
get_filtered_queryset(user, Client.objects.all(), 'CLIENT')
```
