from datetime import datetime
import hashlib
import json

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from django.db import transaction
from django.utils import timezone

from apps.common.api import StandardizedModelViewSetMixin, error_response, success_response
from apps.gyms.models import Field, TimeSlot
from .lifecycle import booking_blocks_availability, booking_lifecycle_snapshot, synchronize_booking_lifecycle
from .models import (
    Booking,
    BookingAuditLog,
    BookingIdempotencyKey,
    complete_booking_if_due,
    expire_booking_if_unpaid,
    can_cancel_booking,
    confirm_booking_after_successful_payment,
)
from .utils.intervals import merge_time_intervals, subtract_intervals
from .permissions import (
    IsAdmin,
    IsBookingManager,
    IsBookingUserOrAdmin,
    is_admin,
    is_customer,
    is_owner,
)
from .serializers import (
    BLOCKING_BOOKING_STATUSES,
    BookingCancelSerializer,
    BookingCreateSerializer,
    BookingSerializer,
    BookingUpdateSerializer,
)


ALLOWED_STATUS_TRANSITIONS = {
    'pending': {'confirmed', 'cancelled', 'expired'},
    'confirmed': {'completed'},
    'cancelled': set(),
    'expired': set(),
    'completed': set(),
}


def can_transition_status(current_status, new_status):
    return new_status in ALLOWED_STATUS_TRANSITIONS.get(current_status, set())


def enforce_transition_or_400(*, booking, target_status):
    if not can_transition_status(booking.status, target_status):
        return error_response(
            message=f'Invalid status transition from {booking.status} to {target_status}.',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_booking_state',
        )
    return None


def log_booking_action(*, actor, action, booking=None, metadata=None):
    BookingAuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        booking=booking,
        action=action,
        metadata=metadata or {},
    )


def booking_notification_payload(booking):
    snapshot = booking_lifecycle_snapshot(booking=booking, now=timezone.now())
    return {
        'id': booking.booking_id,
        'date': booking.booking_date,
        'start_time': booking.start_time,
        'end_time': booking.end_time,
        'field': booking.field.field_name,
        'gym': booking.field.gym.name,
        'status': booking.status,
        'lifecycle_state': snapshot['lifecycle_state'],
        'display_status': snapshot['display_status'],
        'can_pay': snapshot['can_pay'],
        'can_cancel': snapshot['can_cancel'],
        'next_actions': snapshot['next_actions'],
    }


def booking_has_ended(*, booking, now=None):
    current_time = timezone.localtime(now or timezone.now())
    booking_end = datetime.combine(booking.booking_date, booking.end_time)
    booking_end = timezone.make_aware(booking_end, timezone.get_current_timezone())
    return booking_end <= current_time


class BookingCreateRateThrottle(UserRateThrottle):
    scope = 'booking_create'
    rate = '5/min'


class BookingAvailabilityRateThrottle(UserRateThrottle):
    scope = 'booking_availability'
    rate = '60/min'


