from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0008_tournamentpayment_purpose_metadata"),
    ]

    operations = [
        migrations.DeleteModel(
            name="OwnerOnlinePayment",
        ),
    ]
