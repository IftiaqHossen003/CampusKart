import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create a default superuser from environment variables for Docker startup."

    def handle(self, *args, **options):
        email = os.getenv("DJANGO_SUPERUSER_EMAIL")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")
        full_name = os.getenv("DJANGO_SUPERUSER_FULL_NAME", "CampusKart Admin")

        if not email or not password:
            self.stdout.write(
                self.style.WARNING(
                    "Skipping default superuser creation. "
                    "Set DJANGO_SUPERUSER_EMAIL and DJANGO_SUPERUSER_PASSWORD."
                )
            )
            return

        User = get_user_model()
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": full_name,
                "role": "admin",
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
                "is_verified": True,
            },
        )

        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
            self.stdout.write(self.style.SUCCESS(f"Created default superuser: {email}"))
            return

        updated_fields = []

        if not user.is_staff:
            user.is_staff = True
            updated_fields.append("is_staff")
        if not user.is_superuser:
            user.is_superuser = True
            updated_fields.append("is_superuser")
        if getattr(user, "role", None) != "admin":
            user.role = "admin"
            updated_fields.append("role")
        if hasattr(user, "is_verified") and not user.is_verified:
            user.is_verified = True
            updated_fields.append("is_verified")
        if not user.is_active:
            user.is_active = True
            updated_fields.append("is_active")
        if full_name and not user.full_name:
            user.full_name = full_name
            updated_fields.append("full_name")

        if updated_fields:
            user.save(update_fields=updated_fields)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Updated existing user as superuser: {email} ({', '.join(updated_fields)})"
                )
            )
            return

        self.stdout.write(self.style.SUCCESS(f"Default superuser already exists: {email}"))
