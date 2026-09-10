"""  
Views для аутентификации пользователей
"""
import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.conf import settings
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import UserProfile
from .token_cookies import clear_refresh_cookie, get_refresh_token, set_refresh_cookie
from .serializers import UserProfileDetailSerializer
from .throttles import (
    LoginRateThrottle,
    check_account_lockout,
    record_failed_login,
    reset_failed_logins,
)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login_view(request):
    """
    Вход пользователя
    POST /api/auth/login/
    
    Body: {
        "username": "user",
        "password": "password"
    }
    
    Response: {
        "access": "...",
        "refresh": "...",
        "user": {...}
    }
    """
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response(
            {'error': 'Необходимо указать username и password'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Проверяем account lockout
    is_locked, retry_after = check_account_lockout(username)
    if is_locked:
        return Response(
            {
                'error': 'Аккаунт временно заблокирован из-за множества неудачных попыток входа. '
                        f'Попробуйте через {retry_after} секунд.',
                'retry_after': retry_after
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )
    
    # Аутентификация пользователя
    user = authenticate(username=username, password=password)
    
    if user is None:
        record_failed_login(username)
        return Response(
            {'error': 'Неверное имя пользователя или пароль'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    if not user.is_active:
        return Response(
            {'error': 'Учётная запись отключена'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Проверяем профиль пользователя: и активность, и мягкое удаление
    from .token_serializers import profile_login_error

    profile_error = profile_login_error(user)
    if profile_error == 'Профиль пользователя не найден':
        return Response({'error': profile_error}, status=status.HTTP_404_NOT_FOUND)
    if profile_error:
        return Response({'error': profile_error}, status=status.HTTP_403_FORBIDDEN)
    profile = user.profile
    
    # Успешный логин — сбрасываем счётчик
    reset_failed_logins(username)
    
    # Генерация JWT токенов
    refresh = RefreshToken.for_user(user)

    # refresh уходит в httpOnly cookie и в теле ответа не возвращается:
    # из localStorage его мог прочитать любой скрипт на странице
    response = Response({
        'access': str(refresh.access_token),
        'user': UserProfileDetailSerializer(profile).data
    })
    return set_refresh_cookie(response, refresh)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def password_reset_request(request):
    """
    Запрос на восстановление пароля
    POST /api/auth/password-reset/
    
    Body: {
        "email": "user@example.com"
    }
    
    Response: {
        "message": "Инструкции по восстановлению пароля отправлены на email"
    }
    """
    email = request.data.get('email')
    
    if not email:
        return Response(
            {'error': 'Необходимо указать email'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Ищем пользователя по email
    try:
        user = User.objects.get(email=email, is_active=True)
    except User.DoesNotExist:
        # Из соображений безопасности всегда возвращаем успех,
        # даже если пользователь не найден
        return Response({
            'message': 'Если указанный email зарегистрирован в системе, на него будут отправлены инструкции по восстановлению пароля'
        })
    
    # Генерируем токен для сброса пароля
    token = default_token_generator.make_token(user)
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    
    # Формируем ссылку для сброса пароля
    reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
    
    # Отправляем email
    subject = 'Восстановление пароля в CRM системе'
    message = f"""
Здравствуйте, {user.get_full_name() or user.username}!

Вы запросили восстановление пароля для вашей учётной записи в CRM системе.

Для установки нового пароля перейдите по ссылке:
{reset_url}

Ссылка действительна в течение 24 часов.

Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.

С уважением,
Команда CRM
    """
    
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
    except Exception as e:
        # Логируем ошибку, но не показываем пользователю
        logger.exception("Error sending password reset email")
    
    return Response({
        'message': 'Если указанный email зарегистрирован в системе, на него будут отправлены инструкции по восстановлению пароля'
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def password_reset_confirm(request):
    """
    Подтверждение сброса пароля и установка нового
    POST /api/auth/password-reset/confirm/
    
    Body: {
        "uid": "...",
        "token": "...",
        "new_password": "newpassword123"
    }
    
    Response: {
        "message": "Пароль успешно изменён"
    }
    """
    uid = request.data.get('uid')
    token = request.data.get('token')
    new_password = request.data.get('new_password')
    
    if not all([uid, token, new_password]):
        return Response(
            {'error': 'Необходимо указать uid, token и new_password'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Декодируем uid
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response(
            {'error': 'Неверная ссылка для сброса пароля'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Проверяем токен
    if not default_token_generator.check_token(user, token):
        return Response(
            {'error': 'Ссылка для сброса пароля недействительна или истекла'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Валидация пароля через Django validators (AUTH_PASSWORD_VALIDATORS)
    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as e:
        return Response(
            {'error': e.messages},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Устанавливаем новый пароль
    user.set_password(new_password)
    user.save()

    # Отзываем ранее выданные токены и снимаем блокировку по неудачным попыткам
    from .token_serializers import revoke_refresh_tokens

    revoke_refresh_tokens(user)
    reset_failed_logins(user.username)
    
    return Response({
        'message': 'Пароль успешно изменён. Теперь вы можете войти с новым паролем'
    })


@api_view(['POST'])
def logout_view(request):
    """
    Выход пользователя.

    Refresh-токен берётся из httpOnly cookie (или из тела — для совместимости
    со старыми клиентами), помещается в чёрный список, cookie удаляется.

    POST /api/auth/logout/
    """
    refresh_token = get_refresh_token(request)
    if not refresh_token:
        # Сессии и так нет — считаем выход выполненным и чистим cookie
        return clear_refresh_cookie(Response({'message': 'Выход выполнен успешно'}))

    try:
        RefreshToken(refresh_token).blacklist()
    except TokenError:
        # Токен уже недействителен: для пользователя это всё равно выход
        logger.info('Logout with an already invalid refresh token')

    return clear_refresh_cookie(Response({'message': 'Выход выполнен успешно'}))
