from django.contrib import admin
from .models import Gym, Field, TimeSlot, Discount, Review, GymImage, GymAuditLog


@admin.register(Gym)
class GymAdmin(admin.ModelAdmin):
    """Admin configuration for the Gym model."""

    list_display = ('name', 'city', 'status', 'owner', 'created_at')
    list_filter = ('status', 'city')
    search_fields = ('name', 'address')
    readonly_fields = ('created_at',)

    fieldsets = (
        ('Basic Information', {
            'fields': ('owner', 'name', 'address', 'city', 'phone', 'description')
        }),
        ('Approval', {
            'fields': ('status', 'approved_by', 'approved_at')
        }),
        ('Timestamps', {
            'fields': ('created_at',)
        }),
    )

    list_per_page = 25
    ordering = ('-created_at',)


@admin.register(Field)
class FieldAdmin(admin.ModelAdmin):
    """Admin configuration for the Field model."""

    list_display = ('field_id', 'field_name', 'gym', 'field_type', 'price_per_hour', 'is_available')
    list_filter = ('field_type', 'is_available')
    search_fields = ('field_name', 'gym__name')
    list_per_page = 25
    ordering = ('-field_id',)


@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    """Admin configuration for the TimeSlot model."""

    list_display = ('slot_id', 'field', 'day_of_week', 'start_time', 'end_time', 'is_available')
    list_filter = ('day_of_week', 'is_available')
    list_per_page = 25
    ordering = ('-slot_id',)


@admin.register(Discount)
class DiscountAdmin(admin.ModelAdmin):
    """Admin configuration for the Discount model."""

    list_display = ('discount_id', 'gym', 'title', 'percentage', 'start_date', 'end_date', 'is_active')
    list_filter = ('is_active', 'start_date', 'end_date')
    search_fields = ('title', 'gym__name')
    list_per_page = 25
    ordering = ('-start_date',)


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    """Admin configuration for the Review model."""

    list_display = ('review_id', 'gym', 'user', 'rating', 'created_at')
    list_filter = ('rating', 'created_at')
    search_fields = ('gym__name', 'user__full_name', 'comment')
    list_per_page = 25
    ordering = ('-created_at',)


@admin.register(GymImage)
class GymImageAdmin(admin.ModelAdmin):
    """Admin configuration for the GymImage model."""

    list_display = ('image_id', 'gym', 'image_url', 'uploaded_at')
    list_filter = ('uploaded_at',)
    search_fields = ('gym__name', 'image_url')
    list_per_page = 25
    ordering = ('-uploaded_at',)


@admin.register(GymAuditLog)
class GymAuditLogAdmin(admin.ModelAdmin):
    """Read-only admin configuration for gym audit logs."""

    list_display = ('log_id', 'action', 'gym', 'user', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('gym__name', 'actor__full_name', 'actor__phone', 'action')
    ordering = ('-created_at',)
    readonly_fields = ('log_id', 'gym', 'actor', 'action', 'target_type', 'target_id', 'metadata', 'created_at')

    @admin.display(description='User')
    def user(self, obj):
        return obj.actor

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
