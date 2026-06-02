import uuid
import logging
from decimal import Decimal
from time import monotonic

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.conf import settings
from django.db import transaction, IntegrityError, DatabaseError
from django.utils import timezone
from django.contrib.auth import get_user_model

from apps.common.api import StandardizedModelViewSetMixin, error_response, success_response
from .models import (
    BookingPayment,
    TournamentPayment,
    StripeWebhookEvent,
    TournamentStripeWebhookAudit,
)
from .email_utils import send_booking_confirmation_email
from .serializers import (
    BookingPaymentSerializer,
    TournamentPaymentSerializer,
    CreateBookingPaymentIntentSerializer,
    ConfirmBookingPaymentSerializer,
    CreateTournamentPaymentIntentSerializer,
    ConfirmTournamentPaymentSerializer,
)
from apps.bookings.models import (
    Booking,
    BookingAuditLog,
    booking_has_payment_expired,
    confirm_booking_after_successful_payment,
    expire_booking_if_unpaid,
)
from apps.bookings.lifecycle import booking_lifecycle_snapshot, synchronize_booking_lifecycle
from apps.tournaments.roster import create_team_members, normalize_team_members

logger = logging.getLogger(__name__)

INVALID_SIGNATURE_LOG_WINDOW_SECONDS = 60
INVALID_SIGNATURE_LOG_WARNING_EVERY = 20

_invalid_signature_log_state = {
    'window_start': 0.0,
    'count': 0,
}

REUSABLE_PAYMENT_INTENT_STATUSES = {
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
}

PAYMENT_INTENT_FINAL_AMOUNT_FIELDS = ('amount_received', 'amount')
PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE = (
    'Stripe is temporarily unreachable. Check the server internet or DNS connection and try again.'
)
DEFAULT_STRIPE_MINIMUM_CHARGE_AMOUNTS = {
    'afn': Decimal('50.00'),
    'usd': Decimal('0.50'),
}


def get_stripe_module():
    try:
        import stripe as stripe_module
    except ImportError:
        return None, 'Stripe SDK is not installed on the server.'

    stripe_secret_key = (getattr(settings, 'STRIPE_SECRET_KEY', '') or '').strip()
    if not stripe_secret_key:
        return None, 'Stripe secret key is not configured.'

    stripe_module.api_key = stripe_secret_key
    return stripe_module, None


def get_stripe_webhook_secret():
    webhook_secret = (getattr(settings, 'STRIPE_WEBHOOK_SECRET', '') or '').strip()
    if not webhook_secret:
        return None, 'Stripe webhook secret is not configured.'
    if not webhook_secret.startswith('whsec_'):
        return None, (
            'Invalid Stripe webhook secret format. Expected value starting with "whsec_".'
        )
    return webhook_secret, None


def _intent_value(intent, key, default=None):
    if isinstance(intent, dict):
        return intent.get(key, default)
    return getattr(intent, key, default)


def _expected_intent_details(*, booking):
    expected_currency = str(getattr(settings, 'STRIPE_CURRENCY', 'AFG') or 'AFG').lower()
    expected_amount = int((booking.total_price * Decimal('100')).quantize(Decimal('1')))
    return expected_amount, expected_currency


def _stripe_minimum_charge_amount(currency):
    currency_key = str(currency or '').lower()
    configured_amounts = getattr(settings, 'STRIPE_MINIMUM_CHARGE_AMOUNTS', None) or {}
    configured_amount = configured_amounts.get(currency_key)
    if configured_amount is not None:
        try:
            return Decimal(str(configured_amount))
        except Exception:
            logger.warning(
                'Invalid STRIPE_MINIMUM_CHARGE_AMOUNTS value for currency=%s: %s',
                currency_key,
                configured_amount,
            )
    return DEFAULT_STRIPE_MINIMUM_CHARGE_AMOUNTS.get(currency_key)


def _stripe_minimum_charge_error(*, amount, currency, payment_label):
    minimum_amount = _stripe_minimum_charge_amount(currency)
    if minimum_amount is None or amount >= minimum_amount:
        return None
    currency_label = str(currency or '').upper()
    return error_response(
        message=(
            f'{payment_label} must be at least {minimum_amount:.2f} {currency_label} '
            'to be paid online with Stripe.'
        ),
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code='amount_below_stripe_minimum',
    )


def _intent_amount_and_currency(intent):
    amount = None
    for field in PAYMENT_INTENT_FINAL_AMOUNT_FIELDS:
        candidate = _intent_value(intent, field)
        if candidate is not None:
            try:
                amount = int(candidate)
                break
            except (TypeError, ValueError):
                amount = None

    currency = str(_intent_value(intent, 'currency', '') or '').lower()
    return amount, currency


def _validate_intent_amount_currency(*, intent, booking):
    """
    Invariant ownership:
    - Domain/helper: compute expected amount/currency from internal booking state
    - Service/orchestration: both confirm + webhook validate (defense-in-depth)
    """
    expected_amount, expected_currency = _expected_intent_details(booking=booking)
    intent_amount, intent_currency = _intent_amount_and_currency(intent)

    if intent_amount != expected_amount:
        return False, (
            f'Amount mismatch. Expected {expected_amount}, got {intent_amount}.'
        )
    if intent_currency != expected_currency:
        return False, (
            f'Currency mismatch. Expected {expected_currency}, got {intent_currency}.'
        )
    return True, None


def _expected_tournament_intent_details(*, tournament):
    expected_currency = str(getattr(settings, 'STRIPE_CURRENCY', 'AFG') or 'AFG').lower()
    expected_amount = int((tournament.registration_fee * Decimal('100')).quantize(Decimal('1')))
    return expected_amount, expected_currency


def _validate_tournament_intent_amount_currency(*, intent, tournament):
    """
    Invariant ownership:
    - Domain/helper: compute expected amount/currency from internal tournament state
    - Service/orchestration: both confirm + webhook validate (defense-in-depth)
    """
    expected_amount, expected_currency = _expected_tournament_intent_details(tournament=tournament)
    intent_amount, intent_currency = _intent_amount_and_currency(intent)

    if intent_amount != expected_amount:
        return False, (
            f'Amount mismatch. Expected {expected_amount}, got {intent_amount}.'
        )
    if intent_currency != expected_currency:
        return False, (
            f'Currency mismatch. Expected {expected_currency}, got {intent_currency}.'
        )
    return True, None


def _extract_booking_id_from_intent(intent):
    metadata = _intent_value(intent, 'metadata', {}) or {}
    booking_id_raw = metadata.get('booking_id')
    if not booking_id_raw:
        return None
    try:
        return int(booking_id_raw)
    except (TypeError, ValueError):
        return None


def _extract_tournament_id_from_intent(intent):
    metadata = _intent_value(intent, 'metadata', {}) or {}
    tournament_id_raw = metadata.get('tournament_id')
    if not tournament_id_raw:
        return None
    try:
        return int(tournament_id_raw)
    except (TypeError, ValueError):
        return None


def _extract_team_id_from_intent(intent):
    metadata = _intent_value(intent, 'metadata', {}) or {}
    team_id_raw = metadata.get('team_id')
    if not team_id_raw:
        return None
    try:
        return int(team_id_raw)
    except (TypeError, ValueError):
        return None


