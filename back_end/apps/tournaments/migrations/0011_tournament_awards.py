from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0010_matchplayerstat'),
    ]

    operations = [
        migrations.AddField(
            model_name='tournament',
            name='first_place_award',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='tournament',
            name='second_place_award',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='tournament',
            name='third_place_award',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='tournament',
            name='top_scorer_award',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
