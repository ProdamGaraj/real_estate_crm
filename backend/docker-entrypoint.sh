#!/bin/bash
set -e

# Ожидание базы данных
echo "Waiting for database..."
while ! python -c "import socket; socket.create_connection(('${DB_HOST:-db}', ${DB_PORT:-5432}), timeout=1)" 2>/dev/null; do
    sleep 1
done
echo "Database is ready!"

# Ожидание Redis
echo "Waiting for Redis..."
while ! python -c "import socket; socket.create_connection(('redis', 6379), timeout=1)" 2>/dev/null; do
    sleep 1
done
echo "Redis is ready!"

# Исправление прав на mounted volumes (entrypoint запускается от root)
echo "Fixing volume permissions..."
chown -R app:app /app/media /app/staticfiles /app/logs

# Применение миграций (от имени app)
echo "Applying database migrations..."
gosu app python manage.py migrate --noinput

# Сбор статических файлов (от имени app)
echo "Collecting static files..."
gosu app python manage.py collectstatic --noinput

# Запуск сервера от имени non-root пользователя через gosu
echo "Starting Gunicorn server..."
exec gosu app gunicorn real_estate_project.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --threads 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
