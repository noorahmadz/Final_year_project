from rest_framework import serializers
from .models import BookingPayment, TournamentPayment
from apps.bookings.lifecycle import booking_lifecycle_snapshot
from apps.bookings.models import Booking, booking_payment_expires_at
from apps.tournaments.roster import REQUIRED_TEAM_MEMBER_COUNT, normalize_team_members
from apps.tournaments.serializers import TeamMemberInputSerializer


class BookingPaymentSerializer(serializers.ModelSerializer):
    """Serializer for BookingPayment model."""
    booking_details = serializers.SerializerMethodField()
    booking_status = serializers.CharField(source='booking.status', read_only=True)
    booking_lifecycle_state = serializers.SerializerMethodField()
    booking_display_status = serializers.SerializerMethodField()
    booking_expires_at = serializers.SerializerMethodField()
    can_retry_payment = serializers.SerializerMethodField()
    next_actions = serializers.SerializerMethodField()
    failure_reason = serializers.SerializerMethodField()
    
    class Meta:
        model = BookingPayment
        fields = [
            'booking_payment_id', 'booking', 'booking_details', 'amount', 'currency',
            'gateway_name', 'transaction_id', 'payment_status', 'booking_status',
            'booking_lifecycle_state', 'booking_display_status',
            'booking_expires_at', 'can_retry_payment', 'next_actions',
            'failure_reason',
            'paid_at', 'created_at'
        ]
        read_only_fields = [
            'booking_payment_id', 'transaction_id', 'payment_status', 
            'paid_at', 'created_at'
        ]
    
    def get_booking_details(self, obj):
        return {
            'field_name': obj.booking.field.field_name,
            'gym_name': obj.booking.field.gym.name,
            'booking_date': obj.booking.booking_date,
            'start_time': obj.booking.start_time,
            'end_time': obj.booking.end_time
        }

    def get_booking_expires_at(self, obj):
        snapshot = booking_lifecycle_snapshot(booking=obj.booking)
        if snapshot['lifecycle_state'] != 'pending':
            return None
        return booking_payment_expires_at(booking=obj.booking).isoformat()

    def get_can_retry_payment(self, obj):
        snapshot = booking_lifecycle_snapshot(booking=obj.booking)
        return obj.payment_status != 'success' and snapshot['can_pay']

    def get_next_actions(self, obj):
        actions = []
        if self.get_can_retry_payment(obj):
            actions.append('retry_payment')
        if obj.payment_status == 'success':
            actions.append('view_confirmation')
        snapshot = booking_lifecycle_snapshot(booking=obj.booking)
        if snapshot['lifecycle_state'] == 'expired':
            actions.append('create_new_booking')
        return actions

    def get_booking_lifecycle_state(self, obj):
        return booking_lifecycle_snapshot(booking=obj.booking)['lifecycle_state']

    def get_booking_display_status(self, obj):
        return booking_lifecycle_snapshot(booking=obj.booking)['display_status']

    def get_failure_reason(self, obj):
        snapshot = booking_lifecycle_snapshot(booking=obj.booking)
        if obj.payment_status == 'failed' and snapshot['lifecycle_state'] == 'expired':
            return 'booking_expired'
        if obj.payment_status == 'failed':
            return 'payment_failed'
        if snapshot['lifecycle_state'] == 'expired':
            return 'booking_expired'
        return None


class BookingPaymentCreateSerializer(serializers.Serializer):
    """Serializer for creating a booking payment."""
    booking_id = serializers.IntegerField()
    gateway_name = serializers.CharField(default='mock_gateway')
    
    def validate_booking_id(self, value):
        try:
            booking = Booking.objects.get(booking_id=value)
        except Booking.DoesNotExist:
            raise serializers.ValidationError('Booking not found.')
        
        if booking.status != 'pending':
            raise serializers.ValidationError('Booking is not in pending status.')
        
        # Check if payment already exists
        if hasattr(booking, 'payments') and booking.payments.exists():
            raise serializers.ValidationError('Payment already exists for this booking.')
        
        return value


class TournamentPaymentSerializer(serializers.ModelSerializer):
    """Serializer for TournamentPayment model."""
    tournament_name = serializers.CharField(source='tournament.name', read_only=True)
    team_name = serializers.CharField(source='team.team_name', read_only=True)
    payer_name = serializers.CharField(source='payer.full_name', read_only=True)
    
    class Meta:
        model = TournamentPayment
        fields = [
            'tournament_payment_id',
            'tournament',
            'tournament_name',
            'team',
            'team_name',
            'payer',
            'payer_name',
            'gym',
            'amount', 'currency', 'payment_gateway', 'transaction_id', 
            'purpose',
            'metadata',
            'payment_status', 'paid_at', 'created_at'
        ]
        read_only_fields = [
            'tournament_payment_id', 'transaction_id', 'payment_status', 
            'paid_at', 'created_at'
        ]


class MockPaymentSerializer(serializers.Serializer):
    """Serializer for mock payment processing."""
    booking_id = serializers.IntegerField(required=False)
    tournament_id = serializers.IntegerField(required=False)
    team_id = serializers.IntegerField(required=False)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    gateway_name = serializers.CharField(default='mock_gateway')
    
    def validate(self, data):
        if not data.get('booking_id') and not data.get('tournament_id'):
            raise serializers.ValidationError(
                'Either booking_id or tournament_id must be provided.'
            )
        return data


class CreateBookingPaymentIntentSerializer(serializers.Serializer):
    booking_id = serializers.IntegerField()


class ConfirmBookingPaymentSerializer(serializers.Serializer):
    payment_intent_id = serializers.CharField(max_length=255)


class CreateTournamentPaymentIntentSerializer(serializers.Serializer):
    tournament_id = serializers.IntegerField()
    team_id = serializers.IntegerField(required=False, allow_null=True)
    # Required when team_id is omitted: payment-first registration (no Team row until payment succeeds).
    team_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    captain_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    captain_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    members = TeamMemberInputSerializer(many=True, required=False)

    def validate(self, attrs):
        team_id = attrs.get('team_id')
        if team_id is not None:
            return attrs
        for field in ('team_name', 'captain_name', 'captain_phone'):
            val = (attrs.get(field) or '').strip()
            if not val:
                raise serializers.ValidationError(
                    {field: 'This field is required when registering a new team (no team_id).'}
                )
            attrs[field] = val
        if 'members' not in attrs:
            raise serializers.ValidationError(
                {'members': f'Exactly {REQUIRED_TEAM_MEMBER_COUNT} team members are required.'}
            )
        try:
            attrs['members'] = normalize_team_members(attrs['members'])
        except ValueError as exc:
            raise serializers.ValidationError({'members': str(exc)})
        return attrs


class ConfirmTournamentPaymentSerializer(serializers.Serializer):
    payment_intent_id = serializers.CharField(max_length=255)
