"""
Кастомные DRF permissions классы для проверки разрешений
"""
from rest_framework import permissions
from .backends import can_user_perform_action


class BaseResourcePermission(permissions.BasePermission):
    """
    Базовый класс для проверки разрешений на ресурсы
    """
    resource_type = None  # Должен быть переопределен в подклассах
    
    def has_permission(self, request, view):
        """
        Проверка разрешения на уровне представления (для списков)
        """
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Определяем действие на основе метода HTTP
        action = self._get_action_from_method(request.method)
        
        if action is None:
            return False
        
        # Для действий кроме VIEW проверяем минимальное разрешение OWN
        # Для VIEW достаточно любого разрешения
        return can_user_perform_action(
            request.user,
            action,
            self.resource_type
        )
    
    def has_object_permission(self, request, view, obj):
        """
        Проверка разрешения на уровне объекта
        """
        if not request.user or not request.user.is_authenticated:
            return False
        
        action = self._get_action_from_method(request.method)
        
        if action is None:
            return False
        
        return can_user_perform_action(
            request.user,
            action,
            self.resource_type,
            obj=obj
        )
    
    def _get_action_from_method(self, method):
        """
        Определение действия на основе HTTP метода
        """
        method_action_map = {
            'GET': 'VIEW',
            'POST': 'ADD',
            'PUT': 'EDIT',
            'PATCH': 'EDIT',
            'DELETE': 'DELETE',
        }
        return method_action_map.get(method)


# Permissions для CRM модуля
class ClientPermission(BaseResourcePermission):
    resource_type = 'CLIENT'


class ApplicationPermission(BaseResourcePermission):
    resource_type = 'APPLICATION'


class MeetingPermission(BaseResourcePermission):
    resource_type = 'MEETING'


# Permissions для Realty модуля
class ProjectPermission(BaseResourcePermission):
    resource_type = 'PROJECT'


class BuildingPermission(BaseResourcePermission):
    resource_type = 'BUILDING'


class BuildingTypePermission(BaseResourcePermission):
    resource_type = 'BUILDING_TYPE'


class PropertyPermission(BaseResourcePermission):
    resource_type = 'PROPERTY'


class LayoutPermission(BaseResourcePermission):
    resource_type = 'LAYOUT'


class DiscountPermission(BaseResourcePermission):
    resource_type = 'DISCOUNT'


# Permissions для Deals модуля
class DealPermission(BaseResourcePermission):
    resource_type = 'DEAL'


# Permissions для Finances модуля
class PaymentPermission(BaseResourcePermission):
    resource_type = 'PAYMENT'


class PaymentTypePermission(BaseResourcePermission):
    resource_type = 'PAYMENT_TYPE'


class BeneficiaryAccountPermission(BaseResourcePermission):
    resource_type = 'BENEFICIARY_ACCOUNT'


# Permissions для Documents модуля
class TemplatePermission(BaseResourcePermission):
    resource_type = 'TEMPLATE'


# Permissions для Reports модуля
class ReportPermission(BaseResourcePermission):
    resource_type = 'REPORT'


class PlanPermission(BaseResourcePermission):
    resource_type = 'PLAN'


# Permissions для Permissions модуля
class UserPermission(BaseResourcePermission):
    resource_type = 'USER'


class RolePermission(BaseResourcePermission):
    resource_type = 'ROLE'


class PermissionManagementPermission(BaseResourcePermission):
    resource_type = 'PERMISSION'


class CompanyPermission(BaseResourcePermission):
    resource_type = 'COMPANY'


class DepartmentPermission(BaseResourcePermission):
    resource_type = 'DEPARTMENT'


# Permissions для системных ресурсов
class DashboardPermission(BaseResourcePermission):
    resource_type = 'DASHBOARD'
    
    def has_permission(self, request, view):
        """
        Для дашборда проверяем только VIEW разрешение
        """
        if not request.user or not request.user.is_authenticated:
            return False
        
        return can_user_perform_action(
            request.user,
            'VIEW',
            self.resource_type
        )


class SettingsPermission(BaseResourcePermission):
    resource_type = 'SETTINGS'


