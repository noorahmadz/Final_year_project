import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import BookingPayment

logger = logging.getLogger(__name__)


def send_booking_confirmation_email(*, booking_payment_id):
    with transaction.atomic():
        payment = BookingPayment.objects.select_for_update().select_related(
            'booking__user',
            'booking__field__gym',
        ).filter(booking_payment_id=booking_payment_id).first()
        if payment is None:
            logger.warning(
                'Booking confirmation email skipped: payment not found. booking_payment_id=%s',
                booking_payment_id,
            )
            return

        if (
            payment.confirmation_email_delivery_status
            == BookingPayment.ConfirmationEmailStatus.SENT
        ):
            return

        booking = payment.booking
        user = booking.user
        recipient_email = (getattr(user, 'email', '') or '').strip()
        if not recipient_email:
            payment.confirmation_email_delivery_status = (
                BookingPayment.ConfirmationEmailStatus.FAILED
            )
            payment.confirmation_email_last_error = 'Recipient email address is missing.'
            payment.save(
                update_fields=[
                    'confirmation_email_delivery_status',
                    'confirmation_email_last_error',
                ]
            )
            logger.warning(
                'Booking confirmation email skipped: user email missing. booking_payment_id=%s booking_id=%s',
                booking_payment_id,
                booking.booking_id,
            )
            return

        try:
            send_mail(
                subject=_('Booking Confirmation'),
                message=render_to_string(
                    'emails/booking_confirmation.txt',
                    {
                        'customer_name': user.full_name,
                        'booking_id': booking.booking_id,
                        'gym_name': booking.field.gym.name,
                        'court_name': booking.field.field_name,
                        'booking_date': booking.booking_date,
                        'start_time': booking.start_time,
                        'end_time': booking.end_time,
                        'amount': payment.amount,
                        'currency': payment.currency,
                        'payment_status': payment.payment_status,
                        'booking_status': booking.status,
                    },
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient_email],
                fail_silently=False,
            )
        except Exception as exc:
            payment.confirmation_email_delivery_status = (
                BookingPayment.ConfirmationEmailStatus.FAILED
            )
            payment.confirmation_email_last_error = str(exc)[:1000]
            payment.save(
                update_fields=[
                    'confirmation_email_delivery_status',
                    'confirmation_email_last_error',
                ]
            )
            logger.exception(
                'Booking confirmation email failed. booking_payment_id=%s booking_id=%s',
                booking_payment_id,
                booking.booking_id,
            )
            return

        payment.confirmation_email_delivery_status = (
            BookingPayment.ConfirmationEmailStatus.SENT
        )
        payment.confirmation_email_last_error = ''
        payment.confirmation_email_queued_at = timezone.now()
        payment.save(
            update_fields=[
                'confirmation_email_delivery_status',
                'confirmation_email_last_error',
                'confirmation_email_queued_at',
            ]
        )
