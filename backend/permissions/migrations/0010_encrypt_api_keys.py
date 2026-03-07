"""
Миграция: переход от plaintext API-ключей к зашифрованному хранению.

1. Добавляем поля key_hash и key_encrypted
2. Мигрируем существующие plaintext ключи: хешируем и шифруем
3. Удаляем старое поле key
"""
from django.db import migrations, models


def migrate_keys_forward(apps, schema_editor):
    """
    Мигрирует существующие plaintext ключи:
    - key -> key_hash (SHA-256 хеш)
    - key -> key_encrypted (Fernet-зашифрованный)
    """
    PartnerAPIKey = apps.get_model('permissions', 'PartnerAPIKey')
    
    for api_key in PartnerAPIKey.objects.all():
        if api_key.key and not api_key.key_hash:
            # Импортируем утилиты шифрования
            from permissions.crypto import hash_api_key, encrypt_api_key
            api_key.key_hash = hash_api_key(api_key.key)
            api_key.key_encrypted = encrypt_api_key(api_key.key)
            api_key.save(update_fields=['key_hash', 'key_encrypted'])


def migrate_keys_backward(apps, schema_editor):
    """
    Откат: расшифровываем ключи обратно в plaintext поле key.
    """
    PartnerAPIKey = apps.get_model('permissions', 'PartnerAPIKey')
    
    for api_key in PartnerAPIKey.objects.all():
        if api_key.key_encrypted and not api_key.key:
            from permissions.crypto import decrypt_api_key
            try:
                api_key.key = decrypt_api_key(api_key.key_encrypted)
                api_key.save(update_fields=['key'])
            except Exception:
                pass  # При откате допускаем потерю ключей


class Migration(migrations.Migration):

    dependencies = [
        ('permissions', '0009_userprofile_is_deleted'),
    ]

    operations = [
        # Шаг 1: Добавляем key_hash (nullable, без индекса — unique добавим позже)
        migrations.AddField(
            model_name='partnerapikey',
            name='key_hash',
            field=models.CharField(
                max_length=64, verbose_name='Хеш API ключа',
                null=True, blank=True, editable=False,
            ),
        ),
        # Шаг 2: Добавляем key_encrypted
        migrations.AddField(
            model_name='partnerapikey',
            name='key_encrypted',
            field=models.TextField(
                verbose_name='Зашифрованный API ключ',
                editable=False, default='',
            ),
        ),
        
        # Шаг 3: Мигрируем данные (шифруем и хешируем существующие ключи)
        migrations.RunPython(migrate_keys_forward, migrate_keys_backward),
        
        # Шаг 4: Удаляем старое поле key
        migrations.RemoveField(
            model_name='partnerapikey',
            name='key',
        ),
        
        # Шаг 5: Делаем key_hash unique и not null (ПОСЛЕ удаления key)
        migrations.AlterField(
            model_name='partnerapikey',
            name='key_hash',
            field=models.CharField(
                db_index=True, editable=False, max_length=64,
                unique=True, verbose_name='Хеш API ключа',
            ),
        ),
    ]
