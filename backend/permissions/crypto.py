"""
Утилиты для шифрования/дешифрования API-ключей.

Используем Fernet (AES-128-CBC) для обратимого шифрования ключей,
и HMAC-SHA-256 хеш для быстрого поиска по ключу в БД.

Ключ шифрования выводится из SECRET_KEY Django через PBKDF2.
"""
import hashlib
import hmac
import base64
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)

# Кешируем Fernet-объект на время жизни процесса
_fernet_instance = None


def _get_fernet():
    """
    Создаёт Fernet-объект на основе SECRET_KEY.
    Используем PBKDF2 для деривации 32-байтного ключа из SECRET_KEY.
    """
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    # Деривация ключа из SECRET_KEY через PBKDF2
    # Соль конфигурируется через settings.PARTNER_API_ENCRYPTION_SALT
    # ВАЖНО: изменение соли сделает невозможной расшифровку существующих ключей!
    salt = getattr(
        settings,
        'PARTNER_API_ENCRYPTION_SALT',
        b'partner-api-key-encryption-salt'
    )
    if isinstance(salt, str):
        salt = salt.encode('utf-8')
    dk = hashlib.pbkdf2_hmac(
        'sha256',
        settings.SECRET_KEY.encode('utf-8'),
        salt,
        iterations=100_000,
        dklen=32,
    )
    # Fernet требует url-safe base64 ключ длиной 32 байта
    fernet_key = base64.urlsafe_b64encode(dk)
    _fernet_instance = Fernet(fernet_key)
    return _fernet_instance


def encrypt_api_key(plaintext_key: str) -> str:
    """
    Шифрует API-ключ для хранения в БД.
    
    Args:
        plaintext_key: Оригинальный API-ключ в открытом виде
        
    Returns:
        Зашифрованная строка (base64)
    """
    f = _get_fernet()
    return f.encrypt(plaintext_key.encode('utf-8')).decode('utf-8')


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Дешифрует API-ключ из БД для отображения.
    
    Args:
        encrypted_key: Зашифрованный ключ из БД
        
    Returns:
        Оригинальный API-ключ в открытом виде
        
    Raises:
        ValueError: Если ключ не может быть дешифрован
    """
    if not encrypted_key:
        return ''
    
    f = _get_fernet()
    try:
        return f.decrypt(encrypted_key.encode('utf-8')).decode('utf-8')
    except (InvalidToken, Exception) as e:
        logger.error(f'Не удалось дешифровать API-ключ: {e}')
        raise ValueError('Не удалось дешифровать API-ключ') from e


def hash_api_key(plaintext_key: str) -> str:
    """
    Создаёт HMAC-SHA-256 хеш API-ключа для поиска в БД.
    Использует SECRET_KEY как ключ HMAC для защиты от радужных таблиц.
    
    Args:
        plaintext_key: Оригинальный API-ключ
        
    Returns:
        Hex-строка HMAC-SHA-256 хеша
    """
    return hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        plaintext_key.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def _hash_api_key_legacy(plaintext_key: str) -> str:
    """
    Устаревший SHA-256 хеш без HMAC.
    Используется для обратной совместимости при поиске ключей,
    созданных до перехода на HMAC.
    """
    return hashlib.sha256(plaintext_key.encode('utf-8')).hexdigest()
