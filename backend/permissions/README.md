# 🔐 Документация: Система ролей и разрешений

## 📋 Обзор системы

Продвинутая система управления доступом с поддержкой:
- ✅ **Иерархическая структура** организации (Система → Компания → Отдел)
- ✅ **Гранулярные разрешения** (Действие + Ресурс + Область видимости)
- ✅ **Гибкие роли** с комбинацией разрешений
- ✅ **Аудит** всех изменений разрешений

---

## 🏗️ Архитектура системы

### 1. **Компоненты системы**

```
┌─────────────────────────────────────────────────┐
│              Иерархия организации                │
├─────────────────────────────────────────────────┤
│  Система (SYSTEM)                               │
│    └── Компания (COMPANY)                       │
│          └── Отдел (DEPARTMENT)                 │
│                └── Сотрудники                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              Структура разрешений                │
├─────────────────────────────────────────────────┤
│  ДЕЙСТВИЕ + РЕСУРС + ОБЛАСТЬ_ВИДИМОСТИ          │
│  VIEW     CLIENT    OWN         → Мои клиенты   │
│  EDIT     DEAL      DEPARTMENT  → Сделки отдела │
│  DELETE   PROJECT   COMPANY     → Проекты компании│
│  ADD      USER      SYSTEM      → Все пользователи│
└─────────────────────────────────────────────────┘
```

### 2. **Модели данных**

#### Company (Компания)
```python
- name: Название
- code: Уникальный код
- is_active: Активна
```

#### Department (Отдел)
```python
- company: FK -> Company
- name: Название
- parent_department: FK -> self (для иерархии)
- is_active: Активен
```

#### Permission (Разрешение)
```python
- code: VIEW_CLIENT_OWN (автогенерация)
- action: VIEW, ADD, EDIT, DELETE, EXPORT, etc.
- resource: CLIENT, DEAL, PROJECT, etc.
- scope: OWN, DEPARTMENT, COMPANY, SYSTEM
```

#### Role (Роль)
```python
- name: Название роли
- level: SYSTEM_ADMIN, COMPANY_ADMIN, MANAGER, etc.
- permissions: M2M -> Permission
- is_system: Системная роль (нельзя изменять)
```

#### UserProfile (Профиль пользователя)
```python
- user: OneToOne -> User
- company: FK -> Company
- department: FK -> Department
- roles: M2M -> Role
- is_system_admin: Суперадмин
```

---

## 🎭 Предустановленные роли

### 1. **Системный администратор** (`SYSTEM_ADMIN`)
- **88 разрешений**
- Полный доступ ко всем ресурсам системы
- Уровень видимости: `SYSTEM`

### 2. **Администратор компании** (`COMPANY_ADMIN`)
- **267 разрешений**
- Управление всеми ресурсами своей компании
- Уровень видимости: `COMPANY`, `DEPARTMENT`, `OWN`

### 3. **Руководитель отдела** (`DEPARTMENT_MANAGER`)
- **52 разрешения**
- Управление ресурсами отдела
- Работа с клиентами, заявками, сделками отдела
- Просмотр проектов и недвижимости компании

### 4. **Менеджер** (`MANAGER`)
- **36 разрешений**
- Полный доступ к своим клиентам, заявкам, встречам, сделкам
- Просмотр ресурсов отдела
- Просмотр недвижимости компании

### 5. **Наблюдатель** (`VIEWER`)
- **30 разрешений**
- Только просмотр данных компании/отдела
- Без прав на изменение

---

## 🚀 Использование API

### Базовый URL
```
/api/permissions/
```

### 1. **Компании**

```bash
# Список компаний
GET /api/permissions/companies/

# Создать компанию
POST /api/permissions/companies/
{
  "name": "ООО Компания",
  "code": "COMP001",
  "description": "Описание компании"
}

# Детали компании
GET /api/permissions/companies/{id}/

# Обновить компанию
PATCH /api/permissions/companies/{id}/
```

### 2. **Отделы**

