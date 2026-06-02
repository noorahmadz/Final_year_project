from datetime import datetime, timedelta

from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db.models import Q
from django.utils.dateparse import parse_time
from django.utils import timezone
from apps.gyms.models import Field, Discount


class Booking(models.Model):
    """Booking model for managing field reservations."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
        ('expired', 'Expired'),
        ('completed', 'Completed'),
    ]

    booking_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bookings'
    )
    field = models.ForeignKey(
        Field,
        on_delete=models.CASCADE,
        related_name='bookings'
    )
    booking_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    start_datetime = models.DateTimeField(editable=False)
    end_datetime = models.DateTimeField(editable=False)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bookings'
        verbose_name = 'Booking'
        verbose_name_plural = 'Bookings'
        ordering = ['-booking_date']
        constraints = [
            models.CheckConstraint(
                condition=Q(start_time__lt=models.F('end_time')),
                name='booking_start_before_end_check',
            ),
            # Portable fallback for DB-level protection.
            # True interval-overlap exclusion requires PostgreSQL range/exclusion constraints.
            # This unique constraint still blocks exact duplicate active intervals at DB level.
            models.UniqueConstraint(
                fields=['field', 'booking_date', 'start_time', 'end_time'],
                condition=Q(status__in=['pending', 'confirmed']),
                name='booking_exact_active_interval_unique',
            ),
        ]

    def __str__(self):
        return f"Booking {self.booking_id} - {self.user} - {self.field} on {self.booking_date}"

    @staticmethod
    def build_interval_datetimes(booking_date, start_time, end_time):
        if not booking_date or not start_time or not end_time:
            return None, None

        if isinstance(start_time, str):
            start_time = parse_time(start_time)
        if isinstance(end_time, str):
            end_time = parse_time(end_time)

        default_timezone = timezone.get_default_timezone()
        start_dt = timezone.make_aware(datetime.combine(booking_date, start_time), default_timezone)
        end_dt = timezone.make_aware(datetime.combine(booking_date, end_time), default_timezone)
        return start_dt, end_dt

    def sync_interval_datetimes(self):
        self.start_datetime, self.end_datetime = self.build_interval_datetimes(
            self.booking_date,
            self.start_time,
            self.end_time,
        )

    def clean(self):
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({'end_time': 'End time must be after start time.'})

    def save(self, *args, **kwargs):
        self.sync_interval_datetimes()

        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            update_fields = set(update_fields)
            if (
                {'booking_date', 'start_time', 'end_time'} & update_fields
                or self.start_datetime is None
                or self.end_datetime is None
            ):
                update_fields.update({'start_datetime', 'end_datetime'})
            kwargs['update_fields'] = list(update_fields)

        return super().save(*args, **kwargs)


class BookingDiscount(models.Model):
    """BookingDiscount model for managing discounts applied to bookings."""

    id = models.BigAutoField(primary_key=True)
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='booking_discounts'
    )
    discount = models.ForeignKey(
        Discount,
        on_delete=models.CASCADE,
        related_name='booking_discounts'
    )
    # Currency amount for the applied discount (stored with cents to match Booking.total_price).
    discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = 'booking_discounts'
        verbose_name = 'Booking Discount'
        verbose_name_plural = 'Booking Discounts'

    def __str__(self):
        return f"Booking {self.booking.booking_id} - Discount {self.discount.title}"


class BookingAuditLog(models.Model):
    """Lightweight audit log for booking lifecycle and critical operations."""

    log_id = models.BigAutoField(primary_key=True)
    booking = models.ForeignKey(
        Booking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='booking_audit_logs'
    )
    action = models.CharField(max_length=100)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'booking_audit_logs'
        verbose_name = 'Booking Audit Log'
        verbose_name_plural = 'Booking Audit Logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} by {self.actor_id} on booking:{self.booking_id}"


class BookingIdempotencyKey(models.Model):
    """Stores idempotency keys for safe booking creation retries."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='booking_idempotency_keys',
    )
    key = models.CharField(max_length=255)
    request_hash = models.CharField(max_length=64)
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='idempotency_keys',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'booking_idempotency_keys'
        verbose_name = 'Booking Idempotency Key'
        verbose_name_plural = 'Booking Idempotency Keys'
        constraints = [
            models.UniqueConstraint(fields=['user', 'key'], name='booking_idempotency_user_key_unique'),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.key} -> {self.booking_id}"