def _extract_user_id_from_intent(intent):
    metadata = _intent_value(intent, 'metadata', {}) or {}
    user_id_raw = metadata.get('user_id')
    if not user_id_raw:
        return None
    try:
        return int(user_id_raw)
    except (TypeError, ValueError):
        return None


def _resolve_booking_for_intent(intent, payment):
    booking_id = _extract_booking_id_from_intent(intent)
    if booking_id is not None:
        return Booking.objects.filter(booking_id=booking_id).first()
    if payment is not None:
        return payment.booking
    return None


def _resolve_tournament_for_intent(intent, tournament_payment):
    tournament_id = _extract_tournament_id_from_intent(intent)
    if tournament_id is not None:
        from apps.tournaments.models import Tournament

        return Tournament.objects.filter(tournament_id=tournament_id).first()
    if tournament_payment is not None:
        return tournament_payment.tournament
    return None


def _resolve_team_for_intent(intent, tournament):
    team_id = _extract_team_id_from_intent(intent)
    if team_id is None or tournament is None:
        return None
    from apps.tournaments.models import Team

    return Team.objects.filter(team_id=team_id, tournament=tournament).first()


def _resolve_payer_for_intent(*, intent, tournament_payment):
    """
    Resolve tournament payer deterministically.

    Order of truth:
    1) existing TournamentPayment row (if present)
    2) validated Stripe PaymentIntent metadata.user_id (must map to a real user)
    """
    if tournament_payment is not None:
        return tournament_payment.payer

    user_id = _extract_user_id_from_intent(intent)
    if user_id is None:
        return None

    user_model = get_user_model()
    return user_model.objects.filter(pk=user_id).first()


def _upsert_tournament_revenue(*, tournament_payment):
    from apps.revenues.models import GymRevenue

    amount = tournament_payment.amount
    commission_rate = Decimal('0.10')
    commission_amount = (amount * commission_rate).quantize(Decimal('0.01'))
    net_amount = (amount - commission_amount).quantize(Decimal('0.01'))
    GymRevenue.objects.update_or_create(
        tournament_payment=tournament_payment,
        defaults={
            'gym': tournament_payment.gym,
            'revenue_type': 'tournament',
            'booking_payment': None,
            'amount': amount.quantize(Decimal('0.01')),
            'commission_amount': commission_amount,
            'net_amount': net_amount,
            'status': 'completed',
        }
    )


def _confirm_team_if_present(team):
    if team is None:
        return
    from apps.tournaments.models import Team

    Team.objects.filter(team_id=team.team_id).update(status='pending_owner_approval')


def _booking_notification_payload(booking):
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


def _registration_meta_from_payment_and_intent(*, payment, intent=None):
    meta = dict(payment.metadata or {})
    if intent is not None:
        imeta = _intent_value(intent, 'metadata', {}) or {}
        for key in ('team_name', 'captain_name', 'captain_phone'):
            raw = imeta.get(key)
            if raw is not None and str(raw).strip() and not (meta.get(key) or '').strip():
                meta[key] = str(raw).strip()
    return meta


