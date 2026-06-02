from django.contrib import admin
from .models import Booking, BookingDiscount, BookingAuditLog, BookingIdempotencyKey


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('booking_id', 'user', 'field', 'booking_date', 'start_time', 'end_time', 'total_price', 'status')
    list_filter = ('status', 'booking_date')
    search_fields = ('user__full_name', 'field__field_name')
    ordering = ('-booking_date', '-start_time')
    readonly_fields = ('booking_id', 'created_at')


@admin.register(BookingDiscount)
class BookingDiscountAdmin(admin.ModelAdmin):
    list_display = ('id', 'booking', 'discount', 'discount_amount')
    list_filter = ('discount',)
    search_fields = ('booking__booking_id', 'discount__title')


@admin.register(BookingAuditLog)
class BookingAuditLogAdmin(admin.ModelAdmin):
    list_display = ('log_id', 'action', 'booking', 'actor', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('booking__booking_id', 'actor__full_name', 'action')
    ordering = ('-created_at',)
    readonly_fields = ('log_id', 'booking', 'actor', 'action', 'metadata', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BookingIdempotencyKey)
class BookingIdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'key', 'booking', 'created_at')
    search_fields = ('user__full_name', 'key', 'booking__booking_id')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'user', 'key', 'request_hash', 'booking', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
