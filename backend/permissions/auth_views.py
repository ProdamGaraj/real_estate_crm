"""
Views для аутентификации пользователей
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.conf import settings
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.template.loader import render_to_string

from .models import UserProfile
from .serializers import UserProfileDetailSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
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
    
    # Аутентификация пользователя
    user = authenticate(username=username, password=password)
    
    if user is None:
        return Response(
            {'error': 'Неверное имя пользователя или пароль'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    if not user.is_active:
        return Response(
            {'error': 'Учётная запись отключена'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Проверяем профиль пользователя
    try:
        profile = user.profile
        if not profile.is_active:
            return Response(
                {'error': 'Профиль пользователя отключён'},
                status=status.HTTP_403_FORBIDDEN
            )
    except UserProfile.DoesNotExist:
        return Response(
            {'error': 'Профиль пользователя не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Генерация JWT токенов
    refresh = RefreshToken.for_user(user)
    
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserProfileDetailSerializer(profile).data
    })


@api_view(['POST'])
@permission_classes([AllowAny])
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
        print(f"Error sending email: {e}")
    
    return Response({
        'message': 'Если указанный email зарегистрирован в системе, на него будут отправлены инструкции по восстановлению пароля'
    })


@api_view(['POST'])
@permission_classes([AllowAny])
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
    
    # Валидация пароля
    if len(new_password) < 8:
        return Response(
            {'error': 'Пароль должен содержать минимум 8 символов'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Устанавливаем новый пароль
    user.set_password(new_password)
    user.save()
    
    return Response({
        'message': 'Пароль успешно изменён. Теперь вы можете войти с новым паролем'
    })


@api_view(['POST'])
def logout_view(request):
    """
    Выход пользователя (добавление refresh токена в черный список)
    POST /api/auth/logout/
    
    Body: {
        "refresh": "..."
    }
    
    Response: {
        "message": "Выход выполнен успешно"
    }
    """
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        return Response({'message': 'Выход выполнен успешно'})
    except Exception:
        return Response(
            {'error': 'Неверный токен'},
            status=status.HTTP_400_BAD_REQUEST
        )
