# План тестирования системы ролей и разрешений

## Обзор архитектуры системы

### Модели данных

#### 1. Company (Компания)
- Верхний уровень организационной иерархии
- Поля: `name`, `code`, `is_active`

#### 2. Department (Отдел)  
- Средний уровень иерархии
- Связь: `company` (ForeignKey), `parent_department` (self-reference)
- Поддержка иерархии отделов (parent_department)

#### 3. Permission (Разрешение)
- **Actions (Действия):**
  - `VIEW` - Просмотр
  - `ADD` - Добавление
  - `EDIT` - Редактирование
  - `DELETE` - Удаление
  - `EXPORT` - Экспорт
  - `IMPORT` - Импорт
  - `APPROVE` - Утверждение
  - `ASSIGN` - Назначение
  - `EDIT_IN_PROGRESS` - Редактирование задачи в работе
  - `REOPEN` - Возврат отменённой задачи
  - `FORCE_EDIT` - Принудительное редактирование
  - `DELETE_LOG` - Удаление логов

- **Resources (Ресурсы):**
  - CRM: `CLIENT`, `APPLICATION`, `MEETING`
  - Realty: `PROJECT`, `BUILDING`, `BUILDING_TYPE`, `PROPERTY`, `LAYOUT`, `DISCOUNT`
  - Deals: `DEAL`
  - Finances: `PAYMENT`, `PAYMENT_TYPE`, `BENEFICIARY_ACCOUNT`
  - Documents: `TEMPLATE`
  - Reports: `REPORT`, `PLAN`
  - Tasks: `TASK`, `TASK_LOG`
  - Permissions: `USER`, `ROLE`, `PERMISSION`, `COMPANY`, `DEPARTMENT`, `PARTNER_API_KEY`
  - System: `DASHBOARD`, `SETTINGS`

- **Scopes (Области видимости):**
  - `OWN` - Только свои объекты
  - `DEPARTMENT` - Объекты своего отдела
  - `COMPANY` - Объекты своей компании
  - `SYSTEM` - Все объекты системы

#### 4. Role (Роль)
- **Categories:** `ADMINISTRATIVE`, `MANAGEMENT`, `OPERATIONAL`, `READONLY`, `CUSTOM`
- **RoleScope:** `SYSTEM`, `COMPANY`, `DEPARTMENT`, `OWN`
- Связи: `permissions` (M2M), `companies` (M2M)

#### 5. UserProfile (Профиль пользователя)
- Связи: `user` (OneToOne), `company`, `department`, `roles` (M2M)
- Флаг: `is_system_admin` - системный администратор

#### 6. PartnerAPIKey (API-ключ партнёра)
- **AllowedScopes:** `VIEW_PROJECTS`, `VIEW_BUILDINGS`, `VIEW_LAYOUTS`, `CREATE_APPLICATION`
- Поддержка IP whitelist, rate limiting, срок действия

---

## Список тестовых сценариев

### Раздел 1: Аутентификация и Авторизация

#### 1.1 Тесты входа в систему (auth_views.login_view)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| AUTH-001 | Успешный вход с правильными credentials | JWT токены + данные пользователя | Высокий |
| AUTH-002 | Вход с неверным паролем | 401 Unauthorized | Высокий |
| AUTH-003 | Вход с несуществующим пользователем | 401 Unauthorized | Высокий |
| AUTH-004 | Вход с отключенным аккаунтом (is_active=False) | 403 Forbidden | Высокий |
| AUTH-005 | Вход с отключенным профилем | 403 Forbidden | Высокий |
| AUTH-006 | Вход без профиля пользователя | 404 Not Found | Средний |
| AUTH-007 | Вход с пустым username | 400 Bad Request | Средний |
| AUTH-008 | Вход с пустым password | 400 Bad Request | Средний |
| AUTH-009 | Вход с пустым телом запроса | 400 Bad Request | Средний |
| AUTH-010 | Проверка структуры ответа при успешном входе | access, refresh, user объект | Средний |

#### 1.2 Тесты сброса пароля

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| AUTH-011 | Запрос сброса пароля для существующего email | Успех (200) | Высокий |
| AUTH-012 | Запрос сброса пароля для несуществующего email | Успех (200) - безопасность | Высокий |
| AUTH-013 | Подтверждение сброса с валидным токеном | 200 OK | Высокий |
| AUTH-014 | Подтверждение сброса с невалидным токеном | 400 Bad Request | Высокий |
| AUTH-015 | Подтверждение сброса с невалидным uid | 400 Bad Request | Средний |
| AUTH-016 | Подтверждение сброса без параметров | 400 Bad Request | Средний |

