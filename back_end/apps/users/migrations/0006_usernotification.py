from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_emailverificationotp_delivery_tracking'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserNotification',
            fields=[
                ('notification_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('notification_type', models.CharField(choices=[('tournament_team_approved', 'Tournament team approved'), ('tournament_team_rejected', 'Tournament team rejected')], max_length=64)),
                ('message', models.TextField()),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='notifications', to='users.user')),
            ],
            options={
                'db_table': 'user_notifications',
                'verbose_name': 'User Notification',
                'verbose_name_plural': 'User Notifications',
                'ordering': ['-created_at', '-notification_id'],
            },
        ),
    ]
