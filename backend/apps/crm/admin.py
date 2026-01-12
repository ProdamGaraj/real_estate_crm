from django.contrib import admin
from .models import (
    Client, Application, ApplicationStatus, PreciseSource, 
    RejectionReason, Meeting, ClientPhoneNumber, ClientFile
)


@admin.register(ApplicationStatus)
class ApplicationStatusAdmin(admin.ModelAdmin):
    list_display = ['id', 'code', 'name', 'color', 'order', 'is_active', 'is_final']
    list_editable = ['order', 'is_active']
    search_fields = ['code', 'name']
    ordering = ['order']


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['id', 'full_name', 'email', 'status', 'created_at']
    search_fields = ['full_name', 'email']


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ['id', 'client', 'status', 'source', 'created_at', 'created_by']
    list_filter = ['status', 'source']
    search_fields = ['client__full_name']


@admin.register(RejectionReason)
class RejectionReasonAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'reason_type', 'is_active']
    list_filter = ['reason_type', 'is_active']


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ['id', 'client', 'status', 'planned_date', 'executor']
    list_filter = ['status']