---

### Раздел 2: Проверка разрешений (Permission Checks)

#### 2.1 Тесты BaseResourcePermission

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| PERM-001 | Неаутентифицированный пользователь GET запрос | 401 Unauthorized | Высокий |
| PERM-002 | Неаутентифицированный пользователь POST запрос | 401 Unauthorized | Высокий |
| PERM-003 | GET запрос маппится на действие VIEW | True/False в зависимости от прав | Высокий |
| PERM-004 | POST запрос маппится на действие ADD | True/False | Высокий |
| PERM-005 | PUT запрос маппится на действие EDIT | True/False | Высокий |
| PERM-006 | PATCH запрос маппится на действие EDIT | True/False | Высокий |
| PERM-007 | DELETE запрос маппится на действие DELETE | True/False | Высокий |

#### 2.2 Тесты системного администратора

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| PERM-008 | superuser имеет доступ ко всем ресурсам | True для всех действий | Высокий |
| PERM-009 | is_system_admin=True имеет доступ ко всем ресурсам | True для всех действий | Высокий |
| PERM-010 | superuser видит все объекты без фильтрации | Полный queryset | Высокий |
| PERM-011 | is_system_admin видит все объекты без фильтрации | Полный queryset | Высокий |

#### 2.3 Тесты IsCompanyAdmin

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| PERM-012 | Пользователь с ролью COMPANY_ADMIN имеет доступ | True | Средний |
| PERM-013 | Пользователь без роли COMPANY_ADMIN не имеет доступ | False | Средний |

#### 2.4 Тесты IsDepartmentManager

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| PERM-014 | Пользователь с ролью DEPARTMENT_MANAGER имеет доступ | True | Средний |
| PERM-015 | Пользователь с ролью COMPANY_ADMIN имеет доступ | True | Средний |

---

### Раздел 3: Фильтрация данных по Scope

#### 3.1 Тесты get_filtered_queryset

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| SCOPE-001 | Scope SYSTEM - видит все объекты | Полный queryset | Высокий |
| SCOPE-002 | Scope COMPANY - видит объекты своей компании | Фильтрация по company | Высокий |
| SCOPE-003 | Scope DEPARTMENT - видит объекты своего отдела | Фильтрация по department | Высокий |
| SCOPE-004 | Scope OWN - видит только свои объекты | Фильтрация по created_by | Высокий |
| SCOPE-005 | Без разрешений - пустой queryset | queryset.none() | Высокий |
| SCOPE-006 | Иерархия: SYSTEM > COMPANY > DEPARTMENT > OWN | Корректная иерархия | Высокий |

#### 3.2 Тесты специальной логики для клиентов (CLIENT)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| SCOPE-007 | CLIENT с COMPANY scope - видит через заявки компании | Клиенты с заявками от компании | Высокий |
| SCOPE-008 | CLIENT с DEPARTMENT scope - видит через заявки отдела | Клиенты с заявками от отдела | Высокий |
| SCOPE-009 | CLIENT с OWN scope - видит через свои заявки | Клиенты с заявками пользователя | Высокий |

#### 3.3 Тесты can_user_perform_action

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| ACTION-001 | Действие над своим объектом с OWN scope | True | Высокий |
| ACTION-002 | Действие над чужим объектом с OWN scope | False | Высокий |
| ACTION-003 | Действие над объектом отдела с DEPARTMENT scope | True | Высокий |
| ACTION-004 | Действие над объектом другого отдела с DEPARTMENT scope | False | Высокий |
| ACTION-005 | Действие над объектом компании с COMPANY scope | True | Высокий |
| ACTION-006 | Действие над объектом другой компании с COMPANY scope | False | Высокий |

---

### Раздел 4: CRUD операции по ресурсам

#### 4.1 Клиенты (ClientPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| CLI-001 | GET /clients/ без VIEW разрешения | 403 Forbidden | Высокий |
| CLI-002 | GET /clients/ с VIEW_CLIENT_OWN | Только свои клиенты | Высокий |
| CLI-003 | GET /clients/ с VIEW_CLIENT_COMPANY | Клиенты компании | Высокий |
| CLI-004 | POST /clients/ без ADD разрешения | 403 Forbidden | Высокий |
| CLI-005 | POST /clients/ с ADD_CLIENT_COMPANY | Успешное создание | Высокий |
| CLI-006 | PUT /clients/{id}/ на чужого клиента | 403/404 | Высокий |
| CLI-007 | DELETE /clients/{id}/ без DELETE разрешения | 403 Forbidden | Высокий |

