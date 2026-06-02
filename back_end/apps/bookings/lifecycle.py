from django.db import transaction
from django.utils import timezone

from .models import (
    Booking,
    BookingLifecycleMonitor,
    booking_has_payment_expired,
    can_cancel_booking,
    complete_booking_if_due,
    current_booking_payment_state,
    expire_booking_if_unpaid,
)


DISPLAY_STATUS_MAP = {
    'pending': 'Awaiting payment',
    'confirmed': 'Confirmed',
    'cancelled': 'Cancelled',
    'expired': 'Expired',
    'completed': 'Completed',
}


def _get_lifecycle_monitor():
    monitor, _created = BookingLifecycleMonitor.objects.get_or_create(
        monitor_key='booking_lifecycle'
    )
    return monitor


def mark_lifecycle_sync_started(*, trigger, now=None):
    current_time = now or timezone.now()
    monitor = _get_lifecycle_monitor()
    monitor.last_trigger = trigger
    monitor.last_started_at = current_time
    monitor.last_error = ''
    monitor.save(update_fields=['last_trigger', 'last_started_at', 'last_error', 'updated_at'])
    return monitor


def mark_lifecycle_sync_finished(*, trigger, expired_count, completed_count, now=None):
    current_time = now or timezone.now()
    monitor = _get_lifecycle_monitor()
    monitor.last_trigger = trigger
    monitor.last_completed_at = current_time
    monitor.last_success_at = current_time
    monitor.last_error = ''
    monitor.last_expired_count = expired_count
    monitor.last_completed_count = completed_count
    monitor.save(
        update_fields=[
            'last_trigger',
            'last_completed_at',
            'last_success_at',
            'last_error',
            'last_expired_count',
            'last_completed_count',
            'updated_at',
        ]
    )
    return monitor


def mark_lifecycle_sync_failed(*, trigger, error_message, now=None):
    current_time = now or timezone.now()
    monitor = _get_lifecycle_monitor()
    monitor.last_trigger = trigger
    monitor.last_completed_at = current_time
    monitor.last_error = error_message
    monitor.save(update_fields=['last_trigger', 'last_completed_at', 'last_error', 'updated_at'])
    return monitor


def resolve_booking_lifecycle_state(*, booking, now=None, payment_state=None):
    current_time = now or timezone.now()
    resolved_payment_state = payment_state
    if resolved_payment_state is None:
        resolved_payment_state, _payment = current_booking_payment_state(booking=booking)

    if (
        booking.status == 'pending'
        and resolved_payment_state != 'success'
        and booking_has_payment_expired(booking=booking, now=current_time)
    ):
        return 'expired'

    if booking.status == 'confirmed' and booking.end_datetime and booking.end_datetime <= current_time:
        return 'completed'

    return booking.status


def booking_blocks_availability(*, booking, now=None, payment_state=None):
    lifecycle_state = resolve_booking_lifecycle_state(
        booking=booking,
        now=now,
        payment_state=payment_state,
    )
    return lifecycle_state in {'pending', 'confirmed'}


def booking_lifecycle_snapshot(*, booking, now=None):
    current_time = now or timezone.now()
    payment_status, payment = current_booking_payment_state(booking=booking)
    lifecycle_state = resolve_booking_lifecycle_state(
        booking=booking,
        now=current_time,
        payment_state=payment_status,
    )
    payment_expired = (
        booking.status == 'pending'
        and payment_status != 'success'
        and booking_has_payment_expired(booking=booking, now=current_time)
    )
    can_pay = lifecycle_state == 'pending' and payment_status != 'success' and not payment_expired
    can_cancel = (
        lifecycle_state == 'pending'
        and payment_status != 'success'
        and can_cancel_booking(booking=booking, now=current_time)
        and not payment_expired
    )
    next_actions = []
    if can_pay:
        next_actions.append('pay')
    if can_cancel:
        next_actions.append('cancel')
    if lifecycle_state == 'confirmed':
        next_actions.append('view_confirmation')
    if lifecycle_state == 'completed':
        next_actions.append('view_receipt')
    if lifecycle_state == 'expired':
        next_actions.append('create_new_booking')

    return {
        'status': booking.status,
        'lifecycle_state': lifecycle_state,
        'display_status': DISPLAY_STATUS_MAP.get(lifecycle_state, lifecycle_state.title()),
        'payment_status': payment_status,
        'payment': payment,
        'payment_expired': payment_expired,
        'is_expired': lifecycle_state == 'expired',
        'is_completed': lifecycle_state == 'completed',
        'can_pay': can_pay,
        'can_cancel': can_cancel,
        'next_actions': next_actions,
        'availability_state': 'blocking' if lifecycle_state in {'pending', 'confirmed'} else 'released',
    }


def synchronize_booking_lifecycle(
    *,
    now=None,
    booking_ids=None,
    field_id=None,
    gym_id=None,
    booking_date=None,
    trigger='service_sync',
):
    current_time = now or timezone.now()
    filters = {}
    if booking_ids is not None:
        filters['booking_id__in'] = list(booking_ids)
    if field_id is not None:
        filters['field_id'] = field_id
    if gym_id is not None:
        filters['field__gym_id'] = gym_id
    if booking_date is not None:
        filters['booking_date'] = booking_date

    expired_count = 0
    completed_count = 0

    mark_lifecycle_sync_started(trigger=trigger, now=current_time)
    try:
        with transaction.atomic():
            pending_bookings = list(
                Booking.objects.select_for_update()
                .filter(status='pending', **filters)
                .order_by('booking_id')
            )
            for booking in pending_bookings:
                has_successful_payment = booking.payments.select_for_update().filter(
                    payment_status='success'
                ).exists()
                if expire_booking_if_unpaid(
                    booking=booking,
                    now=current_time,
                    trigger=trigger,
                    has_successful_payment=has_successful_payment,
                ):
                    expired_count += 1

            confirmed_bookings = list(
                Booking.objects.select_for_update()
                .filter(status='confirmed', **filters)
                .order_by('booking_id')
            )
            for booking in confirmed_bookings:
                if complete_booking_if_due(
                    booking=booking,
                    now=current_time,
                    trigger=trigger,
                ):
                    completed_count += 1
    except Exception as exc:
        mark_lifecycle_sync_failed(trigger=trigger, error_message=str(exc), now=current_time)
        raise

    mark_lifecycle_sync_finished(
        trigger=trigger,
        expired_count=expired_count,
        completed_count=completed_count,
        now=current_time,
    )
    return {
        'expired_count': expired_count,
        'completed_count': completed_count,
        'processed_at': current_time,
    }
