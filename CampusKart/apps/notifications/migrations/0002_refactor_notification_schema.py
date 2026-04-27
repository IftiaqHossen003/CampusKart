from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="notification",
            old_name="recipient",
            new_name="user",
        ),
        migrations.RenameField(
            model_name="notification",
            old_name="notification_type",
            new_name="type",
        ),
        migrations.RenameField(
            model_name="notification",
            old_name="body",
            new_name="message",
        ),
        migrations.RemoveField(
            model_name="notification",
            name="data",
        ),
        migrations.AddField(
            model_name="notification",
            name="link",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("order", "Order Update"),
                    ("payment", "Payment"),
                    ("product", "Product Update"),
                    ("system", "System"),
                ],
                max_length=20,
            ),
        ),
    ]
