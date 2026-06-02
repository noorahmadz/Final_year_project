from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0010_bookingpayment_confirmation_email_queued_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookingpayment',
            name='confirmation_email_delivery_status',
            field=models.CharField(
                choices=[
                    ('not_attempted', 'Not attempted'),
                    ('sent', 'Sent'),
                    ('failed', 'Failed'),
                ],
                default='not_attempted',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='bookingpayment',
            name='confirmation_email_last_error',
            field=models.TextField(blank=True, default=''),
        ),
    ]
