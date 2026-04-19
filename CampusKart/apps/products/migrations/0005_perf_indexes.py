from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("products", "0004_productviewdaily"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="product",
            index=models.Index(
                fields=["status", "created_at"],
                name="idx_product_status_created",
            ),
        ),
    ]
