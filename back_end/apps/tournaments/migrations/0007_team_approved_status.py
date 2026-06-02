from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0006_group_stage_tournament_format'),
    ]

    operations = [
        migrations.AlterField(
            model_name='team',
            name='status',
            field=models.CharField(choices=[('registered', 'Registered'), ('pending_owner_approval', 'Pending Owner Approval'), ('approved', 'Approved'), ('confirmed', 'Confirmed'), ('eliminated', 'Eliminated'), ('rejected', 'Rejected')], default='registered', max_length=30),
        ),
    ]
