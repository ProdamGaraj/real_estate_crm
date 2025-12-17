# Docker Setup для Real Estate CRM

## Структура Docker

```
real_estate_crm/
├── docker-compose.yml          # Production конфигурация
├── docker-compose.dev.yml      # Development конфигурация
├── .env.example                # Пример переменных окружения
├── backend/
│   ├── Dockerfile              # Production образ backend
│   ├── Dockerfile.dev          # Development образ backend
│   ├── docker-entrypoint.sh    # Скрипт запуска production
│   └── .dockerignore
└── frontend-new/
    ├── Dockerfile              # Production образ frontend (nginx)
    ├── Dockerfile.dev          # Development образ frontend (vite dev)
    ├── nginx.conf              # Конфиг nginx для production
    └── .dockerignore
```

## Быстрый старт

### 1. Подготовка

```bash
# Копируем файл с переменными окружения
cp .env.example .env

# Редактируем переменные (особенно SECRET_KEY и пароли для production!)
```

### 2. Запуск в Production режиме

```bash
# Сборка и запуск всех сервисов
docker-compose up -d --build

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

После запуска:
- **Frontend**: http://localhost (порт 80)
- **Backend API**: http://localhost:8000/api/
- **Django Admin**: http://localhost:8000/admin/
- **API Docs**: http://localhost:8000/api/docs/

### 3. Запуск в Development режиме

```bash
# Сборка и запуск
docker-compose -f docker-compose.dev.yml up -d --build

# Просмотр логов
docker-compose -f docker-compose.dev.yml logs -f

# Остановка
docker-compose -f docker-compose.dev.yml down
```

После запуска:
- **Frontend**: http://localhost:5173 (с HMR)
- **Backend API**: http://localhost:8000/api/
- **Django Admin**: http://localhost:8000/admin/

## Volumes (Персистентные данные)

### Production volumes:
| Volume | Описание | Путь в контейнере |
|--------|----------|-------------------|
| `postgres_data` | База данных PostgreSQL | `/var/lib/postgresql/data` |
| `media_buildings` | Изображения зданий | `/app/media/buildings` |
| `media_deals` | Документы сделок | `/app/media/deals` |
| `media_layouts` | Планировки квартир | `/app/media/layouts` |
| `media_projects` | Файлы проектов | `/app/media/projects` |
| `media_templates` | Шаблоны документов | `/app/media/templates` |
| `static_files` | Статика Django (admin CSS/JS) | `/app/staticfiles` |
| `backend_logs` | Логи backend | `/app/logs` |
| `frontend_logs` | Логи nginx | `/var/log/nginx` |

### Development volumes:
В режиме разработки используются **bind mounts** - папки монтируются напрямую:
- `./backend` → `/app` (код backend)
- `./frontend-new` → `/app` (код frontend)
- `./backend/media/*` → `/app/media/*` (медиа файлы)

## Управление медиа файлами

### Доступ к файлам из хоста

**Production:**
```bash
# Копирование файла в volume
docker cp ./local-file.jpg crm_backend:/app/media/buildings/

# Копирование из volume на хост
docker cp crm_backend:/app/media/buildings/image.jpg ./

# Просмотр содержимого
docker exec crm_backend ls -la /app/media/
```

**Development:**
Файлы доступны напрямую в `./backend/media/`

### Резервное копирование volumes

```bash
# Бэкап базы данных
docker exec crm_postgres pg_dump -U crm_user real_estate_crm > backup.sql

# Восстановление базы данных
cat backup.sql | docker exec -i crm_postgres psql -U crm_user -d real_estate_crm

# Бэкап медиа файлов
docker run --rm -v media_buildings:/data -v $(pwd):/backup alpine tar czf /backup/media_buildings.tar.gz -C /data .
```

## Полезные команды

```bash
# Статус контейнеров
docker-compose ps

# Логи конкретного сервиса
docker-compose logs -f backend

# Выполнение команд Django
docker exec -it crm_backend python manage.py createsuperuser
docker exec -it crm_backend python manage.py migrate
docker exec -it crm_backend python manage.py shell

# Подключение к PostgreSQL
docker exec -it crm_postgres psql -U crm_user -d real_estate_crm

# Пересборка только backend
docker-compose up -d --build backend

# Очистка неиспользуемых образов
docker system prune -a
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DB_NAME` | Имя базы данных | `real_estate_crm` |
| `DB_USER` | Пользователь БД | `crm_user` |
| `DB_PASSWORD` | Пароль БД | `crm_password_2024` |
| `DB_PORT` | Порт PostgreSQL (внешний) | `5432` |
| `BACKEND_PORT` | Порт backend (внешний) | `8000` |
| `FRONTEND_PORT` | Порт frontend (внешний) | `80` |
| `DEBUG` | Режим отладки Django | `False` |
| `SECRET_KEY` | Секретный ключ Django | - |
| `ALLOWED_HOSTS` | Разрешённые хосты | `localhost,127.0.0.1` |

## Troubleshooting

### Backend не может подключиться к БД
```bash
# Проверить статус postgres
docker-compose logs db

# Подождать пока БД будет готова
docker-compose up -d db
# Подождать 10-15 секунд
docker-compose up -d backend
```

### Ошибка прав доступа к volumes
```bash
# На Linux может потребоваться
sudo chown -R 1000:1000 ./backend/media/
```

### Очистка и полный перезапуск
```bash
docker-compose down -v  # Удалит volumes!
docker-compose up -d --build
```

## Архитектура сети

```
                    ┌─────────────────────────────────────────┐
                    │           crm_network (bridge)          │
                    │                                         │
 User ──► :80 ──────┼──► frontend (nginx)                     │
                    │         │                               │
                    │         │ /api/* ──► backend:8000       │
                    │         │ /media/* ──► backend:8000     │
                    │         │ /static/* ──► backend:8000    │
                    │                                         │
                    │    backend ──► db:5432 (postgres)       │
                    │                                         │
                    └─────────────────────────────────────────┘
```
