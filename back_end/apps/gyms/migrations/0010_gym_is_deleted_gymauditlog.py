from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('gyms', '0009_gym_approval_expires_at'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='gym',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='GymAuditLog',
            fields=[
                ('log_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('action', models.CharField(max_length=100)),
                ('target_type', models.CharField(choices=[('gym', 'Gym'), ('field', 'Field'), ('discount', 'Discount')], max_length=20)),
                ('target_id', models.BigIntegerField(blank=True, null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='gym_audit_logs', to=settings.AUTH_USER_MODEL)),
                ('gym', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='gyms.gym')),
            ],
            options={
                'verbose_name': 'Gym Audit Log',
                'verbose_name_plural': 'Gym Audit Logs',
                'db_table': 'gym_audit_logs',
                'ordering': ['-created_at'],
            },
        ),
    ]
