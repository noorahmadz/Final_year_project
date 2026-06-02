from django.db import models
from django.db.models import F, Q
from django.core.exceptions import ValidationError
from apps.gyms.models import Gym
from apps.payments.models import BookingPayment, TournamentPayment
from apps.tournaments.models import Tournament


class GymRevenue(models.Model):
    """GymRevenue model for managing gym revenue from bookings and tournaments."""

    REVENUE_TYPE_CHOICES = [
        ('booking', 'Booking'),
        ('tournament', 'Tournament'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    revenue_id = models.BigAutoField(primary_key=True)
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='revenues'
    )
    revenue_type = models.CharField(max_length=20, choices=REVENUE_TYPE_CHOICES)
    booking_payment = models.ForeignKey(
        BookingPayment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revenues'
    )
    tournament_payment = models.ForeignKey(
        TournamentPayment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revenues'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gym_revenues'
        verbose_name = 'Gym Revenue'
        verbose_name_plural = 'Gym Revenues'
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(revenue_type='booking', booking_payment__isnull=False, tournament_payment__isnull=True) |
                    Q(revenue_type='tournament', tournament_payment__isnull=False, booking_payment__isnull=True)
                ),
                name='gymrevenue_revenue_type_payment_constraint'
            ),
            models.UniqueConstraint(
                fields=['booking_payment'],
                condition=Q(booking_payment__isnull=False),
                name='gymrevenue_unique_booking_payment',
            ),
            models.UniqueConstraint(
                fields=['tournament_payment'],
                condition=Q(tournament_payment__isnull=False),
                name='gymrevenue_unique_tournament_payment',
            ),
            models.CheckConstraint(
                check=Q(amount__gte=0),
                name='gymrevenue_amount_non_negative',
            ),
            models.CheckConstraint(
                check=Q(commission_amount__gte=0),
                name='gymrevenue_commission_non_negative',
            ),
            models.CheckConstraint(
                check=Q(net_amount__gte=0),
                name='gymrevenue_net_non_negative',
            ),
            models.CheckConstraint(
                check=Q(net_amount=F('amount') - F('commission_amount')),
                name='gymrevenue_net_amount_formula',
            ),
            models.CheckConstraint(
                check=Q(status='completed'),
                name='gymrevenue_status_completed_only',
            ),
        ]

    def __str__(self):
        return f"Revenue {self.revenue_id} - {self.gym.name} - {self.amount} ({self.revenue_type})"

    def clean(self):
        if self.revenue_type == 'booking' and self.booking_payment:
            source_gym_id = self.booking_payment.booking.field.gym_id
            if self.gym_id != source_gym_id:
                raise ValidationError({'gym': 'Gym must match the booking payment source gym.'})

        if self.revenue_type == 'tournament' and self.tournament_payment:
            source_gym_id = self.tournament_payment.gym_id
            if self.gym_id != source_gym_id:
                raise ValidationError({'gym': 'Gym must match the tournament source gym.'})

        if self.amount is not None and self.commission_amount is not None and self.net_amount is not None:
            if self.net_amount != self.amount - self.commission_amount:
                raise ValidationError({'net_amount': 'net_amount must equal amount - commission_amount.'})

    @classmethod
    def sync_from_booking_payment(cls, booking_payment, commission_amount=0):
        """
        Create or update a booking revenue record from a successful booking payment.
        """
        if booking_payment.payment_status != 'success':
            raise ValidationError('Revenue can only be synced from successful booking payments.')

        amount = booking_payment.amount
        commission_amount = amount.__class__(commission_amount)
        if commission_amount < 0:
            raise ValidationError('commission_amount cannot be negative.')
        if commission_amount > amount:
            raise ValidationError('commission_amount cannot exceed amount.')
        net_amount = amount - commission_amount

        revenue, _ = cls.objects.update_or_create(
            booking_payment=booking_payment,
            defaults={
                'gym': booking_payment.booking.field.gym,
                'revenue_type': 'booking',
                'tournament_payment': None,
                'amount': amount,
                'commission_amount': commission_amount,
                'net_amount': net_amount,
                'status': 'completed',
            },
        )
        return revenue

    @classmethod
    def sync_from_tournament_payment(cls, tournament_payment, commission_amount=0):
        """
        Create or update a tournament revenue record from a successful tournament payment.
        """
        if tournament_payment.payment_status != 'success':
            raise ValidationError('Revenue can only be synced from successful tournament payments.')

        amount = tournament_payment.amount
        commission_amount = amount.__class__(commission_amount)
        if commission_amount < 0:
            raise ValidationError('commission_amount cannot be negative.')
        if commission_amount > amount:
            raise ValidationError('commission_amount cannot exceed amount.')
        net_amount = amount - commission_amount

        revenue, _ = cls.objects.update_or_create(
            tournament_payment=tournament_payment,
            defaults={
                'gym': tournament_payment.gym,
                'revenue_type': 'tournament',
                'booking_payment': None,
                'amount': amount,
                'commission_amount': commission_amount,
                'net_amount': net_amount,
                'status': 'completed',
            },
        )
        return revenue

    @classmethod
    def sync_from_tournament(cls, tournament, commission_amount=0):
        """
        Compatibility helper: sync all successful payment-backed revenue rows for a finished tournament.
        """
        if tournament.status != 'finished':
            raise ValidationError('Revenue can only be synced from finished tournaments.')

        successful_payments = list(
            TournamentPayment.objects.filter(
                tournament=tournament,
                payment_status='success',
            ).order_by('tournament_payment_id')
        )
        if not successful_payments:
            raise ValidationError('No successful tournament payments found for this tournament.')

        total_amount = sum((payment.amount for payment in successful_payments), start=successful_payments[0].amount.__class__('0.00'))
        commission_amount = total_amount.__class__(commission_amount)
        if commission_amount < 0:
            raise ValidationError('commission_amount cannot be negative.')
        if commission_amount > total_amount:
            raise ValidationError('commission_amount cannot exceed total successful tournament amount.')

        revenues = []
        remaining_commission = commission_amount
        remaining_amount = total_amount
        for index, payment in enumerate(successful_payments, start=1):
            if index == len(successful_payments):
                payment_commission = remaining_commission
            elif total_amount == 0:
                payment_commission = total_amount.__class__('0.00')
            else:
                proportional = (commission_amount * payment.amount / total_amount)
                payment_commission = proportional.quantize(total_amount.__class__('0.01'))
            remaining_commission -= payment_commission
            remaining_amount -= payment.amount
            revenues.append(
                cls.sync_from_tournament_payment(
                    tournament_payment=payment,
                    commission_amount=payment_commission,
                )
            )
        return revenues
