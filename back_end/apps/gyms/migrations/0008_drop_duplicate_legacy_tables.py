from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('gyms', '0007_gymimage'),
    ]

    operations = [
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS gyms_timeslot;',
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS gyms_gymimage;',
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS gyms_field;',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]