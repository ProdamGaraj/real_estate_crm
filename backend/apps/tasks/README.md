# 📋 API Документация: Система управления задачами

## 🎯 Обзор

Система управления задачами (Task Tracker) с полной интеграцией в систему разрешений.

### Основные возможности:
- ✅ CRUD операции с задачами
- ✅ Канбан-доска для визуализации задач
- ✅ Календарь задач
- ✅ Фильтрация по множеству параметров (статус, приоритет, даты)
- ✅ Комментарии к задачам
- ✅ История изменений (логи)
- ✅ Подзадачи (2 уровня вложенности)
- ✅ Интеграция с системой разрешений

---

## 🔐 Авторизация

Все эндпоинты требуют JWT авторизации:
```
Authorization: Bearer <access_token>
```

---

## 📊 Модели данных

### Task (Задача)

```json
{
  "id": 1,
  "title": "Название задачи",
  "description": "Описание задачи",
  "status": "NEW|IN_PROGRESS|REVIEW|COMPLETED|CANCELLED|BLOCKED",
  "priority": "LOW|NORMAL|HIGH|URGENT",
  "creator": {
    "id": 1,
    "username": "manager1",
    "full_name": "Иван Иванов",
    "email": "manager1@example.com"
  },
  "assignee": {
    "id": 2,
    "username": "employee1",
    "full_name": "Петр Петров",
    "email": "employee1@example.com"
  },
  "watchers": [...],
  "created_at": "2025-11-25T10:00:00Z",
  "started_at": "2025-11-25T11:00:00Z",
  "deadline": "2025-11-30T18:00:00Z",
  "completed_at": null,
  "updated_at": "2025-11-25T12:00:00Z",
  "company": 1,
  "company_name": "Моя компания",
  "department": 2,
  "department_name": "Отдел продаж",
  "estimated_hours": 8.0,
  "actual_hours": null,
  "tags": "важно, срочно",
  "parent_task": null,
  "is_overdue": false,
  "time_spent": 0,
  "comments_count": 5,
  "subtasks_count": 2
}
```

---

## 🛣️ API Endpoints

### Базовый CRUD

#### 1. Получить список задач
```http
GET /api/tasks/
```

**Query параметры:**
- `status` - фильтр по статусу (можно несколько через запятую)
- `priority` - фильтр по приоритету
- `creator` - ID создателя
- `assignee` - ID исполнителя
- `company` - ID компании
- `department` - ID отдела
- `tags` - поиск по тегам
- `created_at_from` - дата создания от
- `created_at_to` - дата создания до
- `deadline_from` - дедлайн от
- `deadline_to` - дедлайн до
- `started_at_from` - дата начала от
- `started_at_to` - дата начала до
- `completed_at_from` - дата завершения от
- `completed_at_to` - дата завершения до
- `search` - поиск по названию и описанию
- `is_overdue` - только просроченные (true/false)
- `parent_task` - ID родительской задачи
- `has_parent` - имеет родителя (true/false)

**Пример:**
```http
GET /api/tasks/?status=NEW,IN_PROGRESS&assignee=2&deadline_from=2025-11-25
```

**Ответ:**
```json
[
  {
    "id": 1,
    "title": "Задача 1",
    "status": "NEW",
    "priority": "HIGH",
    ...
  }
]
```

---

#### 2. Получить задачу по ID
```http
GET /api/tasks/{id}/
```

---

#### 3. Создать задачу
```http
POST /api/tasks/
```

**Body:**
```json
{
  "title": "Новая задача",
  "description": "Описание задачи",
  "assignee_id": 2,
  "deadline": "2025-11-30T18:00:00Z",
  "priority": "HIGH",
  "estimated_hours": 8.0,
  "tags": "важно, срочно",
  "watcher_ids": [3, 4]
}
```

**Примечания:**
- `creator` устанавливается автоматически (текущий пользователь)
- `company` и `department` берутся из профиля создателя
- `status` по умолчанию = `NEW`
- `dедлайн` не может быть в прошлом

---

#### 4. Обновить задачу
```http
PATCH /api/tasks/{id}/
```

**Body (все поля опциональны):**
```json
{
  "title": "Обновленное название",
  "status": "IN_PROGRESS",
  "priority": "URGENT",
  "assignee_id": 3,
  "deadline": "2025-12-01T18:00:00Z",
  "actual_hours": 5.5
}
```

---

#### 5. Удалить задачу
```http
DELETE /api/tasks/{id}/
```

---

### Специальные эндпоинты

#### 6. Мои задачи (где я исполнитель)
```http
GET /api/tasks/my_tasks/
```

---

#### 7. Созданные мной задачи
```http
GET /api/tasks/created_by_me/
```

---

#### 8. Просроченные задачи
```http
GET /api/tasks/overdue/
```

---

#### 9. Канбан-доска
```http
GET /api/tasks/kanban/
```

**Ответ:**
```json
[
  {
    "status": "NEW",
    "status_label": "Новая",
    "count": 5,
    "tasks": [...]
  },
  {
    "status": "IN_PROGRESS",
    "status_label": "В работе",
    "count": 3,
    "tasks": [...]
  },
  ...
]
```

