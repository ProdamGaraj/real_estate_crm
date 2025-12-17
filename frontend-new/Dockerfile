# Frontend Dockerfile - Multi-stage build

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Копирование package.json и lock файла
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Установка зависимостей
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Копирование исходного кода
COPY . .

# Аргументы для сборки (API URL)
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL

# Сборка приложения
RUN npm run build

# Stage 2: Production с nginx
FROM nginx:alpine AS production

# Копирование собранного приложения
COPY --from=builder /app/dist /usr/share/nginx/html

# Копирование конфигурации nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Порт
EXPOSE 80

# Запуск nginx
CMD ["nginx", "-g", "daemon off;"]
