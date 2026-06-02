from django.contrib import admin
from .models import GymRevenue


@admin.register(GymRevenue)
class GymRevenueAdmin(admin.ModelAdmin):
    """Admin configuration for the GymRevenue model."""

    list_display = ('revenue_id', 'gym', 'revenue_type', 'amount', 'commission_amount', 'net_amount', 'status', 'created_at')
    list_filter = ('revenue_type', 'status', 'created_at')
    search_fields = (
        'gym__name',
        'booking_payment__transaction_id',
        'tournament_payment__transaction_id',
        'tournament_payment__tournament__name',
    )
    list_per_page = 25
    ordering = ('-created_at',)
    readonly_fields = (
        'gym', 'revenue_type', 'booking_payment', 'tournament_payment',
        'amount', 'commission_amount', 'net_amount', 'status', 'created_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
