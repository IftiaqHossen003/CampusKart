from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.orders.models import Order, OrderItem, VendorOrder
from apps.payments.models import Payment, VendorPayout
from apps.products.models import Category, Product, ProductImage, ProductViewDaily
from apps.vendors.models import VendorProfile


def main():
    User = get_user_model()

    vendor_email = "vendor.analytics.demo@example.com"
    vendor_password = "Vendor@12345"

    vendor_user, _ = User.objects.get_or_create(
        email=vendor_email,
        defaults={
            "full_name": "Vendor Analytics Demo",
            "role": User.Role.VENDOR,
            "is_verified": True,
            "is_active": True,
        },
    )
    vendor_user.role = User.Role.VENDOR
    vendor_user.is_verified = True
    vendor_user.is_active = True
    vendor_user.set_password(vendor_password)
    vendor_user.save(update_fields=["role", "is_verified", "is_active", "password", "updated_at"])

    vendor_profile, _ = VendorProfile.objects.get_or_create(
        user=vendor_user,
        defaults={
            "shop_name": "Analytics Demo Shop",
            "status": VendorProfile.Status.APPROVED,
            "commission_rate": Decimal("10.00"),
        },
    )
    vendor_profile.status = VendorProfile.Status.APPROVED
    vendor_profile.commission_rate = Decimal("10.00")
    vendor_profile.save(update_fields=["status", "commission_rate", "updated_at"])

    buyer, _ = User.objects.get_or_create(
        email="analytics.demo.buyer@example.com",
        defaults={
            "full_name": "Analytics Demo Buyer",
            "role": User.Role.STUDENT,
            "is_verified": True,
            "is_active": True,
        },
    )
    buyer.role = User.Role.STUDENT
    buyer.is_verified = True
    buyer.is_active = True
    buyer.set_password("Buyer@12345")
    buyer.save(update_fields=["role", "is_verified", "is_active", "password", "updated_at"])

    category, _ = Category.objects.get_or_create(
        slug="analytics-demo-category",
        defaults={"name": "Analytics Demo Category", "is_active": True},
    )

    products = []
    product_specs = [
        ("Analytics Notebook", "analytics-notebook", Decimal("350.00"), 45, Decimal("4.60")),
        ("Campus Hoodie", "campus-hoodie", Decimal("900.00"), 20, Decimal("4.25")),
        ("Smart Lamp", "smart-lamp", Decimal("1200.00"), 12, Decimal("4.80")),
    ]

    for name, slug, price, stock, rating in product_specs:
        product, _ = Product.objects.get_or_create(
            slug=slug,
            defaults={
                "vendor": vendor_profile,
                "category": category,
                "name": name,
                "description": f"Demo product {name}",
                "price": price,
                "stock": stock,
                "status": Product.Status.APPROVED,
                "avg_rating": rating,
            },
        )
        product.vendor = vendor_profile
        product.category = category
        product.status = Product.Status.APPROVED
        product.avg_rating = rating
        product.save(update_fields=["vendor", "category", "status", "avg_rating", "updated_at"])

        ProductImage.objects.get_or_create(
            product=product,
            sort_order=0,
            defaults={
                "image_url": f"https://picsum.photos/seed/{slug}/320/320",
                "is_primary": True,
            },
        )

        products.append(product)

    now = timezone.now()
    this_month_start = now.replace(day=1, hour=10, minute=0, second=0, microsecond=0)
    last_month_date = (this_month_start - timedelta(days=1)).replace(day=16)

    order_specs = [
        # this month delivered
        (products[0], 3, Decimal("350.00"), Decimal("945.00"), VendorPayout.Status.PENDING, now - timedelta(days=2)),
        (products[1], 2, Decimal("900.00"), Decimal("1620.00"), VendorPayout.Status.PAID, now - timedelta(days=5)),
        # last month delivered
        (products[2], 1, Decimal("1200.00"), Decimal("1080.00"), VendorPayout.Status.PAID, last_month_date),
    ]

    for idx, (product, quantity, unit_price, net_amount, payout_status, created_at) in enumerate(order_specs, start=1):
        order = Order.objects.create(
            buyer=buyer,
            status=Order.Status.DELIVERED,
            payment_method=Order.PaymentMethod.COD,
            total_amount=unit_price * quantity,
            delivery_address=f"Demo Address {idx}",
        )

        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=vendor_profile,
            status=Order.Status.DELIVERED,
            subtotal_amount=unit_price * quantity,
            commission_rate=Decimal("10.00"),
            commission_amount=(unit_price * quantity) - net_amount,
            net_vendor_amount=net_amount,
        )

        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order,
            product=product,
            quantity=quantity,
            unit_price=unit_price,
        )

        VendorOrder.objects.filter(pk=vendor_order.pk).update(created_at=created_at)

        payment = Payment.objects.create(
            order=order,
            user=buyer,
            gateway=Payment.Gateway.COD,
            amount=unit_price * quantity,
            status=Payment.Status.SUCCESS,
        )

        VendorPayout.objects.create(
            payment=payment,
            vendor_order=vendor_order,
            vendor=vendor_profile,
            gross_amount=unit_price * quantity,
            commission_amount=(unit_price * quantity) - net_amount,
            net_amount=net_amount,
            status=payout_status,
        )

    # add one pending order so pending_orders card is non-zero
    pending_order = Order.objects.create(
        buyer=buyer,
        status=Order.Status.PENDING,
        payment_method=Order.PaymentMethod.COD,
        total_amount=Decimal("350.00"),
        delivery_address="Demo Pending Address",
    )
    VendorOrder.objects.create(
        order=pending_order,
        vendor=vendor_profile,
        status=Order.Status.PENDING,
        subtotal_amount=Decimal("350.00"),
        commission_rate=Decimal("10.00"),
        commission_amount=Decimal("35.00"),
        net_vendor_amount=Decimal("315.00"),
    )

    # seed product views for top-products table
    today = timezone.localdate()
    views_map = {
        products[0]: 140,
        products[1]: 85,
        products[2]: 63,
    }
    for product, view_count in views_map.items():
        record, _ = ProductViewDaily.objects.get_or_create(product=product, view_date=today)
        record.view_count = view_count
        record.save(update_fields=["view_count", "updated_at"])

    print("seeded_vendor_email=" + vendor_email)
    print("seeded_vendor_password=" + vendor_password)


if __name__ == "__main__":
    main()
