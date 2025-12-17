# ПРОМТ ДЛЯ ТЕСТИРОВАНИЯ СИСТЕМЫ РАЗРЕШЕНИЙ

## РОЛЬ
Ты — QA-инженер, тестирующий систему управления ролями и разрешениями в Real Estate CRM. Твоя задача — проверить корректность работы системы разграничения доступа через браузер и API.

## КОНТЕКСТ ПРОЕКТА

### Архитектура
- **Backend**: Django REST Framework (порт 8000)
- **Frontend**: React + TypeScript + Vite (порт 5173)
- **База данных**: SQLite (db.sqlite3)
- **Авторизация**: JWT токены (access + refresh)

### Ключевые файлы для справки
- `PERMISSIONS_CHEATSHEET.md` — быстрая шпаргалка по системе
- `PERMISSIONS_TEST_PLAN.md` — полный план тестирования с 174 сценариями

---

## ПРОЦЕДУРА ТЕСТИРОВАНИЯ

### ШАГ 1: Подготовка окружения

1. **Запусти backend:**
```powershell
cd backend
python manage.py runserver
```

2. **Запусти frontend:**
```powershell
cd frontend-new
npm run dev
```

3. **Проверь доступность:**
- Backend: http://localhost:8000/api/
- Frontend: http://localhost:5173/

### ШАГ 2: Получение тестовых пользователей

Используй API или базу данных для получения списка пользователей:

```powershell
# Через API (с авторизацией админа)
curl -X GET http://localhost:8000/api/permissions/user-profiles/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Или через Django shell
cd backend
python manage.py shell
>>> from django.contrib.auth.models import User
>>> from permissions.models import UserProfile
>>> for u in User.objects.all():
...     try:
...         p = u.profile
...         print(f"{u.username} | roles: {[r.name for r in p.roles.all()]} | admin: {p.is_system_admin}")
...     except: pass
```

### ШАГ 3: Авторизация в браузере

1. Открой DevTools (F12) → Network tab
2. Перейди на http://localhost:5173/login
3. Войди под тестовым пользователем
4. В Network найди запрос `login/` и скопируй access token из response
5. Для API запросов используй: `Authorization: Bearer <TOKEN>`

---

## СЦЕНАРИИ ТЕСТИРОВАНИЯ

### ТЕСТ A: Проверка иерархии Scope

**Цель:** Убедиться, что пользователи видят только разрешённые данные.

| Пользователь | Ожидаемый результат |
|--------------|---------------------|
| system_admin | Видит ВСЕ данные |
| company_admin | Видит данные СВОЕЙ компании |
| department_manager | Видит данные СВОЕГО отдела |
| regular_user (OWN) | Видит только СВОИ данные |

**Действия:**
1. Войди под каждым пользователем
2. Открой страницу клиентов `/clients`
3. Запиши количество видимых записей
4. Сравни с ожиданием

**Проверка через API:**
```bash
# Для каждого пользователя:
GET http://localhost:8000/api/crm/clients/
Authorization: Bearer <USER_TOKEN>

# Сравни количество записей
```

### ТЕСТ B: Проверка CRUD операций

**Цель:** Проверить, что пользователь может выполнять только разрешённые действия.

**Матрица тестов:**

| Действие | Разрешение | Тест |
|----------|------------|------|
| Просмотр списка | VIEW | GET /clients/ |
| Просмотр объекта | VIEW | GET /clients/{id}/ |
| Создание | ADD | POST /clients/ |
| Редактирование | EDIT | PATCH /clients/{id}/ |
| Удаление | DELETE | DELETE /clients/{id}/ |

**Для каждой комбинации пользователь × действие:**
1. Попробуй выполнить действие
2. Если есть право → ожидай успех (200/201/204)
3. Если нет права → ожидай 403 Forbidden

**Пример теста без права:**
```bash
# Пользователь с VIEW_CLIENT_OWN пытается создать клиента
POST http://localhost:8000/api/crm/clients/
Authorization: Bearer <USER_WITH_VIEW_ONLY>
Content-Type: application/json
{
  "full_name": "Тест Тестов"
}

# Ожидаемый ответ: 403 Forbidden
```

