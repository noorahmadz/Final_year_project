from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0010_booking_status_expired'),
    ]

    operations = [
        migrations.CreateModel(
            name='BookingLifecycleMonitor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monitor_key', models.CharField(default='booking_lifecycle', max_length=50, unique=True)),
                ('last_trigger', models.CharField(blank=True, default='', max_length=100)),
                ('last_started_at', models.DateTimeField(blank=True, null=True)),
                ('last_completed_at', models.DateTimeField(blank=True, null=True)),
                ('last_success_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True, default='')),
                ('last_expired_count', models.PositiveIntegerField(default=0)),
                ('last_completed_count', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'booking_lifecycle_monitor',
                'verbose_name': 'Booking Lifecycle Monitor',
                'verbose_name_plural': 'Booking Lifecycle Monitor',
            },
        ),
    ]
