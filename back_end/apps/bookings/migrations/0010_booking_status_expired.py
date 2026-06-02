from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0009_booking_interval_datetimes_and_postgres_exclusion'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('confirmed', 'Confirmed'),
                    ('cancelled', 'Cancelled'),
                    ('expired', 'Expired'),
                    ('completed', 'Completed'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
    ]
