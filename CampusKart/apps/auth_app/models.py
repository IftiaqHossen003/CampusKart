"""
Custom user model for CampusKart.
Extends AbstractBaseUser for full control over every field.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models import QuerySet
from django.utils import timezone


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

class CustomUserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, **extra_fields) -> "CustomUser":
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email)
        extra_fields.setdefault("is_active", True)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra_fields) -> "CustomUser":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_verified", True)
        extra_fields.setdefault("role", "admin")

        if not extra_fields["is_staff"]:
            raise ValueError("Superuser must have is_staff=True.")
        if not extra_fields["is_superuser"]:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)

    # Convenience queryset helpers
    def active(self) -> QuerySet["CustomUser"]:
        return self.filter(is_active=True)

    def students(self) -> QuerySet["CustomUser"]:
        return self.filter(role=CustomUser.Role.STUDENT)

    def vendors(self) -> QuerySet["CustomUser"]:
        return self.filter(role=CustomUser.Role.VENDOR)


# ---------------------------------------------------------------------------
# CustomUser
# ---------------------------------------------------------------------------

class CustomUser(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        VENDOR  = "vendor",  "Vendor"
        ADMIN   = "admin",   "Admin"

    # ── Core identity ────────────────────────────────────────────────────────
    email     = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=150, blank=True)
    phone     = models.CharField(max_length=20, blank=True)
    avatar    = models.ImageField(upload_to="avatars/%Y/%m/", null=True, blank=True)

    # ── Role / status ────────────────────────────────────────────────────────
    role        = models.CharField(
        max_length=10, choices=Role.choices, default=Role.STUDENT, db_index=True
    )
    is_active   = models.BooleanField(default=True, db_index=True)
    is_staff    = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)

    # ── Timestamps ───────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["full_name"]   # prompted by createsuperuser

    class Meta:
        db_table  = "users"
        ordering  = ["-created_at"]
        indexes   = [
            models.Index(fields=["email"],     name="idx_users_email"),
            models.Index(fields=["role"],      name="idx_users_role"),
            models.Index(fields=["is_active"], name="idx_users_is_active"),
            # composite index for the most common filter pattern
            models.Index(fields=["role", "is_active"], name="idx_users_role_active"),
        ]

    def __str__(self):
        return self.email

    @property
    def is_student(self) -> bool:
        return self.role == self.Role.STUDENT

    @property
    def is_vendor(self) -> bool:
        return self.role == self.Role.VENDOR

    def get_full_name(self) -> str:
        return self.full_name or self.email


# ---------------------------------------------------------------------------
# StudentProfile
# ---------------------------------------------------------------------------

class StudentProfile(models.Model):
    user            = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="student_profile"
    )
    student_id      = models.CharField(max_length=50, unique=True)
    department      = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "student_profiles"

    def __str__(self):
        return f"{self.user.email} — {self.student_id}"


# ---------------------------------------------------------------------------
# OTP
# ---------------------------------------------------------------------------

OTP_PURPOSES = (
    ("email_verify",    "Email Verification"),
    ("password_reset",  "Password Reset"),
)

OTP_EXPIRY_MINUTES = 10


def _otp_expiry():
    return timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES)


def _generate_otp_code() -> str:
    """Cryptographically-secure 6-digit numeric code."""
    return str(secrets.randbelow(900_000) + 100_000)


class OTP(models.Model):
    user       = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="otps")
    code       = models.CharField(max_length=6, default=_generate_otp_code)
    purpose    = models.CharField(max_length=20, choices=OTP_PURPOSES)
    is_used    = models.BooleanField(default=False)
    expires_at = models.DateTimeField(default=_otp_expiry)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "otps"
        indexes  = [
            models.Index(fields=["user", "purpose", "is_used"], name="idx_otps_lookup"),
        ]

    def __str__(self):
        return f"{self.user.email} — {self.purpose}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    def verify(self, code: str) -> bool:
        """Return True and mark as used if code matches and OTP is valid."""
        if self.is_used or self.is_expired:
            return False
        if not secrets.compare_digest(self.code, code):
            return False
        self.is_used = True
        self.save(update_fields=["is_used"])
        return True
