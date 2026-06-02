from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.bookings.models import BookingLifecycleMonitor


class Command(BaseCommand):
    help = 'Fail when booking lifecycle synchronization has not run successfully within the configured staleness window.'

    def handle(self, *args, **options):
        staleness_seconds = int(
            getattr(settings, 'BOOKING_LIFECYCLE_MAX_STALENESS_SECONDS', 300)
        )
        stale_before = timezone.now() - timedelta(seconds=staleness_seconds)

        monitor = BookingLifecycleMonitor.objects.filter(
            monitor_key='booking_lifecycle'
        ).first()
        if monitor is None or monitor.last_success_at is None:
            raise CommandError('Booking lifecycle sync has never completed successfully.')

        if monitor.last_success_at < stale_before:
            raise CommandError(
                'Booking lifecycle sync is stale. '
                f'last_success_at={monitor.last_success_at.isoformat()} '
                f'max_staleness_seconds={staleness_seconds}'
            )

        self.stdout.write(
            self.style.SUCCESS(
                'Booking lifecycle sync healthy. '
                f'last_success_at={monitor.last_success_at.isoformat()} '
                f'last_expired_count={monitor.last_expired_count} '
                f'last_completed_count={monitor.last_completed_count}'
            )
        )
