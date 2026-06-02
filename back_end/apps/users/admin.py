from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom admin configuration for the User model."""

    list_display = ('phone', 'full_name', 'email', 'role', 'is_active', 'is_staff', 'created_at')
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser', 'groups')
    search_fields = ('phone', 'full_name', 'email')
    ordering = ('-created_at',)

    fieldsets = (
        ('Login Credentials', {
            'fields': ('phone', 'password')
        }),
        ('Personal Information', {
            'fields': ('full_name', 'email')
        }),
        ('Permissions', {
            'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Important Dates', {
            'fields': ('last_login', 'created_at')
        }),
    )

    add_fieldsets = (
        ('Create New User', {
            'classes': ('wide',),
            'fields': ('phone', 'full_name', 'email', 'password1', 'password2', 'role', 'is_active', 'is_staff'),
        }),
    )

    readonly_fields = ('created_at', 'last_login')

    filter_horizontal = ('groups', 'user_permissions')

    list_per_page = 25
