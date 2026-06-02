from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_rename_email_verif_email_7d3f4e_idx_email_verif_email_9d7c87_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailverificationotp',
            name='delivery_attempted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailverificationotp',
            name='delivery_error',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='emailverificationotp',
            name='delivery_failed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailverificationotp',
            name='delivery_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailverificationotp',
            name='delivery_status',
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
    ]
