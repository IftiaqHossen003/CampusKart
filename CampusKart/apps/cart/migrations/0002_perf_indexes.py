from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cart", "0001_initial"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="cart",
            index=models.Index(
                fields=["user"],
                name="idx_cart_user",
            ),
        ),
    ]
