from __future__ import annotations

import random
from decimal import Decimal
from itertools import cycle
from uuid import uuid4

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from apps.auth_app.models import CustomUser
from apps.orders.models import Order, OrderItem
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


class Command(BaseCommand):
    help = (
        "Seed 20 student-focused products for registered vendors and "
        "10 orders for registered student buyers."
    )

    PRODUCT_TARGET_DEFAULT = 20
    ORDER_TARGET_DEFAULT = 10

    PRODUCT_TEMPLATES = [
        {
            "name": "Engineering Graph Notebook",
            "category": "Study Essentials",
            "description": "A4 graph notebook for engineering math, circuits, and plotting labs.",
            "price_min": 120,
            "price_max": 220,
            "sku_prefix": "NOTE",
        },
        {
            "name": "Exam Prep Sticky Notes Set",
            "category": "Stationery",
            "description": "Color-coded sticky notes set for quick revision and topic marking.",
            "price_min": 80,
            "price_max": 150,
            "sku_prefix": "STKY",
        },
        {
            "name": "Scientific Calculator FX-991 Style",
            "category": "Study Essentials",
            "description": "Student scientific calculator suitable for campus exams and labs.",
            "price_min": 550,
            "price_max": 950,
            "sku_prefix": "CALC",
        },
        {
            "name": "Laptop Sleeve 15-inch",
            "category": "Tech Accessories",
            "description": "Padded anti-scratch sleeve for daily college commute.",
            "price_min": 450,
            "price_max": 900,
            "sku_prefix": "SLEV",
        },
        {
            "name": "USB-C Fast Charger 33W",
            "category": "Tech Accessories",
            "description": "Compact fast charger for student phones, tablets, and earbuds.",
            "price_min": 500,
            "price_max": 1200,
            "sku_prefix": "CHRG",
        },
        {
            "name": "Campus Backpack 25L",
            "category": "Campus Lifestyle",
            "description": "Multi-compartment backpack with laptop slot and water bottle holders.",
            "price_min": 900,
            "price_max": 1800,
            "sku_prefix": "BAGP",
        },
        {
            "name": "Whiteboard Marker Combo Pack",
            "category": "Stationery",
            "description": "Low-odor marker pack for study groups and classroom presentations.",
            "price_min": 110,
            "price_max": 220,
            "sku_prefix": "MRKR",
        },
        {
            "name": "Hostel Room Clip Lamp",
            "category": "Hostel Living",
            "description": "Adjustable clip lamp for late-night reading without disturbing roommates.",
            "price_min": 350,
            "price_max": 780,
            "sku_prefix": "LAMP",
        },
        {
            "name": "Noise-Isolating Wired Earphones",
            "category": "Tech Accessories",
            "description": "Budget earphones for online classes, calls, and study sessions.",
            "price_min": 250,
            "price_max": 650,
            "sku_prefix": "EARP",
        },
        {
            "name": "Campus Hoodie Unisex",
            "category": "Campus Lifestyle",
            "description": "Comfortable unisex hoodie ideal for winter lectures and library hours.",
            "price_min": 850,
            "price_max": 1700,
            "sku_prefix": "HOOD",
        },
        {
            "name": "Stainless Steel Water Bottle 1L",
            "category": "Hostel Living",
            "description": "Insulated bottle that keeps drinks cold through long class schedules.",
            "price_min": 300,
            "price_max": 700,
            "sku_prefix": "BOTL",
        },
        {
            "name": "Desk Organizer for Hostel Study Table",
            "category": "Hostel Living",
            "description": "Compact organizer for pens, cables, calculator, and sticky notes.",
            "price_min": 220,
            "price_max": 560,
            "sku_prefix": "ORGN",
        },
        {
            "name": "Portable Phone Stand",
            "category": "Tech Accessories",
            "description": "Foldable aluminum stand for attending classes and watching lectures.",
            "price_min": 180,
            "price_max": 420,
            "sku_prefix": "STND",
        },
        {
            "name": "Exam Highlighter Set",
            "category": "Stationery",
            "description": "Quick-dry highlighters to mark key concepts and formulas.",
            "price_min": 95,
            "price_max": 180,
            "sku_prefix": "HIGH",
        },
        {
            "name": "Power Bank 10000mAh",
            "category": "Tech Accessories",
            "description": "Reliable backup power for all-day campus schedules.",
            "price_min": 900,
            "price_max": 1900,
            "sku_prefix": "PWRB",
        },
        {
            "name": "A4 Assignment File Folder",
            "category": "Study Essentials",
            "description": "Durable assignment folder for semester submissions and notes.",
            "price_min": 90,
            "price_max": 190,
            "sku_prefix": "FOLD",
        },
        {
            "name": "Laptop Cleaning Kit",
            "category": "Tech Accessories",
            "description": "Microfiber and cleaning spray combo for laptop and tablet screens.",
            "price_min": 180,
            "price_max": 380,
            "sku_prefix": "CLNK",
        },
        {
            "name": "College ID Card Lanyard Pack",
            "category": "Campus Lifestyle",
            "description": "Printed lanyard pack with detachable buckle for student ID cards.",
            "price_min": 70,
            "price_max": 160,
            "sku_prefix": "LANY",
        },
        {
            "name": "Weekly Planner Pad",
            "category": "Study Essentials",
            "description": "Desk planner for assignment tracking and exam preparation.",
            "price_min": 120,
            "price_max": 260,
            "sku_prefix": "PLAN",
        },
        {
            "name": "Hostel Laundry Bag",
            "category": "Hostel Living",
            "description": "Foldable waterproof laundry bag for hostel and PG students.",
            "price_min": 180,
            "price_max": 420,
            "sku_prefix": "LNDR",
        },
        {
            "name": "Mini Table Fan USB",
            "category": "Hostel Living",
            "description": "Quiet USB fan suited for summer study sessions in hostel rooms.",
            "price_min": 380,
            "price_max": 780,
            "sku_prefix": "FANU",
        },
        {
            "name": "Pen Drive 64GB",
            "category": "Tech Accessories",
            "description": "Portable storage for presentations, projects, and lab submissions.",
            "price_min": 450,
            "price_max": 980,
            "sku_prefix": "PEND",
        },
        {
            "name": "Reusable Meal Container Set",
            "category": "Hostel Living",
            "description": "Leak-proof containers for meal prep and campus lunch breaks.",
            "price_min": 260,
            "price_max": 680,
            "sku_prefix": "MEAL",
        },
        {
            "name": "Mechanical Pencil + Lead Combo",
            "category": "Stationery",
            "description": "Exam-ready mechanical pencil combo with smooth HB lead refills.",
            "price_min": 140,
            "price_max": 320,
            "sku_prefix": "MECH",
        },
        {
            "name": "Timetable Pin Board",
            "category": "Study Essentials",
            "description": "Pin board for class timetable, reminders, and exam countdowns.",
            "price_min": 290,
            "price_max": 720,
            "sku_prefix": "BOARD",
        },
    ]

    DELIVERY_ADDRESS_TEMPLATES = [
        "Block A, Boys Hostel, Campus Main Gate",
        "Block C, Girls Hostel, Near Library",
        "Student Housing Wing 2, North Campus",
        "Department Building Pickup Desk",
        "Near Campus Cafeteria Parcel Counter",
    ]

    ORDER_NOTES = [
        "Please deliver after 5 PM classes.",
        "Call before delivery.",
        "Leave at hostel reception if unavailable.",
        "Urgent for upcoming internal exams.",
        "Package carefully, contains stationery items.",
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--products",
            type=int,
            default=self.PRODUCT_TARGET_DEFAULT,
            help="Number of products to seed (default: 20).",
        )
        parser.add_argument(
            "--orders",
            type=int,
            default=self.ORDER_TARGET_DEFAULT,
            help="Number of orders to seed (default: 10).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=20260409,
            help="Random seed for deterministic output.",
        )

    def handle(self, *args, **options):
        product_target = max(0, options["products"])
        order_target = max(0, options["orders"])
        rng = random.Random(options["seed"])

        vendors = list(
            VendorProfile.objects.select_related("user")
            .filter(
                user__role=CustomUser.Role.VENDOR,
                user__is_active=True,
            )
            .order_by("id")
        )
        if not vendors:
            raise CommandError(
                "No registered vendors found. Create vendor users and vendor profiles first."
            )

        student_buyers = list(
            CustomUser.objects.filter(
                role=CustomUser.Role.STUDENT,
                is_active=True,
            ).order_by("id")
        )
        if not student_buyers:
            raise CommandError(
                "No registered student buyers found. Create student users first."
            )

        self.stdout.write(
            self.style.NOTICE(
                f"Using {len(vendors)} vendor(s) and {len(student_buyers)} student buyer(s)."
            )
        )

        with transaction.atomic():
            categories = self._ensure_categories()
            seeded_products = self._seed_products(
                vendors=vendors,
                categories=categories,
                target_count=product_target,
                rng=rng,
            )

            if seeded_products and order_target > 0:
                seeded_orders = self._seed_orders(
                    students=student_buyers,
                    products=seeded_products,
                    target_count=order_target,
                    rng=rng,
                )
            else:
                seeded_orders = 0

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed completed: {len(seeded_products)} product(s), {seeded_orders} order(s)."
            )
        )

    def _ensure_categories(self) -> dict[str, Category]:
        category_rows = [
            ("Study Essentials", "study-essentials"),
            ("Stationery", "stationery"),
            ("Tech Accessories", "tech-accessories"),
            ("Hostel Living", "hostel-living"),
            ("Campus Lifestyle", "campus-lifestyle"),
        ]

        categories: dict[str, Category] = {}
        for name, slug in category_rows:
            category, _ = Category.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "is_active": True,
                },
            )
            categories[name] = category
        return categories

    def _seed_products(
        self,
        vendors: list[VendorProfile],
        categories: dict[str, Category],
        target_count: int,
        rng: random.Random,
    ) -> list[Product]:
        if target_count == 0:
            return []

        templates = self.PRODUCT_TEMPLATES[:]
        rng.shuffle(templates)
        vendor_cycle = cycle(vendors)
        created_products: list[Product] = []

        for idx in range(target_count):
            template = templates[idx % len(templates)]
            vendor = next(vendor_cycle)
            category = categories[template["category"]]

            base_name = template["name"]
            if idx >= len(templates):
                base_name = f"{base_name} #{idx + 1}"

            price = Decimal(rng.randint(template["price_min"], template["price_max"]))
            discount_price = None
            if rng.random() < 0.35:
                # Keep discount lower than price while staying in decimal precision.
                discount_price = (price * Decimal("0.90")).quantize(Decimal("0.01"))

            slug_base = slugify(f"{base_name}-{vendor.shop_name}")[:250]
            slug = self._next_unique_slug(slug_base)
            sku = self._next_unique_sku(template["sku_prefix"], rng)

            product = Product.objects.create(
                vendor=vendor,
                category=category,
                name=base_name,
                slug=slug,
                description=template["description"],
                sku=sku,
                price=price,
                discount_price=discount_price,
                stock=rng.randint(25, 120),
                status=Product.Status.APPROVED,
            )
            created_products.append(product)

        self.stdout.write(self.style.SUCCESS(f"Created {len(created_products)} products."))
        return created_products

    def _seed_orders(
        self,
        students: list[CustomUser],
        products: list[Product],
        target_count: int,
        rng: random.Random,
    ) -> int:
        if target_count == 0:
            return 0

        order_statuses = [
            Order.Status.PENDING,
            Order.Status.CONFIRMED,
            Order.Status.SHIPPED,
            Order.Status.DELIVERED,
        ]
        buyer_cycle = cycle(students)

        created_orders = 0
        for _ in range(target_count):
            buyer = next(buyer_cycle)
            delivery_address = rng.choice(self.DELIVERY_ADDRESS_TEMPLATES)
            order = Order.objects.create(
                buyer=buyer,
                status=rng.choice(order_statuses),
                delivery_address=delivery_address,
                notes=rng.choice(self.ORDER_NOTES),
            )

            k = min(len(products), rng.randint(1, 3))
            selected_products = rng.sample(products, k=k)

            total_amount = Decimal("0.00")
            items_created = 0

            for product in selected_products:
                if product.stock <= 0:
                    continue

                quantity = rng.randint(1, min(3, product.stock))
                unit_price = product.discount_price or product.price

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    unit_price=unit_price,
                )

                total_amount += unit_price * quantity
                product.stock -= quantity
                product.total_sold += quantity
                product.save(update_fields=["stock", "total_sold", "updated_at"])

                items_created += 1

            if items_created == 0:
                order.delete()
                continue

            order.total_amount = total_amount.quantize(Decimal("0.01"))
            order.save(update_fields=["total_amount", "updated_at"])
            created_orders += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created_orders} orders."))
        return created_orders

    def _next_unique_slug(self, base_slug: str) -> str:
        base_slug = base_slug or f"campuskart-product-{uuid4().hex[:8]}"
        slug = base_slug
        suffix = 1

        while Product.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{suffix}"
            suffix += 1

        return slug

    def _next_unique_sku(self, prefix: str, rng: random.Random) -> str:
        for _ in range(10):
            candidate = f"CK-{prefix}-{rng.randint(1000, 9999)}-{uuid4().hex[:4].upper()}"
            if not Product.objects.filter(sku=candidate).exists():
                return candidate

        return f"CK-{prefix}-{uuid4().hex[:12].upper()}"
