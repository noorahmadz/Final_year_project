from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0008_teammember'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='top_player',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='top_player_matches',
                to='tournaments.teammember',
            ),
        ),
        migrations.AddField(
            model_name='match',
            name='top_player_goals',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
