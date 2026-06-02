from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, F, Q, Sum

from apps.payments.models import TournamentPayment
from apps.revenues.models import GymRevenue


class Command(BaseCommand):
    help = (
        'Validate payment-to-revenue traceability after the tournament revenue migration '
        'and fail on orphaned, duplicated, or mathematically inconsistent rows.'
    )

    def handle(self, *args, **options):
        issues = []

        invalid_type_rows = GymRevenue.objects.filter(
            ~(
                Q(revenue_type='booking', booking_payment__isnull=False, tournament_payment__isnull=True)
                | Q(revenue_type='tournament', tournament_payment__isnull=False, booking_payment__isnull=True)
            )
        )
        if invalid_type_rows.exists():
            issues.append(f'invalid revenue/payment linkage rows={invalid_type_rows.count()}')

        duplicate_booking_refs = (
            GymRevenue.objects.filter(booking_payment__isnull=False)
            .values('booking_payment_id')
            .annotate(row_count=Count('revenue_id'))
            .filter(row_count__gt=1)
        )
        if duplicate_booking_refs.exists():
            issues.append(f'duplicate booking revenue rows={duplicate_booking_refs.count()}')

        duplicate_tournament_refs = (
            GymRevenue.objects.filter(tournament_payment__isnull=False)
            .values('tournament_payment_id')
            .annotate(row_count=Count('revenue_id'))
            .filter(row_count__gt=1)
        )
        if duplicate_tournament_refs.exists():
            issues.append(f'duplicate tournament revenue rows={duplicate_tournament_refs.count()}')

        bad_formula_rows = GymRevenue.objects.exclude(net_amount=F('amount') - F('commission_amount'))
        if bad_formula_rows.exists():
            issues.append(f'net amount formula mismatches={bad_formula_rows.count()}')

        missing_tournament_revenue = TournamentPayment.objects.filter(payment_status='success').exclude(
            revenues__revenue_type='tournament'
        )
        if missing_tournament_revenue.exists():
            issues.append(
                f'successful tournament payments missing revenue rows={missing_tournament_revenue.count()}'
            )

        tournament_revenue_total = (
            GymRevenue.objects.filter(revenue_type='tournament').aggregate(total=Sum('amount'))['total']
            or Decimal('0.00')
        )
        tournament_payment_total = (
            TournamentPayment.objects.filter(payment_status='success').aggregate(total=Sum('amount'))['total']
            or Decimal('0.00')
        )
        if tournament_revenue_total != tournament_payment_total:
            issues.append(
                'tournament revenue total mismatch '
                f'(revenue={tournament_revenue_total} payment={tournament_payment_total})'
            )

        if issues:
            raise CommandError('Revenue integrity check failed: ' + '; '.join(issues))

        self.stdout.write(
            self.style.SUCCESS(
                'Revenue integrity healthy. '
                f'tournament_revenue_total={tournament_revenue_total} '
                f"successful_tournament_payments={TournamentPayment.objects.filter(payment_status='success').count()}"
            )
        )
