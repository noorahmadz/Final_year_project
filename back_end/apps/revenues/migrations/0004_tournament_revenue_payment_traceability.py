from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations, models
import django.db.models.deletion


def _allocate_commission(total_commission, total_amount, payment_amount, is_last):
    if is_last:
        return total_commission
    if total_amount == Decimal('0.00'):
        return Decimal('0.00')
    proportional = (total_commission * payment_amount / total_amount)
    return proportional.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def forwards(apps, schema_editor):
    GymRevenue = apps.get_model('revenues', 'GymRevenue')
    TournamentPayment = apps.get_model('payments', 'TournamentPayment')

    for revenue in GymRevenue.objects.filter(revenue_type='tournament').order_by('revenue_id'):
        tournament_id = revenue.tournament_payment_id
        successful_payments = list(
            TournamentPayment.objects.filter(
                tournament_id=tournament_id,
                payment_status='success',
            ).order_by('tournament_payment_id')
        )

        if not successful_payments:
            revenue.delete()
            continue

        total_amount = sum((payment.amount for payment in successful_payments), Decimal('0.00'))
        total_commission = Decimal(revenue.commission_amount or Decimal('0.00'))
        remaining_commission = total_commission

        first_payment = successful_payments[0]
        for index, payment in enumerate(successful_payments):
            is_last = index == len(successful_payments) - 1
            payment_commission = _allocate_commission(
                remaining_commission,
                total_amount,
                payment.amount,
                is_last,
            )
            remaining_commission -= payment_commission
            payment_net = payment.amount - payment_commission

            if index == 0:
                revenue.gym_id = payment.gym_id
                revenue.booking_payment_id = None
                revenue.tournament_payment_event_id = payment.tournament_payment_id
                revenue.amount = payment.amount
                revenue.commission_amount = payment_commission
                revenue.net_amount = payment_net
                revenue.status = 'completed'
                revenue.save(
                    update_fields=[
                        'gym',
                        'booking_payment',
                        'tournament_payment_event',
                        'amount',
                        'commission_amount',
                        'net_amount',
                        'status',
                    ]
                )
                continue

            GymRevenue.objects.create(
                gym_id=payment.gym_id,
                revenue_type='tournament',
                booking_payment_id=None,
                tournament_payment_id=tournament_id,
                tournament_payment_event_id=payment.tournament_payment_id,
                amount=payment.amount,
                commission_amount=payment_commission,
                net_amount=payment_net,
                status='completed',
                created_at=revenue.created_at,
            )


def backwards(apps, schema_editor):
    GymRevenue = apps.get_model('revenues', 'GymRevenue')

    seen_tournaments = set()
    for revenue in GymRevenue.objects.filter(revenue_type='tournament').order_by('revenue_id'):
        payment = revenue.tournament_payment_event
        tournament_id = getattr(payment, 'tournament_id', None)
        if tournament_id is None:
            continue
        if tournament_id in seen_tournaments:
            revenue.delete()
            continue
        seen_tournaments.add(tournament_id)
        revenue.tournament_payment_id = tournament_id
        revenue.save(update_fields=['tournament_payment'])


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0010_bookingpayment_confirmation_email_queued_at'),
        ('revenues', '0003_revenue_integrity_hardening'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='gymrevenue',
            name='gymrevenue_revenue_type_payment_constraint',
        ),
        migrations.RemoveConstraint(
            model_name='gymrevenue',
            name='gymrevenue_unique_tournament_payment',
        ),
        migrations.AddField(
            model_name='gymrevenue',
            name='tournament_payment_event',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='legacy_revenues', to='payments.tournamentpayment'),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name='gymrevenue',
            name='tournament_payment',
        ),
        migrations.RenameField(
            model_name='gymrevenue',
            old_name='tournament_payment_event',
            new_name='tournament_payment',
        ),
        migrations.AddConstraint(
            model_name='gymrevenue',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(revenue_type='booking', booking_payment__isnull=False, tournament_payment__isnull=True)
                    | models.Q(revenue_type='tournament', tournament_payment__isnull=False, booking_payment__isnull=True)
                ),
                name='gymrevenue_revenue_type_payment_constraint',
            ),
        ),
        migrations.AddConstraint(
            model_name='gymrevenue',
            constraint=models.UniqueConstraint(
                fields=('tournament_payment',),
                condition=models.Q(tournament_payment__isnull=False),
                name='gymrevenue_unique_tournament_payment',
            ),
        ),
    ]