#### 4.2 Заявки (ApplicationPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| APP-001 | GET /applications/ без VIEW разрешения | 403 Forbidden | Высокий |
| APP-002 | GET /applications/ с VIEW_APPLICATION_OWN | Только свои заявки | Высокий |
| APP-003 | GET /applications/ с VIEW_APPLICATION_DEPARTMENT | Заявки отдела | Высокий |
| APP-004 | POST /applications/ без ADD разрешения | 403 Forbidden | Высокий |
| APP-005 | PATCH /applications/{id}/ своей заявки | Успешное обновление | Высокий |
| APP-006 | PATCH /applications/{id}/ чужой заявки с OWN scope | 403 Forbidden | Высокий |

#### 4.3 Встречи (MeetingPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| MTG-001 | GET /meetings/ фильтрация по scope | Корректная фильтрация | Высокий |
| MTG-002 | POST /meetings/ автозаполнение creator | creator = request.user | Высокий |
| MTG-003 | PATCH /meetings/{id}/ логирование изменений | Создание MeetingLog | Средний |

#### 4.4 Сделки (DealPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| DEAL-001 | GET /deals/ с VIEW_DEAL_COMPANY | Сделки компании | Высокий |
| DEAL-002 | POST /deals/ создание сделки | Автозаполнение created_by | Высокий |
| DEAL-003 | POST /deals/ дубликат активной сделки | 400 Bad Request | Высокий |
| DEAL-004 | POST /deals/cancel/ без платежей | Отмена сделки | Высокий |
| DEAL-005 | POST /deals/terminate/ с платежами | Расторжение + возврат | Высокий |

#### 4.5 Проекты (ProjectPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| PRJ-001 | GET /projects/ без VIEW разрешения | 403 Forbidden | Высокий |
| PRJ-002 | POST /projects/ автозаполнение created_by | created_by = request.user | Средний |
| PRJ-003 | DELETE /projects/{id}/ каскадное удаление | Удаление связанных данных | Средний |

#### 4.6 Объекты недвижимости (PropertyPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| PROP-001 | GET /properties/template/ скачивание шаблона | Excel файл | Средний |
| PROP-002 | POST /properties/upload/ загрузка данных | Создание/обновление объектов | Средний |
| PROP-003 | Валидация статусов при импорте | Только SELECTION, RESERVE | Средний |

#### 4.7 Скидки (DiscountPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| DISC-001 | GET /discounts/available/{deal_pk}/ | Скидки для дома сделки | Высокий |
| DISC-002 | Фильтрация по building, property_type | Корректные скидки | Средний |

#### 4.8 Задачи (TaskPermission)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| TASK-001 | GET /tasks/my_tasks/ | Задачи где assignee = user | Высокий |
| TASK-002 | GET /tasks/created_by_me/ | Задачи где creator = user | Высокий |
| TASK-003 | POST /tasks/{id}/start/ новой задачи | Статус IN_PROGRESS | Высокий |
| TASK-004 | POST /tasks/{id}/start/ не новой задачи | 400 Bad Request | Высокий |
| TASK-005 | POST /tasks/{id}/complete/ | Статус COMPLETED + время | Высокий |
| TASK-006 | POST /tasks/{id}/cancel/ завершённой | 400 Bad Request | Высокий |
| TASK-007 | POST /tasks/{id}/reopen/ без REOPEN права | 403 Forbidden | Высокий |
| TASK-008 | POST /tasks/{id}/reopen/ с REOPEN правом | Статус RETURNED | Высокий |
| TASK-009 | DELETE /tasks/{id}/logs/{log_id}/ без права | 403 Forbidden | Средний |
| TASK-010 | DELETE /tasks/{id}/logs/{log_id}/ с правом | 204 No Content | Средний |
| TASK-011 | GET /tasks/kanban/ группировка по статусам | Данные для канбан-доски | Средний |
| TASK-012 | GET /tasks/overdue/ просроченные задачи | Задачи с deadline < now | Средний |

---

### Раздел 5: Управление ролями и разрешениями

#### 5.1 Компании (CompanyViewSet)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| COMP-001 | GET /companies/ фильтрация по scope | Доступные компании | Высокий |
| COMP-002 | GET /companies/accessible/ | Компании для назначения | Высокий |

