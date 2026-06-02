from datetime import datetime, date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from apps.gyms.models import Discount, TimeSlot
from .models import (
    Booking,
    BookingDiscount,
    booking_cancel_deadline,
    booking_payment_expires_at,
)
from .lifecycle import booking_lifecycle_snapshot, booking_blocks_availability, synchronize_booking_lifecycle


BLOCKING_BOOKING_STATUSES = ('pending', 'confirmed')
DISCOUNT_CODE_SUPPORTED = any(field.name == 'code' for field in Discount._meta.fields)


class BookingDiscountSerializer(serializers.ModelSerializer):
    discount_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('0.00'),
    )
    discount_title = serializers.CharField(source='discount.title', read_only=True)

    class Meta:
        model = BookingDiscount
        fields = ['id', 'booking', 'discount', 'discount_title', 'discount_amount']
        read_only_fields = ['id']


class BookingSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    customer_email = serializers.CharField(source='user.email', read_only=True)
    customer_phone = serializers.CharField(source='user.phone', read_only=True)
    field_name = serializers.CharField(source='field.field_name', read_only=True)
    gym_name = serializers.CharField(source='field.gym.name', read_only=True)
    applied_discounts = BookingDiscountSerializer(many=True, read_only=True, source='booking_discounts')
    expires_at = serializers.SerializerMethodField()
    cancel_deadline = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    can_pay = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    payment_summary = serializers.SerializerMethodField()
    next_actions = serializers.SerializerMethodField()
    lifecycle_state = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    is_completed = serializers.SerializerMethodField()
    availability_state = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'booking_id',
            'user',
            'user_name',
            'customer_email',
            'customer_phone',
            'field',
            'field_name',
            'gym_name',
            'booking_date',
            'start_time',
            'end_time',
            'total_price',
            'status',
            'created_at',
            'applied_discounts',
            'expires_at',
            'cancel_deadline',
            'can_cancel',
            'can_pay',
            'payment_status',
            'payment_summary',
            'next_actions',
            'lifecycle_state',
            'display_status',
            'is_expired',
            'is_completed',
            'availability_state',
        ]
        read_only_fields = ['booking_id', 'user', 'total_price', 'status', 'created_at']

    def _snapshot(self, obj):
        return booking_lifecycle_snapshot(booking=obj, now=timezone.now())

    def get_expires_at(self, obj):
        if self._snapshot(obj)['lifecycle_state'] != 'pending':
            return None
        return booking_payment_expires_at(booking=obj).isoformat()

    def get_cancel_deadline(self, obj):
        if self._snapshot(obj)['lifecycle_state'] != 'pending':
            return None
        return booking_cancel_deadline(booking=obj).isoformat()

    def get_can_cancel(self, obj):
        return self._snapshot(obj)['can_cancel']

    def get_can_pay(self, obj):
        return self._snapshot(obj)['can_pay']

    def get_payment_status(self, obj):
        return self._snapshot(obj)['payment_status']

    def get_payment_summary(self, obj):
        snapshot = self._snapshot(obj)
        payment_status = snapshot['payment_status']
        payment = snapshot['payment']
        if payment is None:
            return {
                'status': payment_status,
                'amount': str(obj.total_price),
                'currency': None,
                'payment_intent_id': None,
                'paid_at': None,
                'can_retry': snapshot['can_pay'],
            }
        return {
            'status': payment_status,
            'amount': str(payment.amount),
            'currency': payment.currency,
            'payment_intent_id': payment.transaction_id,
            'paid_at': payment.paid_at.isoformat() if payment.paid_at else None,
            'can_retry': snapshot['can_pay'],
        }

    def get_next_actions(self, obj):
        return self._snapshot(obj)['next_actions']

    def get_lifecycle_state(self, obj):
        return self._snapshot(obj)['lifecycle_state']

    def get_display_status(self, obj):
        return self._snapshot(obj)['display_status']

    def get_is_expired(self, obj):
        return self._snapshot(obj)['is_expired']

    def get_is_completed(self, obj):
        return self._snapshot(obj)['is_completed']

    def get_availability_state(self, obj):
        return self._snapshot(obj)['availability_state']


