from django.db import migrations, models


def deduplicate_fields_per_gym(apps, schema_editor):
    Field = apps.get_model('gyms', 'Field')
    TimeSlot = apps.get_model('gyms', 'TimeSlot')
    Booking = apps.get_model('bookings', 'Booking')
    Match = apps.get_model('tournaments', 'Match')

    gym_ids = (
        Field.objects.order_by()
        .values_list('gym_id', flat=True)
        .distinct()
    )

    for gym_id in gym_ids:
        field_ids = list(
            Field.objects.filter(gym_id=gym_id)
            .order_by('field_id')
            .values_list('field_id', flat=True)
        )
        if len(field_ids) <= 1:
            continue

        keeper_id = field_ids[0]
        duplicate_ids = field_ids[1:]

        TimeSlot.objects.filter(field_id__in=duplicate_ids).update(field_id=keeper_id)

        for duplicate_id in duplicate_ids:
            duplicate_bookings = Booking.objects.filter(field_id=duplicate_id).order_by('booking_id')
            for booking in duplicate_bookings:
                has_active_conflict = (
                    booking.status in ('pending', 'confirmed')
                    and Booking.objects.filter(
                        field_id=keeper_id,
                        booking_date=booking.booking_date,
                        start_time=booking.start_time,
                        end_time=booking.end_time,
                        status__in=['pending', 'confirmed'],
                    ).exists()
                )
                if has_active_conflict:
                    booking.delete()
                else:
                    Booking.objects.filter(pk=booking.pk).update(field_id=keeper_id)

            duplicate_matches = Match.objects.filter(field_id=duplicate_id).order_by('match_id')
            for match in duplicate_matches:
                has_match_conflict = Match.objects.filter(
                    field_id=keeper_id,
                    match_date=match.match_date,
                    start_time=match.start_time,
                ).exists()
                if has_match_conflict:
                    match.delete()
                else:
                    Match.objects.filter(pk=match.pk).update(field_id=keeper_id)

            Field.objects.filter(field_id=duplicate_id).delete()


class Migration(migrations.Migration):

    atomic = False

    dependencies = [
        ('gyms', '0012_unique_review_per_user_per_gym'),
    ]

    operations = [
        migrations.RunPython(deduplicate_fields_per_gym, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='field',
            constraint=models.UniqueConstraint(fields=('gym',), name='unique_gym_single_court'),
        ),
    ]
