# Nginx Reverse Proxy для Real Estate CRM

## Описание

Nginx контейнер работает как reverse proxy и автоматически определяет режим работы:
- **HTTPS режим** - если есть SSL сертификаты в `./nginx/ssl/`
- **HTTP режим** - если сертификатов нет

## Архитектура

```
                    ┌─────────────────────────────────────────┐
                    │              NGINX                      │
Internet ──────────►│  :80 (HTTP)  / :443 (HTTPS)            │
                    └─────────────────────────────────────────┘
                              │            │
                              ▼            ▼
                    ┌─────────────┐  ┌─────────────┐
                    │  Frontend   │  │  Backend    │
                    │  :80        │  │  :8000      │
                    └─────────────┘  └─────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │ PostgreSQL  │
                                    │  :5432      │
                                    └─────────────┘
```

## Маршрутизация

| URL путь     | Направление |
|--------------|-------------|
| `/api/*`     | Backend (Django) |
| `/admin/*`   | Backend (Django Admin) |
| `/media/*`   | Backend (Media файлы) |
| `/static/*`  | Backend (Static файлы) |
| `/*`         | Frontend (React) |

## Настройка SSL

### Вариант 1: Собственные сертификаты

Положите файлы в `./nginx/ssl/`:
- `fullchain.pem` - сертификат (полная цепочка)
- `privkey.pem` - приватный ключ

### Вариант 2: Let's Encrypt

```bash
# Установка certbot
sudo apt install certbot

# Получение сертификата (остановите docker-compose перед этим)
sudo certbot certonly --standalone -d yourdomain.com

# Скопируйте сертификаты
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./nginx/ssl/
```

### Вариант 3: Самоподписанный (только для тестирования)

```bash
cd nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -subj "/CN=localhost"
```

## Запуск

### Production (с nginx)
```bash
docker-compose up -d --build
```

Сервис будет доступен:
- HTTP: http://localhost (или https://localhost если есть SSL)
- Backend API: http://localhost/api/
- Admin: http://localhost/admin/

### Development (без nginx по умолчанию)
```bash
docker-compose -f docker-compose.dev.yml up -d --build
```

## Переменные окружения

| Переменная   | По умолчанию | Описание |
|--------------|--------------|----------|
| `HTTP_PORT`  | 80           | HTTP порт nginx |
| `HTTPS_PORT` | 443          | HTTPS порт nginx |

## Проверка статуса

```bash
# Логи nginx
docker logs crm_nginx

# Health check
curl http://localhost/nginx-health
```

## Структура файлов

```
nginx/
├── Dockerfile              # Docker образ
├── docker-entrypoint.sh    # Скрипт запуска (выбор HTTP/HTTPS)
├── nginx.conf              # Основная конфигурация
├── conf.d/
│   ├── default-http.conf           # HTTP конфигурация
│   └── default-https.conf.template # HTTPS конфигурация
├── ssl/
│   ├── README.md           # Инструкции по SSL
│   ├── fullchain.pem       # Сертификат (создайте сами)
│   └── privkey.pem         # Ключ (создайте сами)
└── README.md               # Этот файл
```
