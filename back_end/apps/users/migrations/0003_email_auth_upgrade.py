from django.db import migrations, models


def normalize_existing_emails(apps, schema_editor):
    User = apps.get_model('users', 'User')
    seen_emails = set()

    for user in User.objects.all().order_by('user_id').only('user_id', 'email'):
        normalized_email = (user.email or '').strip().lower()
        if not normalized_email:
            normalized_email = f'user{user.user_id}@local.invalid'

        if normalized_email in seen_emails:
            local_part, _, domain = normalized_email.partition('@')
            local_part = local_part or f'user{user.user_id}'
            domain = domain or 'local.invalid'
            normalized_email = f'{local_part}+{user.user_id}@{domain}'

        if user.email != normalized_email:
            user.email = normalized_email
            user.save(update_fields=['email'])

        seen_emails.add(normalized_email)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_is_verified_emailverificationotp'),
    ]

    operations = [
        migrations.RunPython(normalize_existing_emails, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.EmailField(max_length=254, unique=True),
        ),
    ]
