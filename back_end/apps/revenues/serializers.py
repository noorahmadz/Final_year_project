from rest_framework import serializers
from decimal import Decimal
from .models import GymRevenue


class GymRevenueSerializer(serializers.ModelSerializer):
    """Serializer for GymRevenue model."""
    gym_name = serializers.CharField(source='gym.name', read_only=True)
    booking_details = serializers.SerializerMethodField()
    tournament_details = serializers.SerializerMethodField()
    
    class Meta:
        model = GymRevenue
        fields = [
            'revenue_id', 'gym', 'gym_name', 'revenue_type',
            'booking_payment', 'booking_details',
            'tournament_payment', 'tournament_details',
            'amount', 'commission_amount', 'net_amount',
            'status', 'created_at'
        ]
        read_only_fields = [
            'revenue_id', 'gym', 'revenue_type', 'booking_payment',
            'tournament_payment', 'amount', 'commission_amount', 'net_amount',
            'status', 'created_at'
        ]
    
    def get_booking_details(self, obj):
        if obj.booking_payment:
            return {
                'booking_id': obj.booking_payment.booking.booking_id,
                'transaction_id': obj.booking_payment.transaction_id,
                'field_name': obj.booking_payment.booking.field.field_name,
                'booking_date': obj.booking_payment.booking.booking_date
            }
        return None
    
    def get_tournament_details(self, obj):
        if obj.tournament_payment:
            return {
                'tournament_payment_id': obj.tournament_payment.tournament_payment_id,
                'transaction_id': obj.tournament_payment.transaction_id,
                'tournament_id': obj.tournament_payment.tournament.tournament_id,
                'tournament_name': obj.tournament_payment.tournament.name,
                'team_id': obj.tournament_payment.team_id,
                'payer_id': obj.tournament_payment.payer_id,
            }
        return None


class GymRevenueSummarySerializer(serializers.Serializer):
    """Serializer for revenue summary."""
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_commission = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_net = serializers.DecimalField(max_digits=12, decimal_places=2)
    booking_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    tournament_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_bookings = serializers.IntegerField()
    total_tournaments = serializers.IntegerField()


class OwnerFinanceSummarySerializer(serializers.Serializer):
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_commission = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_net = serializers.DecimalField(max_digits=12, decimal_places=2)
    booking_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    tournament_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_expenses = serializers.DecimalField(max_digits=12, decimal_places=2)
    final_profit = serializers.DecimalField(max_digits=12, decimal_places=2)
    rent_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    electricity_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    staff_salary_total = serializers.DecimalField(max_digits=12, decimal_places=2)


class BookingRevenueSyncSerializer(serializers.Serializer):
    """Input serializer for syncing booking revenue."""
    booking_payment_id = serializers.IntegerField(min_value=1)
    commission_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.00'),
        required=False,
        default=Decimal('0.00'),
    )


class TournamentRevenueSyncSerializer(serializers.Serializer):
    """Input serializer for syncing tournament revenue."""
    tournament_id = serializers.IntegerField(min_value=1)
    commission_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.00'),
        required=False,
        default=Decimal('0.00'),
    )