class BookingCreateSerializer(serializers.ModelSerializer):
    discount_code = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Booking
        fields = ['field', 'booking_date', 'start_time', 'end_time', 'discount_code']

    def validate(self, attrs):
        field = attrs['field']
        booking_date = attrs['booking_date']
        start_time = attrs['start_time']
        end_time = attrs['end_time']
        discount_code = attrs.get('discount_code', '').strip()

        self._validate_booking_window(
            field=field,
            booking_date=booking_date,
            start_time=start_time,
            end_time=end_time,
            instance=self.instance,
        )
        self._validate_discount_code(field=field, discount_code=discount_code)
        return attrs

    @staticmethod
    def _calculate_price(field, start_time, end_time):
        start_dt = datetime.combine(date.today(), start_time)
        end_dt = datetime.combine(date.today(), end_time)
        duration_hours = Decimal(str((end_dt - start_dt).total_seconds())) / Decimal('3600')
        return field.price_per_hour * duration_hours

    @staticmethod
    def _resolve_discount(field, discount_code):
        if not discount_code:
            return None

        if not DISCOUNT_CODE_SUPPORTED:
            return None

        today = timezone.localdate()
        discount_qs = Discount.objects.filter(
            gym=field.gym,
            is_active=True,
            start_date__lte=today,
            end_date__gte=today,
        )
        return discount_qs.filter(code__iexact=discount_code).first()

    @staticmethod
    def _validate_booking_window(*, field, booking_date, start_time, end_time, instance=None):
        if start_time >= end_time:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})

        now_local = timezone.localtime(timezone.now())
        today = now_local.date()

        if booking_date < today:
            raise serializers.ValidationError({'booking_date': 'Booking date cannot be in the past.'})

        if booking_date == today and start_time <= now_local.time().replace(microsecond=0):
            raise serializers.ValidationError({'start_time': 'Start time must be in the future.'})

        if not field.is_available:
            raise serializers.ValidationError({'field': 'This field is not available for booking.'})

        # Enforce gym approval lifecycle at booking time.
        gym = field.gym
        if getattr(gym, 'is_deleted', False):
            raise serializers.ValidationError({'field': 'This gym has been deleted.'})
        if gym.status != 'approved':
            raise serializers.ValidationError({'field': 'This gym is not approved for booking.'})
        if gym.approval_expires_at is not None and gym.approval_expires_at <= timezone.now():
            raise serializers.ValidationError({'field': 'This gym approval has expired.'})

        day_of_week = booking_date.weekday()
        slot_exists = TimeSlot.objects.filter(
            field=field,
            day_of_week=day_of_week,
            is_available=True,
            start_time__lte=start_time,
            end_time__gte=end_time,
        ).exists()
        if not slot_exists:
            raise serializers.ValidationError('Requested time is outside available time slots.')

        overlap_qs = Booking.objects.filter(
            field=field,
            booking_date=booking_date,
            status__in=BLOCKING_BOOKING_STATUSES,
            start_time__lt=end_time,
            end_time__gt=start_time,
        )
        if instance:
            overlap_qs = overlap_qs.exclude(booking_id=instance.booking_id)
        overlapping_bookings = list(overlap_qs.prefetch_related('payments'))
        if any(booking_blocks_availability(booking=booking, now=timezone.now()) for booking in overlapping_bookings):
            raise serializers.ValidationError(
                'This time slot is already booked. Please choose a different time.'
            )

    @staticmethod
    def _validate_discount_code(*, field, discount_code):
        if not discount_code:
            return

        if not DISCOUNT_CODE_SUPPORTED:
            raise serializers.ValidationError(
                {'discount_code': 'Discount code application is not supported.'}
            )

        today_for_discount = timezone.localdate()
        discount_exists = Discount.objects.filter(
            gym=field.gym,
            code__iexact=discount_code,
            is_active=True,
            start_date__lte=today_for_discount,
            end_date__gte=today_for_discount,
        ).exists()
        if not discount_exists:
            raise serializers.ValidationError({'discount_code': 'Invalid or inactive discount code.'})

    @staticmethod
    def _assert_no_overlap_with_lock(*, field, booking_date, start_time, end_time, instance=None):
        synchronize_booking_lifecycle(
            field_id=field.field_id,
            booking_date=booking_date,
            now=timezone.now(),
            trigger='overlap_guard',
        )
        locked_qs = Booking.objects.select_for_update().filter(
            field=field,
            booking_date=booking_date,
            status__in=BLOCKING_BOOKING_STATUSES,
        )
        if instance:
            locked_qs = locked_qs.exclude(booking_id=instance.booking_id)

        conflicting_exists = locked_qs.filter(
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exists()
        if conflicting_exists:
            raise serializers.ValidationError(
                'This time slot is already booked. Please choose a different time.'
            )

    @transaction.atomic
    def create(self, validated_data):
        discount_code = validated_data.pop('discount_code', '').strip()
        request_user = self.context['request'].user

        self._assert_no_overlap_with_lock(
            field=validated_data['field'],
            booking_date=validated_data['booking_date'],
            start_time=validated_data['start_time'],
            end_time=validated_data['end_time'],
        )

        validated_data['user'] = request_user
        base_price = self._calculate_price(
            validated_data['field'],
            validated_data['start_time'],
            validated_data['end_time'],
        ).quantize(Decimal('0.01'))

        try:
            booking = Booking.objects.create(**validated_data, total_price=base_price)
        except IntegrityError:
            raise serializers.ValidationError(
                'This time slot is already booked. Please choose a different time.'
            )

        discount = self._resolve_discount(validated_data['field'], discount_code)
        if discount:
            discount_amount = ((base_price * discount.percentage) / Decimal('100')).quantize(Decimal('0.01'))
            booking.total_price = (base_price - discount_amount).quantize(Decimal('0.01'))
            booking.save(update_fields=['total_price'])
            BookingDiscount.objects.create(
                booking=booking,
                discount=discount,
                discount_amount=discount_amount,
            )

        return booking


class BookingCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class BookingUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ['booking_date', 'start_time', 'end_time']

    def validate(self, attrs):
        instance = self.instance
        field = instance.field
        booking_date = attrs.get('booking_date', instance.booking_date)
        start_time = attrs.get('start_time', instance.start_time)
        end_time = attrs.get('end_time', instance.end_time)

        BookingCreateSerializer._validate_booking_window(
            field=field,
            booking_date=booking_date,
            start_time=start_time,
            end_time=end_time,
            instance=instance,
        )
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        booking_date = validated_data.get('booking_date', instance.booking_date)
        start_time = validated_data.get('start_time', instance.start_time)
        end_time = validated_data.get('end_time', instance.end_time)

        BookingCreateSerializer._assert_no_overlap_with_lock(
            field=instance.field,
            booking_date=booking_date,
            start_time=start_time,
            end_time=end_time,
            instance=instance,
        )
        try:
            return super().update(instance, validated_data)
        except IntegrityError:
            raise serializers.ValidationError(
                'This time slot is already booked. Please choose a different time.'
            )