```bash
# Список отделов
GET /api/permissions/departments/

# Создать отдел
POST /api/permissions/departments/
{
  "company": 1,
  "name": "Отдел продаж",
  "code": "SALES",
  "parent_department": null
}

# Фильтрация по компании
GET /api/permissions/departments/?company=1
```

### 3. **Разрешения**

```bash
# Список всех разрешений
GET /api/permissions/permissions/

# Фильтрация
GET /api/permissions/permissions/?resource=CLIENT&action=VIEW

# Группировка по ресурсам
GET /api/permissions/permissions/grouped_by_resource/
```

### 4. **Роли**

```bash
# Список ролей
GET /api/permissions/roles/

# Создать роль
POST /api/permissions/roles/
{
  "name": "Старший менеджер",
  "code": "SENIOR_MANAGER",
  "level": "MANAGER",
  "permission_ids": [1, 2, 3, 4, 5],
  "company_ids": [1]
}

# Массовое назначение разрешений
POST /api/permissions/roles/{id}/assign_permissions/
{
  "role_id": 1,
  "permission_ids": [10, 11, 12],
  "action": "add"  # или "remove", "set"
}

# Пользователи роли
GET /api/permissions/roles/{id}/users/
```

### 5. **Профили пользователей**

```bash
# Список профилей
GET /api/permissions/user-profiles/

# Создать/обновить профиль
POST /api/permissions/user-profiles/
{
  "user": 1,
  "company_id": 1,
  "department_id": 2,
  "role_ids": [3, 4],
  "position": "Старший менеджер",
  "phone": "+998901234567"
}

# Все разрешения пользователя
GET /api/permissions/user-profiles/{id}/permissions/

# Проверка разрешения
POST /api/permissions/user-profiles/{id}/check_permission/
{
  "action": "VIEW",
  "resource": "CLIENT",
  "scope": "DEPARTMENT"
}

# Текущий пользователь
GET /api/permissions/me/
PATCH /api/permissions/me/
```

### 6. **Статистика**

```bash
# Общая статистика системы
GET /api/permissions/stats/
```

---

## 💻 Использование в коде

### 1. **Проверка разрешений в Views**

```python
from rest_framework import viewsets
from permissions.permissions import ClientPermission
from permissions.backends import get_filtered_queryset

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated, ClientPermission]
    
    def get_queryset(self):
        # Автоматическая фильтрация по разрешениям
        queryset = super().get_queryset()
        return get_filtered_queryset(
            self.request.user,
            queryset,
            'CLIENT'
        )
```

### 2. **Проверка разрешений в коде**

```python
from permissions.backends import can_user_perform_action

# Простая проверка
if can_user_perform_action(user, 'VIEW', 'CLIENT'):
    # Пользователь может просматривать клиентов
    pass

# Проверка для конкретного объекта
if can_user_perform_action(user, 'EDIT', 'DEAL', obj=deal):
    # Пользователь может редактировать эту сделку
    pass
```

### 3. **Через профиль пользователя**

```python
profile = user.profile

# Проверка наличия разрешения
if profile.has_permission('VIEW_CLIENT_COMPANY'):
    pass

# Проверка действия
if profile.has_permission_for_action('EDIT', 'DEAL', 'OWN'):
    pass

# Получить все разрешения
permissions = profile.get_all_permissions()

# Доступные компании
companies = profile.get_accessible_companies()

# Доступные отделы
departments = profile.get_accessible_departments()
```

### 4. **Кастомные permission классы**

```python
from permissions.permissions import (
    IsSystemAdmin,
    IsCompanyAdmin,
    IsDepartmentManager
)

class SomeView(APIView):
    permission_classes = [IsAuthenticated, IsCompanyAdmin]
    
    def get(self, request):
        # Только администраторы компании
        pass
```

---

## 🔧 Инициализация системы

### 1. **Первичная настройка**

```bash
# 1. Применить миграции
python manage.py migrate

# 2. Создать разрешения и роли
python manage.py init_permissions

# 3. Создать суперпользователя
python manage.py createsuperuser
```

### 2. **Создание тестовых данных**

