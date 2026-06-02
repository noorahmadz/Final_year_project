from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.gyms.models import Gym


class Command(BaseCommand):
    help = 'Synchronize expired approved gyms by marking them as pending.'

    def handle(self, *args, **options):
        now = timezone.now()
        updated_count = Gym.objects.filter(
            status='approved',
            is_deleted=False,
            approval_expires_at__isnull=False,
            approval_expires_at__lte=now
        ).update(
            status='pending',
            approved_by=None,
            approved_at=None
        )
        self.stdout.write(
            self.style.SUCCESS(f'Synchronized {updated_count} expired gym(s).')
        )
