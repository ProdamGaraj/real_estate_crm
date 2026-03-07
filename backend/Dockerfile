# Backend Dockerfile
FROM python:3.12-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Создание non-root пользователя для безопасности
RUN addgroup --system app && adduser --system --ingroup app app

# Создание рабочей директории
WORKDIR /app

# Копирование файла зависимостей
COPY requirements.txt .

# Установка Python зависимостей
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Копирование исходного кода
COPY . .

# Создание директорий для медиа, статики и логов с правами для app
RUN mkdir -p /app/media /app/staticfiles /app/logs \
    && chown -R app:app /app

# Переменные окружения
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Порт
EXPOSE 8000

# Скрипт запуска (запускается root, переключается на app через gosu)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
