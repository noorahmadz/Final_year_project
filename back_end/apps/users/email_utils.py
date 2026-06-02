import logging

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import EmailVerificationOTP

logger = logging.getLogger(__name__)


class OTPEmailDeliveryError(Exception):
    def __init__(self, *, public_message, error_code, internal_message=None):
        super().__init__(internal_message or public_message)
        self.public_message = public_message
        self.error_code = error_code


def _validate_otp_email_delivery_config():
    if not (getattr(settings, 'DEFAULT_FROM_EMAIL', '') or '').strip():
        raise OTPEmailDeliveryError(
            public_message='Verification email is temporarily unavailable. Please try again later.',
            error_code='email_service_unavailable',
            internal_message='DEFAULT_FROM_EMAIL is not configured.',
        )
    if not (getattr(settings, 'EMAIL_HOST', '') or '').strip():
        raise OTPEmailDeliveryError(
            public_message='Verification email is temporarily unavailable. Please try again later.',
            error_code='email_service_unavailable',
            internal_message='EMAIL_HOST is not configured.',
        )
    if not (getattr(settings, 'EMAIL_HOST_USER', '') or '').strip():
        raise OTPEmailDeliveryError(
            public_message='Verification email is temporarily unavailable. Please try again later.',
            error_code='email_service_unavailable',
            internal_message='EMAIL_HOST_USER is not configured.',
        )
    if not (getattr(settings, 'EMAIL_HOST_PASSWORD', '') or '').strip():
        raise OTPEmailDeliveryError(
            public_message='Verification email is temporarily unavailable. Please try again later.',
            error_code='email_service_unavailable',
            internal_message='EMAIL_HOST_PASSWORD is not configured.',
        )


def send_verification_otp_email(*, email, otp):
    _validate_otp_email_delivery_config()
    expiry_minutes = int(EmailVerificationOTP.OTP_TTL.total_seconds() // 60)
    try:
        sent_count = send_mail(
            subject=_('Email Verification Code'),
            message=render_to_string(
                'emails/otp_verification.txt',
                {
                    'otp_code': otp,
                    'expiry_minutes': expiry_minutes,
                },
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        if sent_count != 1:
            raise OTPEmailDeliveryError(
                public_message='We could not send the verification email. Please try again later.',
                error_code='verification_email_delivery_failed',
                internal_message=f'send_mail returned {sent_count}.',
            )
    except OTPEmailDeliveryError:
        raise
    except ImproperlyConfigured as exc:
        raise OTPEmailDeliveryError(
            public_message='Verification email is temporarily unavailable. Please try again later.',
            error_code='email_service_unavailable',
            internal_message=str(exc),
        ) from exc
    except Exception as exc:
        raise OTPEmailDeliveryError(
            public_message='We could not send the verification email. Please try again later.',
            error_code='verification_email_delivery_failed',
            internal_message=str(exc),
        ) from exc


def deliver_verification_otp_email(*, otp_id, otp):
    with transaction.atomic():
        otp_record = EmailVerificationOTP.objects.select_for_update().get(pk=otp_id)
        attempted_at = timezone.now()
        otp_record.delivery_attempted_at = attempted_at
        otp_record.delivery_error = ''
        otp_record.save(update_fields=['delivery_attempted_at', 'delivery_error'])

        try:
            send_verification_otp_email(email=otp_record.email, otp=otp)
        except OTPEmailDeliveryError as exc:
            otp_record.delivery_status = EmailVerificationOTP.DeliveryStatus.FAILED
            otp_record.delivery_failed_at = timezone.now()
            otp_record.delivery_sent_at = None
            otp_record.delivery_error = str(exc)[:1000]
            otp_record.save(
                update_fields=[
                    'delivery_status',
                    'delivery_failed_at',
                    'delivery_sent_at',
                    'delivery_error',
                ]
            )
            logger.exception(
                'Verification OTP email failed. otp_id=%s email=%s',
                otp_record.pk,
                otp_record.email,
            )
            return {
                'ok': False,
                'status': otp_record.delivery_status,
                'message': exc.public_message,
                'error_code': exc.error_code,
            }

        otp_record.delivery_status = EmailVerificationOTP.DeliveryStatus.SENT
        otp_record.delivery_sent_at = timezone.now()
        otp_record.delivery_failed_at = None
        otp_record.delivery_error = ''
        otp_record.save(
            update_fields=[
                'delivery_status',
                'delivery_sent_at',
                'delivery_failed_at',
                'delivery_error',
            ]
        )
        return {
            'ok': True,
            'status': otp_record.delivery_status,
            'message': 'Verification code sent successfully.',
            'error_code': None,
        }