class BookingLifecycleMonitor(models.Model):
    """
    Singleton-style operational heartbeat for scheduled lifecycle synchronization.
    """

    monitor_key = models.CharField(max_length=50, unique=True, default='booking_lifecycle')
    last_trigger = models.CharField(max_length=100, blank=True, default='')
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_completed_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')
    last_expired_count = models.PositiveIntegerField(default=0)
    last_completed_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'booking_lifecycle_monitor'
        verbose_name = 'Booking Lifecycle Monitor'
        verbose_name_plural = 'Booking Lifecycle Monitor'

    def __str__(self):
        return f'{self.monitor_key} last_success={self.last_success_at}'


BOOKING_CANCELLATION_WINDOW = timedelta(minutes=20)
BOOKING_PENDING_EXPIRY_WINDOW = timedelta(
    minutes=getattr(settings, 'BOOKING_PENDING_EXPIRY_MINUTES', 20)
)


def can_cancel_booking(*, booking, now=None):
    current_time = now or timezone.now()
    return current_time <= (booking.created_at + BOOKING_CANCELLATION_WINDOW)


def booking_cancel_deadline(*, booking):
    return booking.created_at + BOOKING_CANCELLATION_WINDOW


def booking_payment_expires_at(*, booking):
    return booking.created_at + BOOKING_PENDING_EXPIRY_WINDOW


def booking_has_payment_expired(*, booking, now=None):
    current_time = now or timezone.now()
    return current_time >= booking_payment_expires_at(booking=booking)


def expire_booking_if_unpaid(*, booking, actor=None, now=None, trigger='payment_timeout', has_successful_payment=None):
    current_time = now or timezone.now()
    if booking.status != 'pending':
        return False

    if not booking_has_payment_expired(booking=booking, now=current_time):
        return False

    if has_successful_payment is None:
        has_successful_payment = booking.payments.filter(payment_status='success').exists()
    if has_successful_payment:
        return False

    booking.status = 'expired'
    booking.save(update_fields=['status'])
    BookingAuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        booking=booking,
        action='booking_expired',
        metadata={'from_status': 'pending', 'trigger': trigger},
    )
    return True


def complete_booking_if_due(*, booking, actor=None, now=None, trigger='lifecycle_sync'):
    current_time = now or timezone.now()
    if booking.status != 'confirmed':
        return False

    booking_end = booking.end_datetime
    if booking_end is None:
        booking.sync_interval_datetimes()
        booking_end = booking.end_datetime

    if booking_end is None or booking_end > current_time:
        return False

    booking.status = 'completed'
    booking.save(update_fields=['status'])
    BookingAuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        booking=booking,
        action='booking_completed',
        metadata={'from_status': 'confirmed', 'trigger': trigger},
    )
    return True


def confirm_booking_after_successful_payment(*, booking, actor=None, trigger='payment_success'):
    if booking.status != 'pending':
        return False

    booking.status = 'confirmed'
    booking.save(update_fields=['status'])
    BookingAuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        booking=booking,
        action='booking_confirmed',
        metadata={'from_status': 'pending', 'trigger': trigger},
    )
    return True


def current_booking_payment_state(*, booking):
    payments_manager = booking.payments
    if hasattr(booking, '_prefetched_objects_cache') and 'payments' in booking._prefetched_objects_cache:
        payments = sorted(
            booking._prefetched_objects_cache['payments'],
            key=lambda item: (item.created_at, item.booking_payment_id),
            reverse=True,
        )
    else:
        payments = list(payments_manager.order_by('-created_at', '-booking_payment_id')[:1])

    if not payments:
        return 'unpaid', None
    payment = payments[0]
    return payment.payment_status, payment

