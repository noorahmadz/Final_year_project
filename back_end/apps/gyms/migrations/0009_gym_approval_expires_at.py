from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gyms', '0008_drop_duplicate_legacy_tables'),
    ]

    operations = [
        migrations.AddField(
            model_name='gym',
            name='approval_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
