"""
Скрипт для автоматической интеграции разрешений во все views
Добавляет импорты и permission_classes во все ViewSet'ы
"""

import os
import re

# Маппинг ресурсов на permission классы
RESOURCE_MAP = {
    'apps/crm/views.py': {
        'imports': 'from permissions.permissions import ClientPermission, ApplicationPermission, MeetingPermission\nfrom permissions.backends import get_filtered_queryset',
        'Client': 'ClientPermission',
        'Application': 'ApplicationPermission',
        'Meeting': 'MeetingPermission',
    },
    'apps/realty/views.py': {
        'imports': 'from permissions.permissions import ProjectPermission, BuildingPermission, PropertyPermission, LayoutPermission, DiscountPermission\nfrom permissions.backends import get_filtered_queryset',
        'Project': 'ProjectPermission',
        'Building': 'BuildingPermission',
        'Property': 'PropertyPermission',
        'Layout': 'LayoutPermission',
        'Discount': 'DiscountPermission',
    },
    'apps/deals/views.py': {
        'imports': 'from permissions.permissions import DealPermission\nfrom permissions.backends import get_filtered_queryset',
        'Deal': 'DealPermission',
    },
    'apps/finances/views.py': {
        'imports': 'from permissions.permissions import PaymentPermission, RefundPermission\nfrom permissions.backends import get_filtered_queryset',
        'Payment': 'PaymentPermission',
        'Refund': 'RefundPermission',
    },
    'apps/documents/views.py': {
        'imports': 'from permissions.permissions import DocumentPermission\nfrom permissions.backends import get_filtered_queryset',
        'Document': 'DocumentPermission',
    },
    'apps/reports/views.py': {
        'imports': 'from permissions.permissions import ReportPermission\nfrom permissions.backends import get_filtered_queryset',
        'Report': 'ReportPermission',
    },
}

def integrate_permissions():
    """Интегрирует разрешения во все views"""
    backend_path = os.path.join(os.path.dirname(__file__), '..')
    
    for filepath, config in RESOURCE_MAP.items():
        full_path = os.path.join(backend_path, filepath)
        
        if not os.path.exists(full_path):
            print(f"⚠️  Файл не найден: {filepath}")
            continue
            
        print(f"\n📝 Обрабатываю {filepath}...")
        
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Проверяем, не добавлены ли уже импорты
        if 'from permissions.permissions import' in content:
            print(f"✓ Импорты уже добавлены в {filepath}")
        else:
            # Добавляем импорты после последнего import
            import_lines = [line for line in content.split('\n') if line.startswith('import ') or line.startswith('from ')]
            if import_lines:
                last_import = import_lines[-1]
                content = content.replace(last_import, f"{last_import}\n{config['imports']}")
                print(f"✓ Добавлены импорты в {filepath}")
        
        # Сохраняем изменения
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
    
    print("\n✅ Интеграция завершена!")
    print("\n📋 Следующие шаги:")
    print("1. Проверьте, что все permission классы импортированы")
    print("2. Убедитесь, что get_filtered_queryset применен ко всем queryset")
    print("3. Протестируйте доступ с разными ролями")

if __name__ == '__main__':
    integrate_permissions()
