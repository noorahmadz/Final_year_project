from django.contrib import admin

from .models import GymExpense


@admin.register(GymExpense)
class GymExpenseAdmin(admin.ModelAdmin):
    list_display = ('gym', 'expense_type', 'amount', 'expense_date', 'created_by', 'created_at')
    list_filter = ('expense_type', 'expense_date', 'gym')
    search_fields = ('gym__name', 'notes')
    list_select_related = ('gym', 'created_by')
    ordering = ('-expense_date', '-created_at')