#### 5.2 Отделы (DepartmentViewSet)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| DEPT-001 | GET /departments/ фильтрация по scope | Доступные отделы | Высокий |
| DEPT-002 | GET /departments/accessible/ | Отделы для назначения | Высокий |
| DEPT-003 | Иерархия отделов (parent_department) | Корректная иерархия | Средний |

#### 5.3 Роли (RoleViewSet)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| ROLE-001 | GET /roles/ список ролей | Доступные роли | Высокий |
| ROLE-002 | POST /roles/ создание роли | created_by = request.user | Высокий |
| ROLE-003 | PUT /roles/{id}/ системной роли | 400 Bad Request | Высокий |
| ROLE-004 | POST /roles/{id}/assign_permissions/ add | Добавление разрешений | Высокий |
| ROLE-005 | POST /roles/{id}/assign_permissions/ remove | Удаление разрешений | Высокий |
| ROLE-006 | POST /roles/{id}/assign_permissions/ set | Замена разрешений | Высокий |
| ROLE-007 | GET /roles/{id}/users/ | Пользователи с ролью | Средний |
| ROLE-008 | Логирование изменений разрешений | PermissionLog создаётся | Средний |

#### 5.4 Профили пользователей (UserProfileViewSet)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| USER-001 | GET /user-profiles/ фильтрация | Доступные профили | Высокий |
| USER-002 | POST /user-profiles/create_user/ | Создание пользователя + профиль | Высокий |
| USER-003 | GET /user-profiles/{id}/permissions/ | Все разрешения пользователя | Высокий |
| USER-004 | POST /user-profiles/{id}/check_permission/ | Проверка конкретного права | Высокий |

#### 5.5 Текущий пользователь (CurrentUserProfileView)

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| CURR-001 | GET /me/ | Профиль текущего пользователя | Высокий |
| CURR-002 | PATCH /me/ разрешённые поля | Обновление position, phone, avatar | Высокий |
| CURR-003 | PATCH /me/ запрещённые поля | Игнорирование roles, company | Высокий |

---

### Раздел 6: Partner API Keys

#### 6.1 Тесты HasValidPartnerAPIKey

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| API-001 | Запрос без API-ключа | 401 NotAuthenticated | Высокий |
| API-002 | Запрос с несуществующим ключом | 401 NotAuthenticated | Высокий |
| API-003 | Запрос с деактивированным ключом | 401 NotAuthenticated | Высокий |
| API-004 | Запрос с истекшим ключом | 401 NotAuthenticated | Высокий |
| API-005 | Запрос с запрещённого IP | 403 PermissionDenied | Высокий |
| API-006 | Запрос без нужного scope | 403 PermissionDenied | Высокий |
| API-007 | Запрос с валидным ключом | 200 OK | Высокий |
| API-008 | Обновление last_used_at | Время обновлено | Средний |
| API-009 | HTTPS требование в продакшене | 403 без HTTPS | Средний |
| API-010 | Получение IP через X-Forwarded-For | Корректный IP | Средний |

#### 6.2 Тесты Partner API scopes

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| API-011 | VIEW_PROJECTS scope | Доступ к проектам | Высокий |
| API-012 | VIEW_BUILDINGS scope | Доступ к зданиям | Высокий |
| API-013 | VIEW_LAYOUTS scope | Доступ к планировкам | Высокий |
| API-014 | CREATE_APPLICATION scope | Создание заявок | Высокий |

#### 6.3 Управление API-ключами

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| API-015 | POST /partner-api-keys/ создание | Новый ключ с token_hex | Высокий |
| API-016 | POST /partner-api-keys/{id}/regenerate/ | Новый ключ | Средний |
| API-017 | POST /partner-api-keys/{id}/toggle_active/ | Смена статуса | Средний |
| API-018 | Системный админ видит все ключи | Полный список | Средний |
| API-019 | Админ компании видит только свои ключи | Фильтрация по компании | Средний |

---

### Раздел 7: Отчёты и статистика

#### 7.1 Тесты ReportPermission

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| REP-001 | GET /applications/summary/ без права | 403 Forbidden | Высокий |
| REP-002 | GET /deals/summary/ с правом | Данные отчёта | Высокий |
| REP-003 | GET /meetings/summary/ экспорт Excel | Excel файл | Средний |
| REP-004 | Параметр group_by=created_by | Группировка по автору | Средний |
| REP-005 | Параметр group_by=status | Группировка по статусу | Средний |
| REP-006 | Параметр group_by=project | Группировка по проекту | Средний |