def build_create_request_hash(payload):
    normalized = {
        'field': str(payload.get('field', '')),
        'booking_date': str(payload.get('booking_date', '')),
        'start_time': str(payload.get('start_time', '')),
        'end_time': str(payload.get('end_time', '')),
        'discount_code': str(payload.get('discount_code', '')).strip(),
    }
    canonical = json.dumps(normalized, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


class BookingViewSet(StandardizedModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Booking.objects.select_related('user', 'field', 'field__gym').prefetch_related('payments').all()
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return BookingCreateSerializer
        if self.action in ['update', 'partial_update']:
            return BookingUpdateSerializer
        if self.action == 'cancel':
            return BookingCancelSerializer
        return BookingSerializer

    def get_throttles(self):
        if self.action == 'create':
            return [BookingCreateRateThrottle()]
        if self.action == 'availability':
            return [BookingAvailabilityRateThrottle()]
        return []

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'availability', 'create']:
            return [IsAuthenticated()]
        if self.action == 'destroy':
            return [IsAdmin()]
        if self.action in ['confirm', 'complete']:
            return [IsAdmin()]
        if self.action in ['update', 'partial_update', 'cancel']:
            if self.action == 'cancel':
                return [IsBookingManager()]
            return [IsBookingUserOrAdmin()]
        return [IsAuthenticated()]

    @staticmethod
    def _booking_state_response(*, booking, message):
        booking_data = BookingSerializer(booking).data
        booking_summary = booking_notification_payload(booking)
        return success_response(
            message=message,
            data={
                'booking': booking_data,
                'booking_summary': booking_summary,
            },
            extra={
                'booking': booking_data,
                'booking_summary': booking_summary,
            },
        )

    def get_queryset(self):
        user = self.request.user
        if is_admin(user):
            return self.queryset
        if is_owner(user):
            return self.queryset.filter(field__gym__owner=user)
        return self.queryset.filter(user=user)

    def perform_create(self, serializer):
        user = self.request.user
        if not (is_customer(user) or is_admin(user)):
            raise PermissionDenied('Only customers or admins can create bookings.')
        serializer.save()

    def perform_update(self, serializer):
        booking = self.get_object()
        if booking.status != 'pending':
            raise PermissionDenied('Only pending bookings can be edited.')
        updated_booking = serializer.save()
        log_booking_action(
            actor=self.request.user,
            action='booking_updated',
            booking=updated_booking,
        )

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        request_data = request.data.copy()
        idempotency_key = request.headers.get('Idempotency-Key') or request_data.pop('idempotency_key', None)
        if isinstance(idempotency_key, list):
            idempotency_key = idempotency_key[0] if idempotency_key else None
        idempotency_key = str(idempotency_key).strip() if idempotency_key is not None else ''

        request_hash = build_create_request_hash(request_data)

        if idempotency_key:
            existing_key = BookingIdempotencyKey.objects.select_for_update().select_related('booking').filter(
                user=request.user,
                key=idempotency_key,
            ).first()
            if existing_key:
                if existing_key.request_hash != request_hash:
                    return self.error(
                        message='Idempotency key has already been used with a different request payload.',
                        status_code=status.HTTP_409_CONFLICT,
                        error_code='idempotency_key_conflict',
                    )
                response_data = BookingSerializer(
                    existing_key.booking,
                    context=self.get_serializer_context(),
                ).data
                return self.success(
                    data=response_data,
                    message='Existing booking returned for idempotent retry.',
                    extra=response_data,
                )

        serializer = self.get_serializer(data=request_data)
        serializer.is_valid(raise_exception=True)
        booking = serializer.save()

        if idempotency_key:
            BookingIdempotencyKey.objects.create(
                user=request.user,
                key=idempotency_key,
                request_hash=request_hash,
                booking=booking,
            )

        log_booking_action(
            actor=request.user,
            action='booking_created',
            booking=booking,
            metadata={
                'field_id': booking.field_id,
                'booking_date': booking.booking_date.isoformat(),
                'start_time': str(booking.start_time),
                'end_time': str(booking.end_time),
                'status': booking.status,
            },
        )
        response_data = BookingSerializer(booking, context=self.get_serializer_context()).data
        return self.success(
            data=response_data,
            status_code=status.HTTP_201_CREATED,
            message='Booking created successfully.',
            extra=response_data,
        )

    @transaction.atomic
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        booking = Booking.objects.select_for_update().select_related('field', 'field__gym').get(
            booking_id=self.get_object().booking_id
        )
        self.check_object_permissions(request, booking)

        successful_payment_exists = booking.payments.select_for_update().filter(
            payment_status='success'
        ).exists()
        expire_booking_if_unpaid(
            booking=booking,
            actor=request.user,
            now=timezone.now(),
            trigger='cancel_attempt',
            has_successful_payment=successful_payment_exists,
        )
        if booking.status == 'expired':
            return self.error(
                message='Booking has expired because payment was not completed in time.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='booking_expired',
            )

        transition_error = enforce_transition_or_400(booking=booking, target_status='cancelled')
        if transition_error:
            return transition_error

        if successful_payment_exists:
            return self.error(
                message='Paid bookings cannot be cancelled through this endpoint.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='paid_booking_not_cancellable',
            )

        if not can_cancel_booking(booking=booking, now=timezone.now()):
            return self.error(
                message='Booking can only be cancelled within 20 minutes of creation.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='booking_cancel_window_expired',
            )

        serializer = BookingCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        previous_status = booking.status
        pending_payments = list(
            booking.payments.select_for_update().filter(payment_status='pending')
        )
        for payment in pending_payments:
            payment.mark_failed(gateway='stripe')
        booking.status = 'cancelled'
        booking.save(update_fields=['status'])
        log_booking_action(
            actor=request.user,
            action='booking_cancelled',
            booking=booking,
            metadata={
                'from_status': previous_status,
                'reason': serializer.validated_data.get('reason', ''),
            },
        )

        return self.success(
            data={'booking': BookingSerializer(booking).data},
            message='Booking cancelled successfully.',
        )

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        with transaction.atomic():
            booking = Booking.objects.select_for_update().select_related('field', 'field__gym').get(
                booking_id=self.get_object().booking_id
            )
            has_successful_payment = booking.payments.select_for_update().filter(
                payment_status='success'
            ).exists()
            expire_booking_if_unpaid(
                booking=booking,
                actor=request.user,
                now=timezone.now(),
                trigger='manual_confirm_attempt',
                has_successful_payment=has_successful_payment,
            )
            if booking.status == 'expired':
                return self.error(
                    message='Booking has expired because payment was not completed in time.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='booking_expired',
                )

            if booking.status == 'confirmed' and has_successful_payment:
                return self._booking_state_response(
                    booking=booking,
                    message='Your booking is confirmed',
                )

            if not has_successful_payment:
                return self.error(
                    message='Booking cannot be confirmed without successful payment.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='payment_required',
                )

            transition_error = enforce_transition_or_400(booking=booking, target_status='confirmed')
            if transition_error:
                return transition_error

            confirm_booking_after_successful_payment(
                booking=booking,
                actor=request.user,
                trigger='manual_with_successful_payment',
            )

        return self._booking_state_response(
            booking=booking,
            message='Your booking is confirmed',
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        with transaction.atomic():
            booking = Booking.objects.select_for_update().select_related('field', 'field__gym').get(
                booking_id=self.get_object().booking_id
            )

            if not booking_has_ended(booking=booking):
                return self.error(
                    message='Booking cannot be completed before its end time.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='booking_not_finished',
                )

            transition_error = enforce_transition_or_400(booking=booking, target_status='completed')
            if transition_error:
                return transition_error

            previous_status = booking.status
            completed = complete_booking_if_due(
                booking=booking,
                actor=request.user,
                now=timezone.now(),
                trigger='manual_complete',
            )
            if not completed:
                return self.error(
                    message=f'Invalid status transition from {previous_status} to completed.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='invalid_booking_state',
                )

        return self._booking_state_response(
            booking=booking,
            message='Your booking has been completed',
        )

    @action(detail=False, methods=['get'])
    def availability(self, request):
        field_id = request.query_params.get('field_id')
        date_str = request.query_params.get('date')

        if not field_id or not date_str:
            return self.error(
                message='field_id and date parameters are required.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='missing_required_parameters',
            )

        try:
            field = Field.objects.select_related('gym').get(field_id=field_id)
        except Field.DoesNotExist:
            return self.error(
                message='Field not found.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='field_not_found',
            )

        try:
            requested_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return self.error(
                message='Invalid date format. Use YYYY-MM-DD.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_date_format',
            )

        day_of_week = requested_date.weekday()
        synchronize_booking_lifecycle(
            field_id=field.field_id,
            booking_date=requested_date,
            now=timezone.now(),
            trigger='availability_check',
        )

        slots = TimeSlot.objects.filter(
            field=field,
            day_of_week=day_of_week,
            is_available=True,
        ).order_by('start_time')

        bookings = Booking.objects.filter(
            field=field,
            booking_date=requested_date,
            status__in=BLOCKING_BOOKING_STATUSES,
        ).prefetch_related('payments')

        active_bookings = [
            booking for booking in bookings
            if booking_blocks_availability(booking=booking, now=timezone.now())
        ]

        merged_booked_times = merge_time_intervals(
            [(booking.start_time, booking.end_time) for booking in active_bookings]
        )

        available_ranges = []
        for slot in slots:
            for available_start, available_end in subtract_intervals(
                slot.start_time, slot.end_time, merged_booked_times
            ):
                available_ranges.append((available_start, available_end))

        normalized_available = merge_time_intervals(available_ranges)
        available_slots = [
            {'start': str(start), 'end': str(end)}
            for start, end in normalized_available
        ]

        return self.success(
            data={
                'field_id': field.field_id,
                'field_name': field.field_name,
                'gym_name': field.gym.name,
                'date': date_str,
                'day_of_week': day_of_week,
                'availability_state': 'current',
                'blocked_booking_count': len(active_bookings),
                'available_slots': available_slots,
            },
            extra={'available_slots': available_slots},
        )
