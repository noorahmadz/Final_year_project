from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0011_tournament_awards'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tournament',
            name='first_place_award',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AlterField(
            model_name='tournament',
            name='second_place_award',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AlterField(
            model_name='tournament',
            name='third_place_award',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AlterField(
            model_name='tournament',
            name='top_scorer_award',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