class IsSystemAdmin(permissions.BasePermission):
    """
    Разрешение только для системных администраторов
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        try:
            return request.user.profile.is_system_admin
        except:
            return False


class IsCompanyAdmin(permissions.BasePermission):
    """
    Разрешение для администраторов компании
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        try:
            profile = request.user.profile
            if profile.is_system_admin:
                return True
            
            return profile.roles.filter(
                level='COMPANY_ADMIN',
                is_active=True
            ).exists()
        except:
            return False


class IsDepartmentManager(permissions.BasePermission):
    """
    Разрешение для руководителей отделов
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        try:
            profile = request.user.profile
            if profile.is_system_admin:
                return True
            
            return profile.roles.filter(
                level__in=['COMPANY_ADMIN', 'DEPARTMENT_MANAGER'],
                is_active=True
            ).exists()
        except:
            return False


class HasValidPartnerAPIKey(permissions.BasePermission):
    """
    Разрешение для партнёров с валидным API-ключом.
    Проверяет наличие и валидность API-ключа в заголовке X-API-Key.
    
    Безопасность:
    - В продакшене требует HTTPS
    - Проверяет срок действия ключа
    - Проверяет белый список IP (если настроен)
    - Логирует использование ключа
    
    Возвращает:
    - 401 если ключ отсутствует, неверный, деактивирован или истёк
    - 403 если ключ валидный, но нет нужного scope или IP запрещён
    """
    message = "Требуется валидный API-ключ партнёра"
    required_scope = None  # Переопределяется в наследниках
    
    def has_permission(self, request, view):
        from django.conf import settings
        from rest_framework.exceptions import NotAuthenticated, PermissionDenied
        from .models import PartnerAPIKey
        
        # В продакшене требуем HTTPS
        if not settings.DEBUG:
            if not request.is_secure():
                raise PermissionDenied("API-ключи можно использовать только через HTTPS")
        
        # Получаем ключ из заголовка (рекомендуется) или query параметра
        api_key = request.headers.get('X-API-Key') or request.query_params.get('api_key')
        
        if not api_key:
            raise NotAuthenticated("Отсутствует API-ключ. Передайте его в заголовке X-API-Key")
        
        # Ищем ключ в базе
        try:
            partner_key = PartnerAPIKey.objects.prefetch_related('companies').get(key=api_key)
        except PartnerAPIKey.DoesNotExist:
            raise NotAuthenticated("Недействительный API-ключ")
        
        # Проверяем валидность (активность + срок действия)
        if not partner_key.is_valid():
            raise NotAuthenticated("API-ключ деактивирован или истёк срок действия")
        
        # Проверка IP-адреса (если настроен белый список)
        client_ip = self._get_client_ip(request)
        if not partner_key.is_ip_allowed(client_ip):
            raise PermissionDenied(f"Доступ с IP-адреса {client_ip} запрещён для данного ключа")
        
        # Проверяем scope (если указан)
        if self.required_scope and not partner_key.has_scope(self.required_scope):
            raise PermissionDenied(f"API-ключ не имеет разрешения на действие: {self.required_scope}")
        
        # Обновляем время последнего использования
        partner_key.update_last_used()
        
        # Сохраняем партнёра в request для использования во views
        request.partner_api_key = partner_key
        request.partner_companies = list(partner_key.companies.all())
        
        return True
    
    def _get_client_ip(self, request):
        """Получает IP-адрес клиента (с учётом прокси)"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')


class HasPartnerViewProjectsScope(HasValidPartnerAPIKey):
    """Требует API-ключ с правом просмотра проектов"""
    required_scope = 'VIEW_PROJECTS'


class HasPartnerViewBuildingsScope(HasValidPartnerAPIKey):
    """Требует API-ключ с правом просмотра зданий"""
    required_scope = 'VIEW_BUILDINGS'


class HasPartnerViewLayoutsScope(HasValidPartnerAPIKey):
    """Требует API-ключ с правом просмотра планировок"""
    required_scope = 'VIEW_LAYOUTS'


class HasPartnerCreateApplicationScope(HasValidPartnerAPIKey):
    """Требует API-ключ с правом создания заявок"""
    required_scope = 'CREATE_APPLICATION'


class PartnerAPIKeyPermission(BaseResourcePermission):
    """Разрешение на управление API-ключами партнёров"""
    resource = 'PARTNER_API_KEY'