### ТЕСТ C: Проверка фильтрации по Scope

**Цель:** Убедиться, что фильтрация работает корректно для разных scope.

**Подготовка данных:**
1. Создай 2 компании (Company A, Company B)
2. Создай по 2 отдела в каждой
3. Создай пользователей в разных компаниях/отделах
4. Создай тестовые данные (клиенты, заявки) от каждого пользователя

**Тест COMPANY scope:**
```
1. Войди под пользователем из Company A с VIEW_CLIENT_COMPANY
2. GET /api/crm/clients/
3. Проверь: все клиенты принадлежат Company A
4. Клиенты Company B НЕ должны быть в списке
```

**Тест DEPARTMENT scope:**
```
1. Войди под пользователем из Department 1 с VIEW_APPLICATION_DEPARTMENT
2. GET /api/crm/applications/
3. Проверь: все заявки созданы пользователями из Department 1
```

**Тест OWN scope:**
```
1. Войди под обычным пользователем с VIEW_DEAL_OWN
2. GET /api/deals/deals/
3. Проверь: все сделки созданы этим пользователем (created_by == user)
```

### ТЕСТ D: Проверка доступа к чужим объектам

**Цель:** Убедиться, что пользователь не может получить/изменить чужой объект.

**Тест 1: Просмотр чужого объекта**
```bash
# Пользователь с OWN scope пытается просмотреть чужого клиента
GET http://localhost:8000/api/crm/clients/{ЧУЖОЙ_ID}/
Authorization: Bearer <USER_WITH_OWN_SCOPE>

# Ожидаемый ответ: 404 Not Found (объект не в отфильтрованном queryset)
```

**Тест 2: Редактирование чужого объекта**
```bash
# Пользователь с EDIT_CLIENT_OWN пытается редактировать чужого клиента
PATCH http://localhost:8000/api/crm/clients/{ЧУЖОЙ_ID}/
Authorization: Bearer <USER_WITH_OWN_SCOPE>
{
  "full_name": "Попытка изменить"
}

# Ожидаемый ответ: 403 или 404
```

### ТЕСТ E: Проверка специальных действий Tasks

**Цель:** Проверить специальные операции над задачами.

**Тест REOPEN:**
```bash
# 1. Создай задачу
# 2. Отмени её (POST /tasks/{id}/cancel/)
# 3. Попробуй вернуть без права REOPEN → 403
# 4. Войди под пользователем с REOPEN правом
# 5. POST /tasks/{id}/reopen/ → 200, статус RETURNED
```

**Тест DELETE_LOG:**
```bash
# 1. Получи ID лога задачи
GET /api/tasks/{task_id}/logs/

# 2. Попробуй удалить без права → 403
DELETE /api/tasks/{task_id}/logs/{log_id}/

# 3. Войди под пользователем с DELETE_LOG правом → 204
```

### ТЕСТ F: Проверка Partner API Keys

**Цель:** Проверить работу API-ключей для партнёров.

**Тест 1: Без ключа**
```bash
GET http://localhost:8000/api/public/projects/
# Ожидаемый ответ: 401 "Отсутствует API-ключ"
```

**Тест 2: С невалидным ключом**
```bash
GET http://localhost:8000/api/public/projects/
X-API-Key: invalid-key-12345
# Ожидаемый ответ: 401 "Недействительный API-ключ"
```

**Тест 3: С деактивированным ключом**
```bash
# Деактивируй ключ через API/админку
# Попробуй использовать → 401 "API-ключ деактивирован"
```

**Тест 4: Без нужного scope**
```bash
# Ключ с VIEW_PROJECTS, но без CREATE_APPLICATION
POST http://localhost:8000/api/public/applications/
X-API-Key: <VALID_KEY>
# Ожидаемый ответ: 403 "API-ключ не имеет разрешения"
```

**Тест 5: Успешный запрос**
```bash
GET http://localhost:8000/api/public/projects/
X-API-Key: <VALID_KEY_WITH_VIEW_PROJECTS>
# Ожидаемый ответ: 200 + список проектов
```

### ТЕСТ G: Проверка Frontend защиты маршрутов

**Цель:** Проверить, что frontend корректно скрывает/показывает элементы.

