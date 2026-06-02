from datetime import timedelta

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_verified',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='EmailVerificationOTP',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('otp_hash', models.CharField(max_length=128)),
                ('expires_at', models.DateTimeField()),
                ('attempts_count', models.PositiveSmallIntegerField(default=0)),
                ('max_attempts', models.PositiveSmallIntegerField(default=5)),
                ('is_used', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='email_verification_otps', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'email_verification_otps',
            },
        ),
        migrations.AddIndex(
            model_name='emailverificationotp',
            index=models.Index(fields=['email', 'created_at'], name='email_verif_email_7d3f4e_idx'),
        ),
        migrations.AddIndex(
            model_name='emailverificationotp',
            index=models.Index(fields=['user', 'created_at'], name='email_verif_user_id_72ce2f_idx'),
        ),
    ]