```python
from django.contrib.auth.models import User
from permissions.models import Company, Department, UserProfile, Role

# Создать компанию
company = Company.objects.create(
    name="Тестовая компания",
    code="TEST001"
)

# Создать отдел
department = Department.objects.create(
    company=company,
    name="Отдел продаж",
    code="SALES"
)

# Создать пользователя
user = User.objects.create_user(
    username="manager1",
    password="password123",
    first_name="Иван",
    last_name="Иванов"
)

# Создать профиль
profile = UserProfile.objects.create(
    user=user,
    company=company,
    department=department,
    position="Менеджер по продажам"
)

# Назначить роль
manager_role = Role.objects.get(code='MANAGER')
profile.roles.add(manager_role)
```

---

## 📊 Примеры использования

### Сценарий 1: Менеджер работает со своими клиентами

```python
# У менеджера есть разрешение VIEW_CLIENT_OWN
# Он видит только клиентов, которых сам создал

clients = Client.objects.all()  # Все клиенты в БД
filtered = get_filtered_queryset(user, clients, 'CLIENT')
# Вернет только клиентов где created_by = user
```

### Сценарий 2: Руководитель отдела видит данные отдела

```python
# Разрешение VIEW_DEAL_DEPARTMENT
# Видит сделки всех менеджеров своего отдела

deals = Deal.objects.all()
filtered = get_filtered_queryset(user, deals, 'DEAL')
# Вернет сделки где created_by.profile.department = user.profile.department
```

### Сценарий 3: Администратор компании видит всю компанию

```python
# Разрешение VIEW_APPLICATION_COMPANY
# Видит заявки всей компании

applications = Application.objects.all()
filtered = get_filtered_queryset(user, applications, 'APPLICATION')
# Вернет заявки где created_by.profile.company = user.profile.company
```

---

## 🛡️ Безопасность

### 1. **Аудит изменений**

Все изменения разрешений логируются в `PermissionLog`:

```python
# Автоматически создается при:
- Изменении ролей
- Назначении/удалении разрешений
- Изменении профилей пользователей

# Просмотр логов
GET /api/permissions/logs/?entity_type=Role&entity_id=1
```

### 2. **Защита системных ролей**

```python
# Системные роли (is_system=True) нельзя изменить через API
role = Role.objects.get(code='SYSTEM_ADMIN')
# При попытке изменения вернется ошибка 400
```

### 3. **IP tracking**

```python
# IP адрес сохраняется при изменениях
log = PermissionLog.objects.last()
print(log.ip_address)  # 192.168.1.1
```

---

## 🎯 Best Practices

1. **Используйте предустановленные роли** как основу
2. **Создавайте кастомные роли** для специфических нужд
3. **Проверяйте разрешения** на уровне Views
4. **Фильтруйте queryset** через `get_filtered_queryset`
5. **Логируйте важные действия** пользователей
6. **Регулярно проверяйте** разрешения пользователей
7. **Используйте иерархию** отделов для гибкости

---

## 📈 Масштабирование

Система поддерживает:
- ✅ Множественные компании
- ✅ Неограниченную вложенность отделов
- ✅ Тысячи пользователей
- ✅ Комбинацию нескольких ролей на одного пользователя
- ✅ Динамическое добавление новых ресурсов

---

## 🆘 Troubleshooting

### Проблема: Пользователь не видит данные

**Решение:**
1. Проверьте наличие профиля: `user.profile`
2. Проверьте назначенные роли: `user.profile.roles.all()`
3. Проверьте разрешения: `user.profile.get_all_permissions()`
4. Проверьте привязку к компании/отделу

### Проблема: Разрешение не работает

**Решение:**
1. Проверьте код разрешения: `VIEW_CLIENT_OWN`
2. Проверьте активность разрешения: `is_active=True`
3. Проверьте привязку к роли
4. Проверьте уровень scope

---

## 📚 Дополнительные материалы

- Django Admin: `/admin/permissions/`
- API Documentation: `/api/schema/swagger/`
- Source Code: `/backend/permissions/`

---

**✨ Система успешно инициализирована и готова к использованию!**
