from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0009_match_top_player'),
    ]

    operations = [
        migrations.CreateModel(
            name='MatchPlayerStat',
            fields=[
                ('stat_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('goals', models.PositiveSmallIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'match',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='player_stats',
                        to='tournaments.match',
                    ),
                ),
                (
                    'player',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='match_stats',
                        to='tournaments.teammember',
                    ),
                ),
                (
                    'team',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='player_match_stats',
                        to='tournaments.team',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Match Player Stat',
                'verbose_name_plural': 'Match Player Stats',
                'db_table': 'match_player_stats',
                'ordering': ['match_id', 'team_id', 'player__order', 'stat_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='matchplayerstat',
            constraint=models.UniqueConstraint(
                fields=('match', 'player'),
                name='unique_match_player_stat',
            ),
        ),
        migrations.AddConstraint(
            model_name='matchplayerstat',
            constraint=models.CheckConstraint(
                check=models.Q(('goals__gt', 0)),
                name='match_player_stat_goals_positive',
            ),
        ),
    ]
