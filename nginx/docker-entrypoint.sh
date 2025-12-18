#!/bin/sh
# =============================================================================
# Nginx Docker Entrypoint
# Автоматически определяет наличие SSL сертификатов и выбирает конфигурацию
# =============================================================================

set -e

SSL_CERT="/etc/nginx/ssl/fullchain.pem"
SSL_KEY="/etc/nginx/ssl/privkey.pem"
CONF_DIR="/etc/nginx/conf.d"
DEV_MODE="${DEV_MODE:-false}"

echo "=================================================="
echo "  Nginx Reverse Proxy Startup"
echo "=================================================="

# Очищаем старые конфиги
rm -f ${CONF_DIR}/*.conf

# Проверяем наличие SSL сертификатов
if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "[INFO] SSL сертификаты найдены!"
    echo "  - Certificate: $SSL_CERT"
    echo "  - Private Key: $SSL_KEY"
    echo "[INFO] Запуск в HTTPS режиме..."
    
    # Копируем HTTPS конфигурацию
    cp /etc/nginx/templates/default-https.conf.template ${CONF_DIR}/default.conf
    
    echo "[INFO] HTTPS конфигурация активирована"
    echo "  - HTTP:  порт 80 (редирект на HTTPS)"
    echo "  - HTTPS: порт 443"
elif [ "$DEV_MODE" = "true" ]; then
    echo "[INFO] Development режим активирован"
    echo "[INFO] Запуск с поддержкой Vite HMR..."
    
    # Копируем Dev HTTP конфигурацию
    cp /etc/nginx/templates/default-http-dev.conf ${CONF_DIR}/default.conf
    
    echo "[INFO] HTTP Development конфигурация активирована"
    echo "  - HTTP: порт 80 (с поддержкой Vite HMR)"
else
    echo "[INFO] SSL сертификаты НЕ найдены"
    echo "  - Ожидаемые файлы:"
    echo "    $SSL_CERT"
    echo "    $SSL_KEY"
    echo "[INFO] Запуск в HTTP режиме..."
    
    # Копируем HTTP конфигурацию
    cp /etc/nginx/templates/default-http.conf ${CONF_DIR}/default.conf
    
    echo "[INFO] HTTP конфигурация активирована"
    echo "  - HTTP: порт 80"
fi

echo "=================================================="
echo "[INFO] Проверка конфигурации nginx..."
nginx -t

echo "=================================================="
echo "[INFO] Запуск nginx..."
exec nginx -g 'daemon off;'
