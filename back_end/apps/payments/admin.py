from django.contrib import admin
from .models import BookingPayment, StripeWebhookEvent


@admin.register(BookingPayment)
class BookingPaymentAdmin(admin.ModelAdmin):
    list_display = ('booking_payment_id', 'booking', 'amount', 'currency', 'gateway_name', 'transaction_id', 'payment_status', 'paid_at', 'created_at')
    list_filter = ('payment_status', 'created_at')
    search_fields = ('booking__booking_id', 'transaction_id')

@admin.register(StripeWebhookEvent)
class StripeWebhookEventAdmin(admin.ModelAdmin):
    list_display = ('stripe_event_id', 'event_type', 'payment_intent_id', 'processed_at', 'received_at')
    list_filter = ('event_type', 'processed_at', 'received_at')
    search_fields = ('stripe_event_id', 'payment_intent_id')
