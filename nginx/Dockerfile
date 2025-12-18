# =============================================================================
# Nginx Reverse Proxy с автоматическим определением SSL
# =============================================================================

FROM nginx:alpine

# Создание необходимых директорий
RUN mkdir -p /etc/nginx/ssl \
    && mkdir -p /etc/nginx/conf.d \
    && mkdir -p /etc/nginx/templates \
    && mkdir -p /var/www/certbot

# Копирование основной конфигурации
COPY nginx.conf /etc/nginx/nginx.conf

# Копирование шаблонов конфигурации
COPY conf.d/default-http.conf /etc/nginx/templates/default-http.conf
COPY conf.d/default-http-dev.conf /etc/nginx/templates/default-http-dev.conf
COPY conf.d/default-https.conf.template /etc/nginx/templates/default-https.conf.template

# Копирование и настройка entrypoint скрипта
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Порты
EXPOSE 80 443

# Entrypoint для автоматического выбора конфигурации
ENTRYPOINT ["/docker-entrypoint.sh"]
