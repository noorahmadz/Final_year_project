from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0007_team_approved_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='TeamMember',
            fields=[
                ('member_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('role', models.CharField(max_length=80)),
                ('order', models.PositiveSmallIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'team',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='members',
                        to='tournaments.team',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Team Member',
                'verbose_name_plural': 'Team Members',
                'db_table': 'team_members',
                'ordering': ['order', 'member_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='teammember',
            constraint=models.UniqueConstraint(
                fields=('team', 'order'),
                name='unique_team_member_order_per_team',
            ),
        ),
        migrations.AddConstraint(
            model_name='teammember',
            constraint=models.UniqueConstraint(
                fields=('team', 'name'),
                name='unique_team_member_name_per_team',
            ),
        ),
    ]
