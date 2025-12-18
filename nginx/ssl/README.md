# Папка для SSL сертификатов

Положите сюда ваши SSL сертификаты:
- `fullchain.pem` - полная цепочка сертификатов
- `privkey.pem` - приватный ключ

## Если используете Let's Encrypt:
```bash
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./fullchain.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./privkey.pem
```

## Для создания самоподписанного сертификата (только для тестирования):
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -subj "/CN=localhost"
```
