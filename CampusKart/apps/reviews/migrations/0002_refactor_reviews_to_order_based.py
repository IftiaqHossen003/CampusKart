from django.db import migrations, models
import django.db.models.deletion


def reset_reviews_data(apps, schema_editor):
    Review = apps.get_model("reviews", "Review")
    Review.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0005_domaineventadminaudit"),
        ("reviews", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(reset_reviews_data, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="review",
            name="review_must_target_product_or_vendor",
        ),
        migrations.RenameField(
            model_name="review",
            old_name="reviewer",
            new_name="user",
        ),
        migrations.RenameField(
            model_name="review",
            old_name="body",
            new_name="comment",
        ),
        migrations.RemoveField(
            model_name="review",
            name="vendor",
        ),
        migrations.RemoveField(
            model_name="review",
            name="title",
        ),
        migrations.RemoveField(
            model_name="review",
            name="is_verified_purchase",
        ),
        migrations.AddField(
            model_name="review",
            name="is_approved",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="review",
            name="order",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reviews",
                to="orders.order",
            ),
        ),
        migrations.AlterField(
            model_name="review",
            name="product",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reviews", to="products.product"),
        ),
        migrations.AlterField(
            model_name="review",
            name="order",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reviews", to="orders.order"),
        ),
        migrations.AddConstraint(
            model_name="review",
            constraint=models.UniqueConstraint(fields=("user", "product", "order"), name="uniq_review_user_product_order"),
        ),
    ]
