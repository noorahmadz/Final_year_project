from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.bookings.models import Booking, expire_booking_if_unpaid


class Command(BaseCommand):
    help = 'Deprecated: expire unpaid pending bookings only. Use sync_booking_lifecycle for the formal scheduler.'

    def handle(self, *args, **options):
        expired_count = 0

        with transaction.atomic():
            bookings = list(
                Booking.objects.select_for_update().filter(status='pending').order_by('booking_id')
            )
            for booking in bookings:
                has_successful_payment = booking.payments.select_for_update().filter(
                    payment_status='success'
                ).exists()
                if expire_booking_if_unpaid(
                    booking=booking,
                    now=timezone.now(),
                    trigger='management_command',
                    has_successful_payment=has_successful_payment,
                ):
                    expired_count += 1

        self.stdout.write(
            self.style.SUCCESS(f'Expired {expired_count} unpaid booking(s).')
        )