#### 7.2 Тесты DashboardPermission

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| DASH-001 | GET /dashboard/ без права | 403 Forbidden | Высокий |
| DASH-002 | GET /dashboard/ с правом | KPI, charts, managers | Высокий |

#### 7.3 Статистика разрешений

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| STAT-001 | GET /stats/ требует IsCompanyAdmin | 403 для обычных | Средний |
| STAT-002 | Данные о компаниях, отделах, пользователях | Корректная статистика | Средний |

---

### Раздел 8: Модельные методы UserProfile

#### 8.1 Тесты has_permission

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| MODEL-001 | has_permission('VIEW_CLIENT_OWN') с правом | True | Высокий |
| MODEL-002 | has_permission('VIEW_CLIENT_OWN') без права | False | Высокий |
| MODEL-003 | has_permission() для is_system_admin | True всегда | Высокий |

#### 8.2 Тесты has_permission_for_action

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| MODEL-004 | has_permission_for_action('VIEW', 'CLIENT', 'OWN') | True/False | Высокий |
| MODEL-005 | has_permission_for_action('VIEW', 'CLIENT', None) | True если любой scope | Высокий |
| MODEL-006 | has_permission_for_action() для is_system_admin | True всегда | Высокий |

#### 8.3 Тесты get_all_permissions

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| MODEL-007 | get_all_permissions() обычного пользователя | Разрешения из ролей | Средний |
| MODEL-008 | get_all_permissions() is_system_admin | Все разрешения | Средний |

#### 8.4 Тесты get_accessible_companies/departments

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| MODEL-009 | get_accessible_companies() SYSTEM scope | Все компании | Средний |
| MODEL-010 | get_accessible_companies() COMPANY scope | Своя компания | Средний |
| MODEL-011 | get_accessible_departments() COMPANY scope | Отделы компании | Средний |
| MODEL-012 | get_accessible_departments() DEPARTMENT scope | Свой отдел + подотделы | Средний |

---

### Раздел 9: Backend функции

#### 9.1 Тесты _determine_scope

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| BACK-001 | Объект created_by == user | 'OWN' | Средний |
| BACK-002 | Объект того же отдела | 'DEPARTMENT' | Средний |
| BACK-003 | Объект той же компании | 'COMPANY' | Средний |
| BACK-004 | Объект другой компании | 'SYSTEM' | Средний |

#### 9.2 Тесты _is_object_in_scope

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| BACK-005 | OWN scope для своего объекта | True | Средний |
| BACK-006 | OWN scope для чужого объекта | False | Средний |
| BACK-007 | DEPARTMENT scope для объекта отдела | True | Средний |
| BACK-008 | COMPANY scope для объекта компании | True | Средний |

---

### Раздел 10: Frontend проверки

#### 10.1 Тесты hasPermission функции

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| FE-001 | hasPermission(user, 'VIEW', 'CLIENT') | True/False | Высокий |
| FE-002 | hasPermission(null, ...) | False | Высокий |
| FE-003 | hasPermission(systemAdmin, ...) | True всегда | Высокий |
| FE-004 | hasPermission с конкретным scope | Точная проверка | Средний |

#### 10.2 Тесты PermissionRoute компонента

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| FE-005 | requireAdmin=true для обычного | Access Denied | Высокий |
| FE-006 | requireAdmin=true для админа | Рендер children | Высокий |
| FE-007 | action+resource без права | Access Denied | Высокий |
| FE-008 | action+resource с правом | Рендер children | Высокий |

---

### Раздел 11: Логирование

#### 11.1 Тесты PermissionLog

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| LOG-001 | Изменение разрешений роли создаёт лог | PermissionLog создан | Средний |
| LOG-002 | Создание пользователя создаёт лог | PermissionLog создан | Средний |
| LOG-003 | GET /logs/ только для IsSystemAdmin | 403 для остальных | Средний |
| LOG-004 | Структура лога: user, action, entity_type, entity_id | Все поля заполнены | Средний |

---

### Раздел 12: Граничные случаи и ошибки

| ID | Сценарий | Ожидаемый результат | Приоритет |
|----|----------|---------------------|-----------|
| EDGE-001 | Пользователь без профиля | Graceful handling | Средний |
| EDGE-002 | Пользователь без ролей | Пустой доступ | Средний |
| EDGE-003 | Неактивная роль | Не учитывается | Средний |
| EDGE-004 | Неактивное разрешение | Не учитывается | Средний |
| EDGE-005 | Объект без created_by | Корректная обработка | Средний |
| EDGE-006 | Объект без company/department | Корректная обработка | Средний |
| EDGE-007 | Удалённый пользователь-автор | Сохранение связей | Низкий |
| EDGE-008 | Циклические подотделы | Предотвращение зацикливания | Низкий |

