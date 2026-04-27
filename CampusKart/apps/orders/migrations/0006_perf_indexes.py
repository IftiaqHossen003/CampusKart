from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("orders", "0005_domaineventadminaudit"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="order",
            index=models.Index(
                fields=["buyer", "created_at"],
                name="idx_order_buyer_created",
            ),
        ),
        migrations.AddIndex(
            model_name="orderitem",
            index=models.Index(
                fields=["order", "product"],
                name="idx_order_item_order_product",
            ),
        ),
    ]
