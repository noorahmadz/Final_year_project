from django.db import models
from django.db.models import Q
from django.utils import timezone
from apps.bookings.models import Booking
from apps.users.models import User
from apps.gyms.models import Gym


class BookingPayment(models.Model):
    """BookingPayment model for managing payment transactions for bookings."""

    class ConfirmationEmailStatus(models.TextChoices):
        NOT_ATTEMPTED = 'not_attempted', 'Not attempted'
        SENT = 'sent', 'Sent'
        FAILED = 'failed', 'Failed'

    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    booking_payment_id = models.BigAutoField(primary_key=True)
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default='AFN')
    gateway_name = models.CharField(max_length=255)
    transaction_id = models.CharField(max_length=255, unique=True)
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default='pending'
    )
    confirmation_email_delivery_status = models.CharField(
        max_length=20,
        choices=ConfirmationEmailStatus.choices,
        default=ConfirmationEmailStatus.NOT_ATTEMPTED,
    )
    confirmation_email_last_error = models.TextField(blank=True, default='')
    confirmation_email_queued_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'booking_payments'
        verbose_name = 'Booking Payment'
        verbose_name_plural = 'Booking Payments'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['booking'],
                condition=Q(payment_status='pending'),
                name='bookingpayment_single_pending_per_booking',
            ),
            models.UniqueConstraint(
                fields=['booking'],
                condition=Q(payment_status='success'),
                name='bookingpayment_single_success_per_booking',
            ),
        ]

    def __str__(self):
        return f"Payment {self.transaction_id} - {self.booking} - {self.amount} {self.currency}"

    def mark_success(self, *, gateway: str = 'stripe', now=None) -> bool:
        if now is None:
            now = timezone.now()

        fields_to_update = []
        if self.payment_status != 'success':
            self.payment_status = 'success'
            fields_to_update.append('payment_status')
        if self.paid_at is None:
            self.paid_at = now
            fields_to_update.append('paid_at')
        if gateway and self.gateway_name != gateway:
            self.gateway_name = gateway
            fields_to_update.append('gateway_name')

        if fields_to_update:
            self.save(update_fields=fields_to_update)
            return True
        return False

    def mark_failed(self, *, gateway: str = 'stripe') -> bool:
        if self.payment_status == 'success':
            return False

        fields_to_update = []
        if self.payment_status != 'failed':
            self.payment_status = 'failed'
            fields_to_update.append('payment_status')
        if self.paid_at is not None:
            self.paid_at = None
            fields_to_update.append('paid_at')
        if gateway and self.gateway_name != gateway:
            self.gateway_name = gateway
            fields_to_update.append('gateway_name')

        if fields_to_update:
            self.save(update_fields=fields_to_update)
            return True
        return False


class TournamentPayment(models.Model):
    """TournamentPayment model for managing tournament registration payments."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    class Purpose(models.TextChoices):
        REGISTRATION = "registration", "Tournament registration"

    tournament_payment_id = models.BigAutoField(primary_key=True)
    tournament = models.ForeignKey(
        "tournaments.Tournament",
        on_delete=models.CASCADE,
        related_name="payments",
    )
    team = models.ForeignKey(
        "tournaments.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    payer = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="tournament_payments",
    )
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name="tournament_payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="AFN")
    payment_gateway = models.CharField(max_length=50)
    transaction_id = models.CharField(max_length=100, unique=True)
    purpose = models.CharField(
        max_length=30,
        choices=Purpose.choices,
        default=Purpose.REGISTRATION,
    )
    metadata = models.JSONField(default=dict, blank=True)
    payment_status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    paid_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tournament_payments"
        verbose_name = "Tournament Payment"
        verbose_name_plural = "Tournament Payments"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tournament", "team", "payer"],
                condition=Q(payment_status="pending"),
                name="tournamentpayment_single_pending_per_registration",
            ),
            models.UniqueConstraint(
                fields=["tournament", "team", "payer"],
                condition=Q(payment_status="success"),
                name="tournamentpayment_single_success_per_registration",
            ),
            models.UniqueConstraint(
                fields=["tournament", "payer"],
                condition=Q(payment_status="pending") & Q(team__isnull=True),
                name="tournamentpayment_single_pending_per_tournament_when_no_team",
            ),
            models.UniqueConstraint(
                fields=["tournament", "payer"],
                condition=Q(payment_status="success") & Q(team__isnull=True),
                name="tournamentpayment_single_success_per_tournament_when_no_team",
            ),
        ]

    def __str__(self):
        return f"Tournament Payment {self.transaction_id} - {self.tournament_id} - {self.amount} {self.currency}"

    def mark_success(self, *, gateway: str = "stripe", now=None) -> bool:
        """
        Idempotent state transition to success.
        Returns True if any fields changed.
        """
        from django.utils import timezone

        if now is None:
            now = timezone.now()

        fields_to_update = []
        if self.payment_status != "success":
            self.payment_status = "success"
            fields_to_update.append("payment_status")
        if self.paid_at is None:
            self.paid_at = now
            fields_to_update.append("paid_at")
        if gateway and self.payment_gateway != gateway:
            self.payment_gateway = gateway
            fields_to_update.append("payment_gateway")

        if fields_to_update:
            self.save(update_fields=fields_to_update)
            return True
        return False

    def mark_failed(self, *, gateway: str = "stripe") -> bool:
        """
        Idempotent state transition to failed.
        Returns True if any fields changed.
        """
        fields_to_update = []
        if self.payment_status != "failed":
            self.payment_status = "failed"
            fields_to_update.append("payment_status")
        if self.paid_at is not None:
            self.paid_at = None
            fields_to_update.append("paid_at")
        if gateway and self.payment_gateway != gateway:
            self.payment_gateway = gateway
            fields_to_update.append("payment_gateway")

        if fields_to_update:
            self.save(update_fields=fields_to_update)
            return True
        return False


class StripeWebhookEvent(models.Model):
    """Persistent deduplication and audit record for Stripe webhook events."""

    id = models.BigAutoField(primary_key=True)
    stripe_event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=100)
    payment_intent_id = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    processed_at = models.DateTimeField(blank=True, null=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'stripe_webhook_events'
        verbose_name = 'Stripe Webhook Event'
        verbose_name_plural = 'Stripe Webhook Events'
        ordering = ['-received_at']

    def __str__(self):
        return f"{self.stripe_event_id} ({self.event_type})"


class TournamentStripeWebhookAudit(models.Model):
    """
    Tournament-specific observability record for Stripe webhook events.

    This does NOT replace StripeWebhookEvent deduplication; it attaches tournament context to
    already-deduped events to improve debugging and future maintenance.
    """

    id = models.BigAutoField(primary_key=True)
    stripe_event = models.OneToOneField(
        StripeWebhookEvent,
        on_delete=models.CASCADE,
        related_name="tournament_audit",
    )
    payment_intent_id = models.CharField(max_length=255, db_index=True)
    tournament = models.ForeignKey(
        "tournaments.Tournament",
        on_delete=models.CASCADE,
        related_name="stripe_webhook_audits",
    )
    tournament_payment = models.ForeignKey(
        "payments.TournamentPayment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stripe_webhook_audits",
    )
    payer = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tournament_stripe_webhook_audits",
    )
    event_type = models.CharField(max_length=100)
    processed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tournament_stripe_webhook_audits"
        verbose_name = "Tournament Stripe Webhook Audit"
        verbose_name_plural = "Tournament Stripe Webhook Audits"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.payment_intent_id} ({self.event_type})"