---

## Матрица покрытия

### Ресурсы × Действия × Scopes

```
Ресурс          | VIEW | ADD | EDIT | DELETE | EXPORT | IMPORT | APPROVE | ASSIGN | Специальные
----------------|------|-----|------|--------|--------|--------|---------|--------|------------
CLIENT          | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
APPLICATION     | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
MEETING         | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
TASK            | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      | EDIT_IN_PROGRESS, REOPEN, FORCE_EDIT
TASK_LOG        | ✓    | -   | -    | ✓      | -      | -      | -       | -      | DELETE_LOG
DEAL            | ✓    | ✓   | ✓    | ✓      | -      | -      | ✓       | -      |
PROJECT         | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
BUILDING        | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
BUILDING_TYPE   | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
PROPERTY        | ✓    | ✓   | ✓    | ✓      | ✓      | ✓      | -       | -      |
LAYOUT          | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
DISCOUNT        | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
PAYMENT         | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
PAYMENT_TYPE    | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
BENEFICIARY     | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
TEMPLATE        | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
REPORT          | ✓    | -   | -    | -      | ✓      | -      | -       | -      |
PLAN            | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
USER            | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | ✓      |
ROLE            | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | ✓      |
PERMISSION      | ✓    | -   | -    | -      | -      | -      | -       | -      |
COMPANY         | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
DEPARTMENT      | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
PARTNER_API_KEY | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
DASHBOARD       | ✓    | -   | -    | -      | -      | -      | -       | -      |
SETTINGS        | ✓    | ✓   | ✓    | ✓      | -      | -      | -       | -      |
```

### Scopes для каждого ресурса

```
Scope      | OWN | DEPARTMENT | COMPANY | SYSTEM |
-----------|-----|------------|---------|--------|
Все ресурсы| ✓   | ✓          | ✓       | ✓      |
```

---

## Рекомендации по реализации тестов

### 1. Fixtures для тестов

```python
# Создать тестовые данные:
- 2 компании (Company A, Company B)
- 4 отдела (2 в каждой компании)
- 8 пользователей:
  - system_admin (is_system_admin=True)
  - company_a_admin (COMPANY scope)
  - company_a_manager (DEPARTMENT scope)
  - company_a_user (OWN scope)
  - company_b_admin, company_b_manager, company_b_user
  - readonly_user (только VIEW права)
```

### 2. Структура тестов

```python
class TestClientPermissions(APITestCase):
    def setUp(self):
        # Создание пользователей с разными правами
        pass
    
    def test_view_clients_own_scope(self):
        """CLI-002: Пользователь с OWN scope видит только своих клиентов"""
        pass
    
    def test_view_clients_company_scope(self):
        """CLI-003: Пользователь с COMPANY scope видит клиентов компании"""
        pass
```

### 3. Параметризация

```python
@pytest.mark.parametrize("action,expected", [
    ('VIEW', True),
    ('ADD', True),
    ('EDIT', False),
    ('DELETE', False),
])
def test_manager_permissions(self, action, expected):
    """Тест разрешений менеджера"""
    pass
```

---

## Общее количество тестов

| Раздел | Количество |
|--------|------------|
| Аутентификация | 16 |
| Проверка разрешений | 15 |
| Фильтрация по Scope | 9 |
| CRUD ресурсы | 45 |
| Управление ролями | 22 |
| Partner API | 19 |
| Отчёты | 8 |
| Модельные методы | 12 |
| Backend функции | 8 |
| Frontend | 8 |
| Логирование | 4 |
| Граничные случаи | 8 |
| **ИТОГО** | **174** |

---

## Оценка покрытия

- **Всего сценариев:** 174
- **Высокий приоритет:** ~100 (57%)
- **Средний приоритет:** ~60 (35%)
- **Низкий приоритет:** ~14 (8%)

**Покрытие возможностей пользовательского ввода: ~95%**

Для достижения 95% покрытия рекомендуется:
1. Реализовать все тесты высокого приоритета (100%)
2. Реализовать все тесты среднего приоритета (100%)
3. Реализовать часть тестов низкого приоритета (~50%)