def _finalize_tournament_team_registration(*, payment, tournament, intent=None):
    """
    After Stripe reports success and amount/currency checks pass, attach a Team to this payment.

    - Existing-team path: payment.team already set when PaymentIntent was created.
    - New registration: create Team only here (payment-first); status remains pending owner approval
      until the tournament owner explicitly approves it.
    """
    from apps.tournaments.models import Team

    if tournament.status != 'upcoming':
        raise ValueError('Tournament registration is closed.')

    if payment.team_id:
        team = Team.objects.select_for_update().get(pk=payment.team_id)
        if team.tournament_id != tournament.tournament_id:
            raise ValueError('Payment team does not belong to this tournament.')
        return team

    meta = _registration_meta_from_payment_and_intent(payment=payment, intent=intent)
    team_name = (meta.get('team_name') or '').strip()
    captain_name = (meta.get('captain_name') or '').strip()
    captain_phone = (meta.get('captain_phone') or '').strip()
    members = meta.get('members')
    if not team_name or not captain_name or not captain_phone:
        raise ValueError('Missing team registration details on payment record.')
    try:
        members = normalize_team_members(members)
    except ValueError as exc:
        raise ValueError(str(exc))

    tournament = tournament.__class__.objects.select_for_update().get(pk=tournament.pk)
    if tournament.teams.count() >= tournament.max_teams:
        raise ValueError('Tournament is full.')

    if Team.objects.filter(tournament=tournament, team_name__iexact=team_name).exists():
        raise ValueError('A team with this name is already registered for this tournament.')
    if Team.objects.filter(tournament=tournament, captain_phone=captain_phone).exists():
        raise ValueError('A team with this captain phone is already registered for this tournament.')

    try:
        team = Team.objects.create(
            tournament=tournament,
            team_name=team_name,
            captain_name=captain_name,
            captain_phone=captain_phone,
            status='pending_owner_approval',
        )
        create_team_members(team=team, members=members)
    except IntegrityError:
        raise ValueError('Duplicate team registration or roster member.')

    payment.team = team
    merged = {**meta, 'members': members, 'team_id': team.team_id, 'registration_finalized': True}
    payment.metadata = merged
    payment.save(update_fields=['team', 'metadata'])
    return team


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_tournament_payment_intent(request):
    """
    Create a Stripe PaymentIntent for tournament registration.
    This is the real payment flow; remains compatible with Stripe test-mode keys.
    """
    serializer = CreateTournamentPaymentIntentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tournament_id = serializer.validated_data['tournament_id']
    team_id = serializer.validated_data.get('team_id')

    stripe_module, stripe_error = get_stripe_module()
    if stripe_error:
        return error_response(
            message=stripe_error,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code='payment_provider_unavailable',
        )
    stripe_errors = _stripe_error_classes(stripe_module)

    from apps.tournaments.models import Tournament, Team

    try:
        tournament = Tournament.objects.select_related('gym').get(tournament_id=tournament_id)
    except Tournament.DoesNotExist:
        return error_response(message='Tournament not found.', status_code=status.HTTP_404_NOT_FOUND, error_code='tournament_not_found')

    if tournament.status != 'upcoming':
        return error_response(
            message='Tournament payment is only available while tournament registration is open.',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_tournament_state',
        )

    team = None
    registration_meta = {}
    if team_id is not None:
        team = Team.objects.filter(team_id=team_id, tournament=tournament).first()
        if team is None:
            return error_response(message='Team not found.', status_code=status.HTTP_404_NOT_FOUND, error_code='team_not_found')
    else:
        registration_meta = {
            'team_name': serializer.validated_data['team_name'].strip(),
            'captain_name': serializer.validated_data['captain_name'].strip(),
            'captain_phone': serializer.validated_data['captain_phone'].strip(),
            'members': serializer.validated_data['members'],
        }

    if tournament.registration_fee <= 0:
        return error_response(
            message='Tournament registration fee must be greater than zero.',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_tournament_configuration',
        )

    with transaction.atomic():
        locked_tournament = Tournament.objects.select_for_update().get(tournament_id=tournament.tournament_id)

        if team is None:
            if locked_tournament.teams.count() >= locked_tournament.max_teams:
                return error_response(message='Tournament is full.', status_code=status.HTTP_400_BAD_REQUEST, error_code='tournament_full')
            if Team.objects.filter(
                tournament=locked_tournament,
                team_name__iexact=registration_meta['team_name'],
            ).exists():
                return error_response(message='A team with this name is already registered for this tournament.', status_code=status.HTTP_400_BAD_REQUEST, error_code='duplicate_team_name')
            if Team.objects.filter(
                tournament=locked_tournament,
                captain_phone=registration_meta['captain_phone'],
            ).exists():
                return error_response(message='A team with this captain phone is already registered for this tournament.', status_code=status.HTTP_400_BAD_REQUEST, error_code='duplicate_captain_phone')

        if team is not None:
            if team.status in {'approved', 'confirmed'}:
                return error_response(message='This team registration is already paid and confirmed.', status_code=status.HTTP_400_BAD_REQUEST, error_code='registration_already_confirmed')
            if team.status == 'pending_owner_approval':
                return error_response(message='This team registration has already been paid and is pending owner approval.', status_code=status.HTTP_400_BAD_REQUEST, error_code='registration_pending_owner_approval')
            if team.status == 'rejected':
                return error_response(message='This team registration has already been rejected by the owner.', status_code=status.HTTP_400_BAD_REQUEST, error_code='registration_rejected')

            existing_team_success = TournamentPayment.objects.select_for_update().filter(
                tournament=locked_tournament,
                team=team,
                payment_status='success',
            ).first()
            if existing_team_success:
                return error_response(message='Payment already completed for this team registration.', status_code=status.HTTP_400_BAD_REQUEST, error_code='payment_already_completed')

            existing_team_pending = TournamentPayment.objects.select_for_update().filter(
                tournament=locked_tournament,
                team=team,
                payment_status='pending',
            ).first()
            if existing_team_pending and existing_team_pending.payer_id != request.user.pk:
                return error_response(message='A payment is already in progress for this team registration.', status_code=status.HTTP_409_CONFLICT, error_code='payment_in_progress')

        existing_success = TournamentPayment.objects.select_for_update().filter(
            tournament=locked_tournament,
            team=team,
            payer=request.user,
            payment_status='success',
        ).first()
        if existing_success:
            return error_response(message='Payment already completed for this tournament registration.', status_code=status.HTTP_400_BAD_REQUEST, error_code='payment_already_completed')

        existing_pending = TournamentPayment.objects.select_for_update().filter(
            tournament=locked_tournament,
            team=team,
            payer=request.user,
            payment_status='pending',
        ).first()
        currency = str(getattr(settings, 'STRIPE_CURRENCY', 'AFG') or 'AFG').lower()
        registration_context_id = uuid.uuid4().hex

        if existing_pending:
            try:
                intent = stripe_module.PaymentIntent.retrieve(existing_pending.transaction_id)
                intent_status = _intent_value(intent, 'status')
                if intent_status in REUSABLE_PAYMENT_INTENT_STATUSES:
                    if registration_meta:
                        existing_metadata = dict(existing_pending.metadata or {})
                        existing_metadata.update(registration_meta)
                        existing_pending.metadata = existing_metadata
                        existing_pending.save(update_fields=['metadata'])
                    return success_response(
                        data={
                            'client_secret': _intent_value(intent, 'client_secret'),
                            'payment_intent_id': _intent_value(intent, 'id'),
                        }
                    )
            except stripe_errors as exc:
                logger.warning(
                    'Stripe pending tournament intent retrieve failed for payment_intent_id=%s: %s',
                    existing_pending.transaction_id,
                    str(exc),
                )
            existing_pending.payment_status = 'failed'
            existing_pending.save(update_fields=['payment_status'])

        amount_in_cents = int((locked_tournament.registration_fee * Decimal('100')).quantize(Decimal('1')))
        stripe_metadata = {
            'tournament_id': str(locked_tournament.tournament_id),
            'team_id': str(team.team_id) if team else '',
            'user_id': str(request.user.pk),
            'registration_context_id': registration_context_id,
        }
        if registration_meta:
            stripe_metadata['team_name'] = registration_meta['team_name'][:500]
            stripe_metadata['captain_name'] = registration_meta['captain_name'][:500]
            stripe_metadata['captain_phone'] = registration_meta['captain_phone'][:500]
            stripe_metadata['members_count'] = str(len(registration_meta['members']))
        try:
            payment_intent = stripe_module.PaymentIntent.create(
                amount=amount_in_cents,
                currency=currency,
                metadata=stripe_metadata,
            )
        except stripe_errors as exc:
            logger.warning(
                'Stripe create tournament PaymentIntent failed for tournament_id=%s: %s',
                locked_tournament.tournament_id,
                str(exc),
            )
            return _payment_provider_unavailable_response()
            

        payment_metadata = {
            'tournament_id': locked_tournament.tournament_id,
            'team_id': team.team_id if team else None,
            'payer_user_id': request.user.pk,
            'registration_context_id': registration_context_id,
        }
        if registration_meta:
            payment_metadata.update(registration_meta)

        payment = TournamentPayment.objects.create(
            tournament=locked_tournament,
            team=team,
            payer=request.user,
            gym=locked_tournament.gym,
            amount=locked_tournament.registration_fee,
            currency=currency.upper(),
            payment_gateway='stripe',
            transaction_id=payment_intent.id,
            purpose=TournamentPayment.Purpose.REGISTRATION,
            metadata=payment_metadata,
            payment_status='pending',
            paid_at=None,
        )

    return success_response(
        data={
            'client_secret': payment_intent.client_secret,
            'payment_intent_id': payment_intent.id,
            'registration_status': 'pending_payment',
            'payment': TournamentPaymentSerializer(payment).data,
        },
        status_code=status.HTTP_201_CREATED,
        message='Tournament payment intent created successfully.',
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_tournament_payment(request):
    """
    Confirm tournament payment by verifying the PaymentIntent succeeded and matches expected amount/currency.
    """
    serializer = ConfirmTournamentPaymentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    stripe_module, stripe_error = get_stripe_module()
    if stripe_error:
        return error_response(
            message=stripe_error,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code='payment_provider_unavailable',
        )
    stripe_errors = _stripe_error_classes(stripe_module)

    payment_intent_id = serializer.validated_data['payment_intent_id']
    payment = TournamentPayment.objects.select_related('tournament', 'team').filter(transaction_id=payment_intent_id).first()
    if payment is None:
        return error_response(message='Payment record not found for this payment intent.', status_code=status.HTTP_404_NOT_FOUND, error_code='payment_not_found')

    if payment.payer_id != request.user.pk and request.user.role != 'admin':
        return error_response(message='You do not have permission to confirm this payment.', status_code=status.HTTP_403_FORBIDDEN, error_code='permission_denied')

    if payment.payment_status == 'success':
        return success_response(
            message='Payment already confirmed.',
            data={
                'registration_status': 'pending_owner_approval' if payment.team_id else 'payment_received',
                'payment': TournamentPaymentSerializer(payment).data,
            },
        )

    try:
        payment_intent = stripe_module.PaymentIntent.retrieve(payment_intent_id)
    except stripe_errors as exc:
        logger.warning('Stripe retrieve tournament PaymentIntent failed for payment_intent_id=%s: %s', payment_intent_id, str(exc))
        return error_response(
            message='Unable to verify payment status at this time.',
            status_code=status.HTTP_502_BAD_GATEWAY,
            error_code='payment_provider_unavailable',
        )

    if _intent_value(payment_intent, 'status') != 'succeeded':
        return error_response(
            message=f'Payment not successful. Current status: {_intent_value(payment_intent, "status")}',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='payment_not_successful',
        )

    with transaction.atomic():
        locked_payment = TournamentPayment.objects.select_for_update().get(
            tournament_payment_id=payment.tournament_payment_id
        )
        locked_tournament = locked_payment.tournament.__class__.objects.select_for_update().get(
            tournament_id=locked_payment.tournament_id
        )

        is_valid, mismatch_reason = _validate_tournament_intent_amount_currency(
            intent=payment_intent,
            tournament=locked_tournament,
        )
        if not is_valid:
            locked_payment.mark_failed(gateway='stripe')
            return error_response(
                message=f'Payment validation failed: {mismatch_reason}',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='payment_validation_failed',
            )

        try:
            _finalize_tournament_team_registration(
                payment=locked_payment,
                tournament=locked_tournament,
                intent=payment_intent,
            )
        except ValueError as exc:
            logger.error(
                'Tournament team finalization failed after Stripe success payment_intent_id=%s: %s',
                payment_intent_id,
                str(exc),
            )
            locked_payment.mark_failed(gateway='stripe')
            return error_response(message=str(exc), status_code=status.HTTP_400_BAD_REQUEST, error_code='registration_finalization_failed')

        locked_payment = TournamentPayment.objects.select_for_update().get(
            tournament_payment_id=locked_payment.tournament_payment_id
        )
        locked_payment.mark_success(gateway='stripe')

        if locked_payment.team_id:
            _confirm_team_if_present(locked_payment.team)

        # Keep existing behavior: create tournament revenue entry at payment time.
        _upsert_tournament_revenue(tournament_payment=locked_payment)

        payment = locked_payment

    return success_response(
        message='Payment confirmed successfully. Team registration is pending owner approval.',
        data={
            'registration_status': 'pending_owner_approval',
            'payment': TournamentPaymentSerializer(payment).data,
        },
    )


def _get_or_create_booking_payment_with_retry(*, booking, payment_intent_id, currency, status_value):
    """
    Concurrency-safe BookingPayment upsert.
    We rely on unique(transaction_id) and retry-read after IntegrityError,
    which is the expected race when concurrent webhooks create the same row.
    """
    defaults = {
        'booking': booking,
        'amount': booking.total_price,
        'currency': currency.upper(),
        'gateway_name': 'stripe',
        'payment_status': status_value,
        'paid_at': timezone.now() if status_value == 'success' else None,
    }

    try:
        return BookingPayment.objects.get_or_create(
            transaction_id=payment_intent_id,
            defaults=defaults,
        )
    except IntegrityError:
        logger.warning(
            'BookingPayment create race resolved for payment_intent_id=%s',
            payment_intent_id,
        )
        payment = BookingPayment.objects.filter(transaction_id=payment_intent_id).first()
        if payment is None:
            raise
        return payment, False


def _get_or_create_webhook_event_with_retry(*, event_id, event_type, payment_intent_id):
    defaults = {
        'event_type': event_type or 'unknown',
        'payment_intent_id': payment_intent_id,
    }
    try:
        return StripeWebhookEvent.objects.get_or_create(
            stripe_event_id=event_id,
            defaults=defaults,
        )
    except IntegrityError:
        logger.warning(
            'StripeWebhookEvent create race resolved for event_id=%s',
            event_id,
        )
        webhook_event = StripeWebhookEvent.objects.filter(stripe_event_id=event_id).first()
        if webhook_event is None:
            raise
        return webhook_event, False


def _stripe_error_classes(stripe_module):
    error_module = getattr(stripe_module, 'error', None)
    if error_module is None:
        return ()
    classes = []
    for attr in ('StripeError', 'SignatureVerificationError'):
        candidate = getattr(error_module, attr, None)
        if isinstance(candidate, type) and issubclass(candidate, Exception):
            classes.append(candidate)
    return tuple(classes)


def _payment_provider_unavailable_response():
    return error_response(
        message=PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        error_code='payment_provider_unavailable',
    )


def _is_stripe_error(exc, stripe_module):
    classes = _stripe_error_classes(stripe_module)
    return bool(classes) and isinstance(exc, classes)


def _signature_error_class(stripe_module):
    error_module = getattr(stripe_module, 'error', None)
    candidate = getattr(error_module, 'SignatureVerificationError', None) if error_module else None
    if isinstance(candidate, type) and issubclass(candidate, Exception):
        return candidate
    return None


def _mark_webhook_event_processed(webhook_event):
    if webhook_event.processed_at is None:
        webhook_event.processed_at = timezone.now()
        webhook_event.save(update_fields=['processed_at'])


def _log_signature_rejection(reason):
    now = monotonic()
    window_start = _invalid_signature_log_state['window_start']
    if now - window_start >= INVALID_SIGNATURE_LOG_WINDOW_SECONDS:
        _invalid_signature_log_state['window_start'] = now
        _invalid_signature_log_state['count'] = 0

    _invalid_signature_log_state['count'] += 1
    count = _invalid_signature_log_state['count']
    if count == 1 or count % INVALID_SIGNATURE_LOG_WARNING_EVERY == 0:
        logger.warning(
            'Stripe webhook rejected (%s). rejected_count_last_%ss=%s',
            reason,
            INVALID_SIGNATURE_LOG_WINDOW_SECONDS,
            count,
        )
    else:
        logger.info('Stripe webhook rejected (%s).', reason)


class BookingPaymentViewSet(StandardizedModelViewSetMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for managing booking payments.
    """
    queryset = BookingPayment.objects.select_related('booking__field__gym', 'booking__user').all()
    serializer_class = BookingPaymentSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed('POST')

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed('PUT')

    def partial_update(self, request, *args, **kwargs):
        raise MethodNotAllowed('PATCH')

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed('DELETE')
    
    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return BookingPayment.objects.select_related('booking__field__gym', 'booking__user').all()
        elif user.role == 'owner':
            return BookingPayment.objects.select_related('booking__field__gym', 'booking__user').filter(booking__field__gym__owner=user)
        return BookingPayment.objects.select_related('booking__field__gym', 'booking__user').filter(booking__user=user)

    @staticmethod
    def _validate_booking_access(*, booking, user, require_pending=True):
        if booking.user != user and user.role != 'admin':
            return error_response(
                message='You do not have permission to pay for this booking.',
                status_code=status.HTTP_403_FORBIDDEN,
                error_code='permission_denied',
            )
        if require_pending and booking.status != 'pending':
            return error_response(
                message='Booking is not in pending status.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_booking_state',
            )
        return None

    @staticmethod
    def _create_revenue_for_successful_payment(*, payment, booking):
        from apps.revenues.models import GymRevenue

        # Payment row is locked by caller, so this get_or_create remains idempotent
        # even when Stripe sends duplicate events concurrently.
        gym = booking.field.gym
        commission_rate = Decimal('0.10')  # 10% commission
        commission_amount = booking.total_price * commission_rate
        net_amount = booking.total_price - commission_amount

        GymRevenue.objects.get_or_create(
            booking_payment=payment,
            defaults={
                'gym': gym,
                'revenue_type': 'booking',
                'amount': booking.total_price,
                'commission_amount': commission_amount,
                'net_amount': net_amount,
                'status': 'completed',
            },
        )

    @classmethod
    def _queue_booking_confirmation_email(cls, *, payment, booking):
        if (
            payment.confirmation_email_delivery_status
            == BookingPayment.ConfirmationEmailStatus.SENT
        ):
            return
        if not (getattr(booking.user, 'email', '') or '').strip():
            return

        booking_payment_id = payment.booking_payment_id
        transaction.on_commit(
            lambda: send_booking_confirmation_email(booking_payment_id=booking_payment_id)
        )

    @classmethod
    def _mark_payment_success(cls, *, payment, booking):
        if booking.status == 'pending' and booking_has_payment_expired(booking=booking):
            expire_booking_if_unpaid(
                booking=booking,
                now=timezone.now(),
                trigger='payment_success_after_expiry',
                has_successful_payment=False,
            )

        if booking.status not in ('pending', 'confirmed'):
            payment.mark_failed(gateway='stripe')
            BookingAuditLog.objects.create(
                booking=booking,
                action='booking_payment_success_ignored',
                metadata={
                    'booking_status': booking.status,
                    'payment_intent_id': payment.transaction_id,
                },
            )
            return False

        payment.mark_success(gateway='stripe', now=timezone.now())

        if booking.status == 'pending':
            confirmed = confirm_booking_after_successful_payment(
                booking=booking,
                trigger='payment_success',
            )
            if not confirmed:
                return False

        cls._create_revenue_for_successful_payment(payment=payment, booking=booking)
        cls._queue_booking_confirmation_email(payment=payment, booking=booking)
        return True

    @staticmethod
    def _mark_payment_failed(*, payment):
        payment.mark_failed(gateway='stripe')

    @staticmethod
    def _payment_success_response(*, payment, booking, message):
        return success_response(
            message=message,
            data={
                'payment': BookingPaymentSerializer(payment).data,
                'booking': _booking_notification_payload(booking),
            },
            extra={
                'payment': BookingPaymentSerializer(payment).data,
                'booking': _booking_notification_payload(booking),
            },
        )

    def _create_intent_response(self, request, serializer):
        booking_id = serializer.validated_data['booking_id']
        stripe_module, stripe_error = get_stripe_module()
        if stripe_error:
            return error_response(
                message=stripe_error,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                error_code='payment_provider_unavailable',
            )
        stripe_errors = _stripe_error_classes(stripe_module)

        try:
            booking = Booking.objects.get(booking_id=booking_id)
        except Booking.DoesNotExist:
            return error_response(
                message='Booking not found.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='booking_not_found',
            )

        access_error = self._validate_booking_access(booking=booking, user=request.user)
        if access_error:
            return access_error
        synchronize_booking_lifecycle(
            booking_ids=[booking.booking_id],
            now=timezone.now(),
            trigger='payment_intent_request',
        )

        if booking.total_price <= 0:
            return error_response(
                message='Booking amount must be greater than zero.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_booking_amount',
            )

        # Lock booking row so concurrent create-intent requests serialize and
        # cannot both create a new pending payment row for the same booking.
        with transaction.atomic():
            locked_booking = Booking.objects.select_for_update().get(booking_id=booking.booking_id)
            expire_booking_if_unpaid(
                booking=locked_booking,
                actor=request.user,
                now=timezone.now(),
                trigger='create_payment_intent',
                has_successful_payment=False,
            )
            if locked_booking.status == 'expired':
                return error_response(
                    message='Booking has expired because payment was not completed in time.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='booking_expired',
                )
            currency = str(getattr(settings, 'STRIPE_CURRENCY', 'AFG') or 'AFG').lower()
            existing_success = locked_booking.payments.select_for_update().filter(payment_status='success').first()
            if existing_success:
                return error_response(
                    message='Payment already completed for this booking.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='payment_already_completed',
                )

            existing_pending = locked_booking.payments.select_for_update().filter(payment_status='pending').first()
            if existing_pending:
                try:
                    intent = stripe_module.PaymentIntent.retrieve(existing_pending.transaction_id)
                    intent_status = _intent_value(intent, 'status')
                    if intent_status == 'succeeded':
                        is_valid, mismatch_reason = _validate_intent_amount_currency(
                            intent=intent,
                            booking=locked_booking,
                        )
                        locked_payment = BookingPayment.objects.select_for_update().get(
                            booking_payment_id=existing_pending.booking_payment_id
                        )
                        if is_valid:
                            accepted = self._mark_payment_success(payment=locked_payment, booking=locked_booking)
                            if not accepted:
                                return error_response(
                                    message='Booking can no longer accept payment confirmation.',
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    error_code='invalid_booking_state',
                                )
                        else:
                            self._mark_payment_failed(payment=locked_payment)
                            return error_response(
                                message=f'Payment validation failed: {mismatch_reason}',
                                status_code=status.HTTP_400_BAD_REQUEST,
                                error_code='payment_validation_failed',
                            )
                        return success_response(
                            message='Your booking is confirmed',
                            data={
                                'client_secret': _intent_value(intent, 'client_secret'),
                                'payment_intent_id': _intent_value(intent, 'id'),
                                'payment': BookingPaymentSerializer(locked_payment).data,
                                'booking': _booking_notification_payload(locked_booking),
                            },
                            extra={
                                'client_secret': _intent_value(intent, 'client_secret'),
                                'payment_intent_id': _intent_value(intent, 'id'),
                            },
                        )

                    if intent_status in REUSABLE_PAYMENT_INTENT_STATUSES:
                        return success_response(
                            data={
                                'client_secret': _intent_value(intent, 'client_secret'),
                                'payment_intent_id': _intent_value(intent, 'id'),
                            }
                        )
                except stripe_errors as exc:
                    logger.warning(
                        'Stripe pending intent retrieve failed for payment_intent_id=%s: %s',
                        existing_pending.transaction_id,
                        str(exc),
                    )
                except (TypeError, ValueError) as exc:
                    logger.warning(
                        'Stripe pending intent parse failed for payment_intent_id=%s: %s',
                        existing_pending.transaction_id,
                        str(exc),
                    )
                except AttributeError:
                    logger.exception(
                        'Unexpected pending intent response shape for payment_intent_id=%s',
                        existing_pending.transaction_id,
                    )

                existing_pending.payment_status = 'failed'
                existing_pending.save(update_fields=['payment_status'])

            amount_in_cents = int((locked_booking.total_price * Decimal('100')).quantize(Decimal('1')))

            try:
                payment_intent = stripe_module.PaymentIntent.create(
                    amount=amount_in_cents,
                    currency=currency,
                    metadata={
                        'booking_id': str(locked_booking.booking_id),
                        'user_id': str(request.user.pk),
                    }
                )
            except stripe_errors as exc:
                logger.warning('Stripe create PaymentIntent failed for booking_id=%s: %s', locked_booking.booking_id, str(exc))
                return _payment_provider_unavailable_response()
            except AttributeError:
                logger.exception('Unexpected error creating PaymentIntent for booking_id=%s', locked_booking.booking_id)
                return error_response(
                    message='Unable to create payment intent.',
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    error_code='payment_provider_unavailable',
                )

            payment = BookingPayment.objects.create(
                booking=locked_booking,
                amount=locked_booking.total_price,
                currency=currency.upper(),
                gateway_name='stripe',
                transaction_id=payment_intent.id,
                payment_status='pending',
                paid_at=None
            )

        return success_response(
            data={
                'client_secret': payment_intent.client_secret,
                'payment_intent_id': payment_intent.id,
                'payment': BookingPaymentSerializer(payment).data,
            },
            status_code=status.HTTP_201_CREATED,
            message='Payment intent created successfully.',
        )

    @action(detail=False, methods=['post'], url_path='create-intent')
    def create_intent(self, request):
        serializer = CreateBookingPaymentIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._create_intent_response(request, serializer)

    @action(detail=False, methods=['post'])
    def confirm(self, request):
        serializer = ConfirmBookingPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stripe_module, stripe_error = get_stripe_module()
        if stripe_error:
            return error_response(
                message=stripe_error,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                error_code='payment_provider_unavailable',
            )
        stripe_errors = _stripe_error_classes(stripe_module)

        payment_intent_id = serializer.validated_data['payment_intent_id']

        try:
            payment = BookingPayment.objects.select_related('booking').get(transaction_id=payment_intent_id)
        except BookingPayment.DoesNotExist:
            return error_response(
                message='Payment record not found for this payment intent.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='payment_not_found',
            )

        booking = payment.booking
        access_error = self._validate_booking_access(
            booking=booking,
            user=request.user,
            require_pending=False,
        )
        if access_error:
            return access_error

        if payment.payment_status == 'success':
            return self._payment_success_response(
                payment=payment,
                booking=booking,
                message='Your booking is confirmed',
            )

        if booking.status != 'pending':
            return error_response(
                message='Booking is not in pending status.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_booking_state',
            )

        try:
            payment_intent = stripe_module.PaymentIntent.retrieve(payment_intent_id)
        except stripe_errors as exc:
            logger.warning('Stripe retrieve PaymentIntent failed for payment_intent_id=%s: %s', payment_intent_id, str(exc))
            return error_response(
                message='Unable to verify payment status at this time.',
                status_code=status.HTTP_502_BAD_GATEWAY,
                error_code='payment_provider_unavailable',
            )
        except AttributeError:
            logger.exception('Unexpected error retrieving PaymentIntent for payment_intent_id=%s', payment_intent_id)
            return error_response(
                message='Unable to retrieve payment intent.',
                status_code=status.HTTP_502_BAD_GATEWAY,
                error_code='payment_provider_unavailable',
            )

        if payment_intent.status != 'succeeded':
            return error_response(
                message=f'Payment not successful. Current status: {payment_intent.status}',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='payment_not_successful',
            )

        with transaction.atomic():
            locked_payment = BookingPayment.objects.select_for_update().get(
                booking_payment_id=payment.booking_payment_id
            )
            locked_booking = Booking.objects.select_for_update().get(
                booking_id=booking.booking_id
            )
            expire_booking_if_unpaid(
                booking=locked_booking,
                actor=request.user,
                now=timezone.now(),
                trigger='confirm_payment',
                has_successful_payment=(locked_payment.payment_status == 'success'),
            )
            if locked_booking.status == 'expired':
                self._mark_payment_failed(payment=locked_payment)
                return error_response(
                    message='Booking has expired because payment was not completed in time.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='booking_expired',
                )
            is_valid, mismatch_reason = _validate_intent_amount_currency(
                intent=payment_intent,
                booking=locked_booking,
            )
            if not is_valid:
                self._mark_payment_failed(payment=locked_payment)
                return error_response(
                    message=f'Payment validation failed: {mismatch_reason}',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='payment_validation_failed',
                )
            accepted = self._mark_payment_success(payment=locked_payment, booking=locked_booking)
            if not accepted:
                return error_response(
                    message='Booking can no longer accept payment confirmation.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_code='invalid_booking_state',
                )
            payment = locked_payment
            booking = locked_booking

        return self._payment_success_response(
            payment=payment,
            booking=booking,
            message='Your booking is confirmed',
        )
    
    @action(detail=False, methods=['post'])
    def process(self, request):
        """
        Backward-compatible alias for create-intent.
        """
        serializer = CreateBookingPaymentIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._create_intent_response(request, serializer)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def process_tournament_payment(request):
    """
    Process tournament payment (mock).
    """
    if not bool(getattr(settings, 'PAYMENTS_ENABLE_TOURNAMENT_MOCK', False)):
        logger.warning('Tournament mock payment endpoint called while disabled')
        return error_response(
            message='Tournament payment endpoint is disabled.',
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code='payment_endpoint_disabled',
        )

    tournament_id = request.data.get('tournament_id')
    team_id = request.data.get('team_id')
    amount = request.data.get('amount')
    gateway_name = request.data.get('gateway_name', 'mock_gateway')

    if not tournament_id:
        return error_response(
            message='tournament_id is required.',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='missing_tournament_id',
        )
    
    from apps.tournaments.models import Tournament, Team
    try:
        tournament = Tournament.objects.get(tournament_id=tournament_id)
    except Tournament.DoesNotExist:
        return error_response(
            message='Tournament not found.',
            status_code=status.HTTP_404_NOT_FOUND,
            error_code='tournament_not_found',
        )

    # Registration is only allowed while tournament is upcoming, so align payment gating to the same lifecycle.
    if tournament.status != 'upcoming':
        return error_response(
            message='Tournament payment is only available while tournament registration is open.',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_tournament_state',
        )

    if tournament.registration_fee <= 0:
        return error_response(
            message='Tournament registration fee must be greater than zero.',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_tournament_configuration',
        )

    # Backward compatibility for older clients that still send amount:
    # reject underpayment explicitly and ignore the client value for final amount.
    if amount is not None:
        from decimal import Decimal as _Decimal
        try:
            requested_amount = _Decimal(str(amount))
        except Exception:
            return error_response(
                message='amount must be a valid decimal number.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_amount',
            )
        if requested_amount < tournament.registration_fee:
            return error_response(
                message='Provided amount is lower than tournament registration fee.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='amount_below_registration_fee',
            )

    amount = tournament.registration_fee
    team = None
    registration_meta = {}
    if team_id:
        try:
            team = Team.objects.get(team_id=team_id, tournament=tournament)
        except Team.DoesNotExist:
            return error_response(
                message='Team not found.',
                status_code=status.HTTP_404_NOT_FOUND,
                error_code='team_not_found',
            )
    else:
        team_name = str(request.data.get('team_name', '')).strip()
        captain_name = str(request.data.get('captain_name', '')).strip()
        captain_phone = str(request.data.get('captain_phone', '')).strip()
        members = request.data.get('members')
        if not team_name or not captain_name or not captain_phone:
            return error_response(
                message='team_name, captain_name and captain_phone are required when team_id is omitted.',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='missing_registration_details',
            )
        try:
            members = normalize_team_members(members)
        except ValueError as exc:
            return error_response(
                message=str(exc),
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_team_members',
            )
        registration_meta = {
            'team_name': team_name,
            'captain_name': captain_name,
            'captain_phone': captain_phone,
            'members': members,
        }
    
    # Mock payment processing
    transaction_id = f"TOURNAMENT-TXN-{uuid.uuid4().hex[:12].upper()}"

    success = bool(getattr(settings, 'PAYMENTS_TOURNAMENT_MOCK_FORCE_SUCCESS', True))

    with transaction.atomic():
        # Create a tournament payment record (explicit domain model; avoids mixing with owner payments).
        payment = TournamentPayment.objects.create(
            tournament=tournament,
            team=team,
            payer=request.user,
            gym=tournament.gym,
            amount=amount,
            currency='AFN',
            payment_gateway=gateway_name,
            transaction_id=transaction_id,
            purpose=TournamentPayment.Purpose.REGISTRATION,
            metadata={
                'tournament_id': tournament.tournament_id,
                'team_id': team.team_id if team else None,
                'payer_user_id': request.user.pk,
                **registration_meta,
            },
            payment_status='success' if success else 'failed',
            paid_at=timezone.now() if success else None,
        )

        if success:
            try:
                _finalize_tournament_team_registration(
                    payment=payment,
                    tournament=tournament,
                    intent=None,
                )
            except ValueError as exc:
                payment.mark_failed(gateway=gateway_name)
                return error_response(message=str(exc), status_code=status.HTTP_400_BAD_REQUEST, error_code='registration_finalization_failed')

            payment = TournamentPayment.objects.select_for_update().get(
                tournament_payment_id=payment.tournament_payment_id
            )
            payment.mark_success(gateway=gateway_name)

            if payment.team_id:
                Team.objects.filter(team_id=payment.team_id).update(status='pending_owner_approval')

            _upsert_tournament_revenue(tournament_payment=payment)

    if success:
        return success_response(
            message='Tournament payment processed successfully.',
            data={'payment': TournamentPaymentSerializer(payment).data},
            status_code=status.HTTP_201_CREATED,
        )

    return error_response(
        message='Payment failed. Please try again.',
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code='payment_failed',
        extra={'payment': TournamentPaymentSerializer(payment).data},
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payment_history(request):
    """
    Get user payment history.
    """
    user = request.user
    
    if user.role == 'admin':
        booking_payments = BookingPayment.objects.select_related('booking__field__gym', 'booking__user').all()
        tournament_payments = TournamentPayment.objects.all()
    elif user.role == 'owner':
        booking_payments = BookingPayment.objects.select_related('booking__field__gym', 'booking__user').filter(booking__field__gym__owner=user)
        tournament_payments = TournamentPayment.objects.filter(gym__owner=user)
    else:
        booking_payments = BookingPayment.objects.select_related('booking__field__gym', 'booking__user').filter(booking__user=user)
        tournament_payments = TournamentPayment.objects.filter(payer=user)
    
    booking_serializer = BookingPaymentSerializer(booking_payments, many=True)
    tournament_serializer = TournamentPaymentSerializer(tournament_payments, many=True)
    
    return success_response(
        data={
            'booking_payments': booking_serializer.data,
            'owner_payments': [],
            'tournament_payments': tournament_serializer.data,
        }
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_webhook(request):
    stripe_module, stripe_error = get_stripe_module()
    if stripe_error:
        return error_response(
            message=stripe_error,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code='payment_provider_unavailable',
        )

    webhook_secret, webhook_error = get_stripe_webhook_secret()
    if webhook_error:
        return error_response(
            message=webhook_error,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error_code='payment_provider_unavailable',
        )

    stripe_errors = _stripe_error_classes(stripe_module)
    signature_error_cls = _signature_error_class(stripe_module)

    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    if not sig_header:
        _log_signature_rejection('missing Stripe-Signature header')
        return error_response(
            message='Missing Stripe signature header',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='missing_webhook_signature',
        )

    try:
        event = stripe_module.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe_errors as exc:
        if signature_error_cls and isinstance(exc, signature_error_cls):
            _log_signature_rejection('invalid Stripe signature')
            return error_response(
                message='Invalid webhook signature',
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code='invalid_webhook_signature',
            )
        logger.warning('Stripe webhook payload validation failed: %s', str(exc))
        return error_response(
            message='Unable to validate webhook payload',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_webhook_payload',
        )
    except ValueError as exc:
        _log_signature_rejection('malformed webhook signature')
        return error_response(
            message='Invalid webhook signature',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='invalid_webhook_signature',
        )

    event_id = _intent_value(event, 'id')
    if not event_id:
        return error_response(
            message='Missing Stripe event id in payload',
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code='missing_webhook_event_id',
        )

    try:
        with transaction.atomic():
            webhook_event, created = _get_or_create_webhook_event_with_retry(
                event_id=event_id,
                event_type=_intent_value(event, 'type'),
                payment_intent_id=None,
            )
            webhook_event = StripeWebhookEvent.objects.select_for_update().get(pk=webhook_event.pk)
            if not created and webhook_event.processed_at is not None:
                logger.info('Stripe webhook duplicate event ignored: event_id=%s', event_id)
                return success_response(message='Webhook already processed.', data={'received': True})

            event_type = _intent_value(event, 'type')
            event_data = _intent_value(event, 'data', {}) or {}
            if isinstance(event_data, dict):
                intent = event_data.get('object', {})
            else:
                intent = _intent_value(event_data, 'object', {})

            payment_intent_id = _intent_value(intent, 'id')
            update_fields = []
            if webhook_event.event_type != (event_type or webhook_event.event_type):
                webhook_event.event_type = event_type or webhook_event.event_type
                update_fields.append('event_type')
            if payment_intent_id and webhook_event.payment_intent_id != payment_intent_id:
                webhook_event.payment_intent_id = payment_intent_id
                update_fields.append('payment_intent_id')
            if update_fields:
                webhook_event.save(update_fields=update_fields)

            if not payment_intent_id:
                logger.error('Stripe webhook missing payment_intent id in payload. event_id=%s', event_id)
                _mark_webhook_event_processed(webhook_event)
                return success_response(message='Webhook received.', data={'received': True})

            payment = BookingPayment.objects.select_for_update().filter(transaction_id=payment_intent_id).first()
            booking = _resolve_booking_for_intent(intent, payment)
            currency = str(
                _intent_value(intent, 'currency', getattr(settings, 'STRIPE_CURRENCY', 'AFG'))
            )

            if event_type == 'payment_intent.succeeded':
                if booking is None:
                    tournament_payment = TournamentPayment.objects.select_for_update().filter(transaction_id=payment_intent_id).first()
                    tournament = _resolve_tournament_for_intent(intent, tournament_payment)
                    if tournament is None:
                        logger.error(
                            'Stripe webhook succeeded missing booking/tournament for payment_intent_id=%s',
                            payment_intent_id,
                        )
                        _mark_webhook_event_processed(webhook_event)
                        return success_response(message='Webhook received.', data={'received': True})

                    payer = _resolve_payer_for_intent(intent=intent, tournament_payment=tournament_payment)
                    if payer is None:
                        logger.error(
                            'Stripe webhook tournament intent missing/invalid payer metadata. payment_intent_id=%s',
                            payment_intent_id,
                        )
                        _mark_webhook_event_processed(webhook_event)
                        return success_response(message='Webhook received.', data={'received': True})

                    team = _resolve_team_for_intent(intent, tournament)
                    is_valid, mismatch_reason = _validate_tournament_intent_amount_currency(
                        intent=intent,
                        tournament=tournament,
                    )
                    if tournament_payment is None:
                        try:
                            tournament_payment = TournamentPayment.objects.create(
                                tournament=tournament,
                                team=team,
                                payer=payer,
                                gym=tournament.gym,
                                amount=tournament.registration_fee,
                                currency=str(currency).upper(),
                                payment_gateway='stripe',
                                transaction_id=payment_intent_id,
                                purpose=TournamentPayment.Purpose.REGISTRATION,
                                metadata={
                                    'tournament_id': tournament.tournament_id,
                                    'team_id': team.team_id if team else None,
                                },
                                payment_status='pending',
                                paid_at=None,
                            )
                        except IntegrityError:
                            tournament_payment = TournamentPayment.objects.select_for_update().filter(
                                transaction_id=payment_intent_id
                            ).first()

                    tournament_payment = TournamentPayment.objects.select_for_update().get(
                        tournament_payment_id=tournament_payment.tournament_payment_id
                    )
                    TournamentStripeWebhookAudit.objects.update_or_create(
                        stripe_event=webhook_event,
                        defaults={
                            'payment_intent_id': payment_intent_id,
                            'tournament': tournament,
                            'tournament_payment': tournament_payment,
                            'payer': payer,
                            'event_type': event_type or 'unknown',
                            'processed_at': timezone.now(),
                        },
                    )
                    if is_valid:
                        try:
                            _finalize_tournament_team_registration(
                                payment=tournament_payment,
                                tournament=tournament,
                                intent=intent,
                            )
                        except ValueError as exc:
                            logger.error(
                                'Webhook tournament team finalization failed payment_intent_id=%s: %s',
                                payment_intent_id,
                                str(exc),
                            )
                            tournament_payment.mark_failed(gateway='stripe')
                            _mark_webhook_event_processed(webhook_event)
                            return success_response(message='Webhook received.', data={'received': True})

                        tournament_payment = TournamentPayment.objects.select_for_update().get(
                            tournament_payment_id=tournament_payment.tournament_payment_id
                        )
                        tournament_payment.mark_success(gateway='stripe', now=timezone.now())
                        _confirm_team_if_present(tournament_payment.team)
                        _upsert_tournament_revenue(tournament_payment=tournament_payment)
                    else:
                        logger.warning(
                            'Stripe webhook tournament succeeded rejected due to mismatch for payment_intent_id=%s: %s',
                            payment_intent_id,
                            mismatch_reason,
                        )
                        tournament_payment.mark_failed(gateway='stripe')

                    _mark_webhook_event_processed(webhook_event)
                    return success_response(message='Webhook received.', data={'received': True})

                if payment is None:
                    payment, _created = _get_or_create_booking_payment_with_retry(
                        booking=booking,
                        payment_intent_id=payment_intent_id,
                        currency=currency,
                        status_value='pending',
                    )

                # Lock rows before idempotent success transition + revenue creation.
                payment = BookingPayment.objects.select_for_update().get(
                    booking_payment_id=payment.booking_payment_id
                )
                booking = Booking.objects.select_for_update().get(booking_id=booking.booking_id)
                expire_booking_if_unpaid(
                    booking=booking,
                    now=timezone.now(),
                    trigger='stripe_webhook_success',
                    has_successful_payment=(payment.payment_status == 'success'),
                )
                is_valid, mismatch_reason = _validate_intent_amount_currency(
                    intent=intent,
                    booking=booking,
                )
                if is_valid:
                    BookingPaymentViewSet._mark_payment_success(payment=payment, booking=booking)
                else:
                    logger.warning(
                        'Stripe webhook succeeded rejected due to mismatch for payment_intent_id=%s: %s',
                        payment_intent_id,
                        mismatch_reason,
                    )
                    BookingPaymentViewSet._mark_payment_failed(payment=payment)

            elif event_type == 'payment_intent.payment_failed':
                if booking is None:
                    tournament_payment = TournamentPayment.objects.select_for_update().filter(transaction_id=payment_intent_id).first()
                    tournament = _resolve_tournament_for_intent(intent, tournament_payment)
                    if tournament is None:
                        logger.error(
                            'Stripe webhook failed missing booking/tournament for payment_intent_id=%s',
                            payment_intent_id,
                        )
                        _mark_webhook_event_processed(webhook_event)
                        return success_response(message='Webhook received.', data={'received': True})

                    payer = _resolve_payer_for_intent(intent=intent, tournament_payment=tournament_payment)
                    if payer is None:
                        logger.error(
                            'Stripe webhook tournament intent missing/invalid payer metadata. payment_intent_id=%s',
                            payment_intent_id,
                        )
                        _mark_webhook_event_processed(webhook_event)
                        return success_response(message='Webhook received.', data={'received': True})

                    team = _resolve_team_for_intent(intent, tournament)
                    if tournament_payment is None:
                        try:
                            tournament_payment = TournamentPayment.objects.create(
                                tournament=tournament,
                                team=team,
                                payer=payer,
                                gym=tournament.gym,
                                amount=tournament.registration_fee,
                                currency=str(currency).upper(),
                                payment_gateway='stripe',
                                transaction_id=payment_intent_id,
                                purpose=TournamentPayment.Purpose.REGISTRATION,
                                metadata={
                                    'tournament_id': tournament.tournament_id,
                                    'team_id': (team.team_id if team else None),
                                },
                                payment_status='failed',
                                paid_at=None,
                            )
                        except IntegrityError:
                            tournament_payment = TournamentPayment.objects.select_for_update().filter(
                                transaction_id=payment_intent_id
                            ).first()

                    if tournament_payment:
                        tournament_payment.mark_failed(gateway='stripe')

                    TournamentStripeWebhookAudit.objects.update_or_create(
                        stripe_event=webhook_event,
                        defaults={
                            'payment_intent_id': payment_intent_id,
                            'tournament': tournament,
                            'tournament_payment': tournament_payment,
                            'payer': payer,
                            'event_type': event_type or 'unknown',
                            'processed_at': timezone.now(),
                        },
                    )

                    _mark_webhook_event_processed(webhook_event)
                    return success_response(message='Webhook received.', data={'received': True})

                if payment is None:
                    payment, _created = _get_or_create_booking_payment_with_retry(
                        booking=booking,
                        payment_intent_id=payment_intent_id,
                        currency=currency,
                        status_value='failed',
                    )

                payment = BookingPayment.objects.select_for_update().get(
                    booking_payment_id=payment.booking_payment_id
                )
                if payment.payment_status != 'success':
                    payment.payment_status = 'failed'
                    payment.gateway_name = 'stripe'
                    payment.save(update_fields=['payment_status', 'gateway_name'])

            # Ignore unrelated events while still acknowledging receipt.
            _mark_webhook_event_processed(webhook_event)
    except DatabaseError:
        payment_intent_id = locals().get('payment_intent_id')
        logger.exception(
            'Database error during Stripe webhook processing for event_id=%s payment_intent_id=%s',
            event_id,
            payment_intent_id,
        )
        return error_response(
            message='Webhook processing failed. Please retry.',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code='webhook_processing_failed',
        )
    except (TypeError, ValueError, IntegrityError):
        payment_intent_id = locals().get('payment_intent_id')
        logger.exception(
            'Webhook payload/business processing error for event_id=%s payment_intent_id=%s',
            event_id,
            payment_intent_id,
        )
        return error_response(
            message='Webhook processing failed. Please retry.',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code='webhook_processing_failed',
        )
    except AttributeError:
        payment_intent_id = locals().get('payment_intent_id')
        logger.exception(
            'Unhandled Stripe webhook processing error for event_id=%s payment_intent_id=%s',
            event_id,
            payment_intent_id,
        )
        return error_response(
            message='Webhook processing failed. Please retry.',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code='webhook_processing_failed',
        )

    return success_response(message='Webhook received.', data={'received': True})