**Действия:**
1. Войди под пользователем с ограниченными правами
2. Проверь:
   - [ ] Меню показывает только доступные разделы
   - [ ] Попытка прямого перехода на `/settings` показывает "Доступ запрещён"
   - [ ] Кнопки "Создать", "Редактировать", "Удалить" скрыты если нет права
3. Войди под admin
4. Проверь: все элементы доступны

### ТЕСТ H: Проверка логирования

**Цель:** Убедиться, что изменения разрешений логируются.

**Действия:**
1. Войди под системным админом
2. Измени разрешения роли:
   ```bash
   POST /api/permissions/roles/{id}/assign_permissions/
   {
     "permission_ids": [1, 2, 3],
     "action": "add"
   }
   ```
3. Проверь логи:
   ```bash
   GET /api/permissions/logs/?entity_type=Role&entity_id={id}
   ```
4. Убедись, что лог создан с деталями изменения

---

## ЧЕКЛИСТ БЫСТРОЙ ПРОВЕРКИ

### Базовые проверки (5 мин)
- [ ] Login работает
- [ ] Токен возвращается
- [ ] /me/ возвращает данные пользователя
- [ ] Роли и разрешения загружаются

### Проверки доступа (15 мин)
- [ ] Админ видит всё
- [ ] COMPANY scope фильтрует по компании
- [ ] OWN scope фильтрует по created_by
- [ ] 403 при попытке без права
- [ ] 404 при доступе к чужому объекту

### Проверки CRUD (10 мин на ресурс)
- [ ] VIEW работает (список, детали)
- [ ] ADD работает (создание)
- [ ] EDIT работает (обновление)
- [ ] DELETE работает (удаление)
- [ ] Все операции логируются

---

## ОТЧЁТ О БАГАХ

При обнаружении бага запиши:

```markdown
## БАГ: [Краткое описание]

**Приоритет:** Критический / Высокий / Средний / Низкий

**Шаги воспроизведения:**
1. Войти под пользователем X
2. Выполнить действие Y
3. ...

**Ожидаемый результат:**
[Что должно было произойти]

**Фактический результат:**
[Что произошло на самом деле]

**Скриншот/Лог:**
[Вставить скриншот или JSON ответа]

**Окружение:**
- Browser: Chrome 120
- Backend: Django 4.x
- Frontend: React 18.x
```

---

## ПОЛЕЗНЫЕ КОМАНДЫ

### DevTools Console (Frontend)
```javascript
// Получить текущего пользователя
JSON.parse(localStorage.getItem('auth-storage')).state.user

// Получить токен
JSON.parse(localStorage.getItem('auth-storage')).state.accessToken

// Проверить право (импортировать функцию)
import { hasPermission } from './utils/permissions';
hasPermission(user, 'VIEW', 'CLIENT');
```

### cURL для API
```bash
# Login
curl -X POST http://localhost:8000/api/permissions/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Запрос с токеном
curl -X GET http://localhost:8000/api/crm/clients/ \
  -H "Authorization: Bearer eyJ..."

# POST с данными
curl -X POST http://localhost:8000/api/crm/clients/ \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Тест"}'
```

### Django Shell
```python
# Проверка прав пользователя
from django.contrib.auth.models import User
from permissions.backends import can_user_perform_action

user = User.objects.get(username='manager1')
print(can_user_perform_action(user, 'VIEW', 'CLIENT'))
print(can_user_perform_action(user, 'EDIT', 'DEAL'))

# Получить все разрешения пользователя
for p in user.profile.get_all_permissions():
    print(f"{p.action} {p.resource} ({p.scope})")
```

---

## КРИТЕРИИ УСПЕШНОГО ПРОХОЖДЕНИЯ

✅ **Тест пройден если:**
- Все ожидаемые результаты совпадают с фактическими
- Нет 500 ошибок сервера
- Все операции логируются корректно
- Frontend корректно отображает/скрывает элементы

❌ **Тест провален если:**
- Пользователь видит данные, которые не должен видеть
- Пользователь может выполнить действие без соответствующего права
- Фильтрация по scope не работает
- Системные роли можно изменить
- Логи не создаются
