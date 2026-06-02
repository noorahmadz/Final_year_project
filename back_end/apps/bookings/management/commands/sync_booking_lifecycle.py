from django.core.management.base import BaseCommand

from apps.bookings.lifecycle import synchronize_booking_lifecycle


class Command(BaseCommand):
    help = 'Synchronize booking lifecycle by expiring unpaid pending bookings and completing due confirmed bookings.'

    def handle(self, *args, **options):
        result = synchronize_booking_lifecycle(trigger='management_command')

        self.stdout.write(
            self.style.SUCCESS(
                f"Synchronized bookings: expired={result['expired_count']}, "
                f"completed={result['completed_count']}."
            )
        )
