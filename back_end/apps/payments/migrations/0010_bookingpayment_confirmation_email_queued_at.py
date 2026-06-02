from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0009_remove_owneronlinepayment'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookingpayment',
            name='confirmation_email_queued_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
