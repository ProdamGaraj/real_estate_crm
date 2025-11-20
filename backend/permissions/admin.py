"""
Административная панель для управления разрешениями
"""
from django.contrib import admin
from .models import Company, Department, Permission, Role, UserProfile, PermissionLog


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'code']
    ordering = ['name']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'parent_department', 'is_active', 'created_at']
    list_filter = ['company', 'is_active', 'created_at']
    search_fields = ['name', 'code']
    ordering = ['company', 'name']


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'action', 'resource', 'scope', 'is_active']
    list_filter = ['action', 'resource', 'scope', 'is_active']
    search_fields = ['code', 'name', 'description']
    ordering = ['resource', 'action', 'scope']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'scope', 'category', 'is_system', 'is_active', 'created_at']
    list_filter = ['scope', 'category', 'is_system', 'is_active', 'created_at']
    search_fields = ['name', 'code', 'description']
    filter_horizontal = ['permissions', 'companies']
    ordering = ['scope', 'category', 'name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'company', 'department', 'position', 'is_system_admin', 'is_active']
    list_filter = ['company', 'department', 'is_system_admin', 'is_active', 'created_at']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'position']
    filter_horizontal = ['roles']
    ordering = ['user__username']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PermissionLog)
class PermissionLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'action', 'entity_type', 'entity_id', 'ip_address', 'created_at']
    list_filter = ['entity_type', 'created_at']
    search_fields = ['user__username', 'action', 'entity_type']
    ordering = ['-created_at']
    readonly_fields = ['user', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at']
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False