---

#### 10. Календарь задач
```http
GET /api/tasks/calendar/?year=2025&month=11
```

**Параметры:**
- `year` - год (опционально)
- `month` - месяц (опционально)

Возвращает задачи отсортированные по дедлайну.

---

#### 11. Начать работу над задачей
```http
POST /api/tasks/{id}/start/
```

Меняет статус на `IN_PROGRESS` и устанавливает `started_at`.

---

#### 12. Завершить задачу
```http
POST /api/tasks/{id}/complete/
```

**Body (опционально):**
```json
{
  "actual_hours": 6.5
}
```

Меняет статус на `COMPLETED` и устанавливает `completed_at`.

---

#### 13. Отменить задачу
```http
POST /api/tasks/{id}/cancel/
```

Меняет статус на `CANCELLED`.

---

#### 14. Получить комментарии к задаче
```http
GET /api/tasks/{id}/comments/
```

---

#### 15. Добавить комментарий
```http
POST /api/tasks/{id}/add_comment/
```

**Body:**
```json
{
  "text": "Текст комментария",
  "attachment": <file>
}
```

---

#### 16. Получить логи задачи
```http
GET /api/tasks/{id}/logs/
```

**Ответ:**
```json
[
  {
    "id": 1,
    "user": {...},
    "action": "Задача создана",
    "old_value": null,
    "new_value": {...},
    "created_at": "2025-11-25T10:00:00Z"
  }
]
```

---

#### 17. Получить подзадачи
```http
GET /api/tasks/{id}/subtasks/
```

---

#### 18. Статистика по задачам
```http
GET /api/tasks/stats/
```

**Ответ:**
```json
{
  "total": 50,
  "by_status": {
    "NEW": {"label": "Новая", "count": 10},
    "IN_PROGRESS": {"label": "В работе", "count": 15},
    ...
  },
  "by_priority": {
    "LOW": {"label": "Низкий", "count": 5},
    "HIGH": {"label": "Высокий", "count": 20},
    ...
  },
  "overdue": 3,
  "my_tasks": 8,
  "created_by_me": 12
}
```

---

## 🔐 Система разрешений

### Разрешения для задач:

```
VIEW_TASK_OWN - просмотр своих задач (создатель или исполнитель)
VIEW_TASK_DEPARTMENT - просмотр задач отдела
VIEW_TASK_COMPANY - просмотр всех задач компании
VIEW_TASK_SYSTEM - просмотр всех задач системы

EDIT_TASK_OWN - редактирование своих задач
EDIT_TASK_DEPARTMENT - редактирование задач отдела
EDIT_TASK_COMPANY - редактирование задач компании

DELETE_TASK_COMPANY - удаление задач компании

ADD_TASK_OWN - создание задач себе
ADD_TASK_DEPARTMENT - создание задач в отделе
ADD_TASK_COMPANY - создание задач в компании
```

### Логика фильтрации:

- **OWN** - пользователь видит задачи, где он создатель или исполнитель
- **DEPARTMENT** - пользователь видит задачи своего отдела
- **COMPANY** - пользователь видит задачи своей компании
- **SYSTEM** - пользователь видит все задачи

---

## 💡 Примеры использования

### Создание задачи
```bash
curl -X POST http://localhost:8000/api/tasks/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Подготовить отчет",
    "description": "Ежемесячный отчет по продажам",
    "assignee_id": 5,
    "deadline": "2025-12-01T18:00:00Z",
    "priority": "HIGH",
    "estimated_hours": 4
  }'
```

### Получение задач с фильтрами
```bash
curl -X GET "http://localhost:8000/api/tasks/?status=IN_PROGRESS&priority=HIGH&deadline_to=2025-12-01" \
  -H "Authorization: Bearer <token>"
```

### Начало работы над задачей
```bash
curl -X POST http://localhost:8000/api/tasks/5/start/ \
  -H "Authorization: Bearer <token>"
```

### Завершение задачи
```bash
curl -X POST http://localhost:8000/api/tasks/5/complete/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"actual_hours": 3.5}'
```

---

## 📝 Коды ошибок

- `400` - Неверные данные (например, дедлайн в прошлом)
- `401` - Не авторизован
- `403` - Нет разрешения на действие
- `404` - Задача не найдена
- `500` - Внутренняя ошибка сервера

---

## 🎨 Рекомендации для фронтенда

### Канбан-доска
Используйте эндпоинт `/api/tasks/kanban/` для получения данных по колонкам.

### Календарь
Используйте `/api/tasks/calendar/?year=2025&month=11` для отображения задач в календаре.

### Фильтрация
Комбинируйте параметры для гибкой фильтрации:
```
/api/tasks/?assignee=<user_id>&status=IN_PROGRESS,NEW&deadline_to=2025-12-01
```

### Обновление статуса
Используйте специальные эндпоинты `/start/`, `/complete/`, `/cancel/` вместо ручного изменения статуса через PATCH.

---

**Система готова к использованию! 🚀**
