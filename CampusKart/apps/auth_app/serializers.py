"""
Serializers for auth_app.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from .models import StudentProfile, OTP

User = get_user_model()


# ---------------------------------------------------------------------------
# User / Profile
# ---------------------------------------------------------------------------

class StudentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StudentProfile
        fields = ["student_id", "university", "department", "id_document_url", "is_id_verified"]
        read_only_fields = ["is_id_verified"]


class CustomUserSerializer(serializers.ModelSerializer):
    student_profile = StudentProfileSerializer(read_only=True)

    class Meta:
        model  = User
        fields = [
            "id", "email", "full_name", "phone", "avatar",
            "role", "is_verified", "is_active", "created_at",
            "student_profile",
        ]
        read_only_fields = ["id", "email", "is_verified", "is_active", "created_at"]


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

class RegisterSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True, label="Confirm password")

    # Optional student profile fields — included only when role == student
    student_id  = serializers.CharField(write_only=True, required=False, allow_blank=True)
    university  = serializers.CharField(write_only=True, required=False, allow_blank=True)
    department  = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = User
        fields = [
            "email", "full_name", "phone", "role",
            "password", "password2",
            "student_id", "university", "department",
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})

        role = attrs.get("role", User.Role.STUDENT)
        if role == User.Role.STUDENT:
            if not attrs.get("student_id"):
                raise serializers.ValidationError(
                    {"student_id": "student_id is required for student accounts."}
                )
            if not attrs.get("university"):
                raise serializers.ValidationError(
                    {"university": "university is required for student accounts."}
                )
        return attrs

    def create(self, validated_data):
        student_id = validated_data.pop("student_id", None)
        university = validated_data.pop("university", "")
        department = validated_data.pop("department", "")

        user = User.objects.create_user(**validated_data)

        if user.role == User.Role.STUDENT and student_id:
            StudentProfile.objects.create(
                user=user,
                student_id=student_id,
                university=university,
                department=department,
            )
        return user


# ---------------------------------------------------------------------------
# Login (custom JWT claims)
# ---------------------------------------------------------------------------

class LoginSerializer(TokenObtainPairSerializer):
    """Adds email, role, full_name, and is_verified to the access token payload."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"]       = user.email
        token["role"]        = user.role
        token["full_name"]   = user.full_name
        token["is_verified"] = user.is_verified
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Append user data alongside tokens for convenience
        data["user"] = {
            "id":          self.user.pk,
            "email":       self.user.email,
            "full_name":   self.user.full_name,
            "role":        self.user.role,
            "is_verified": self.user.is_verified,
        }
        return data


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code  = serializers.CharField(max_length=6, min_length=6)

    def validate(self, attrs):
        try:
            user = User.objects.get(email=attrs["email"])
        except User.DoesNotExist:
            raise serializers.ValidationError({"email": "No account with this email."})

        if user.is_verified:
            raise serializers.ValidationError({"email": "Account is already verified."})

        otp = (
            OTP.objects.filter(
                user=user,
                purpose="email_verify",
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )

        if otp is None or otp.is_expired:
            raise serializers.ValidationError(
                {"code": "OTP has expired or does not exist. Please request a new one."}
            )

        if not otp.verify(attrs["code"]):
            raise serializers.ValidationError({"code": "Invalid OTP code."})

        attrs["user"] = user
        return attrs


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


# ---------------------------------------------------------------------------
# Re-export simplejwt refresh (makes import paths consistent in views)
# ---------------------------------------------------------------------------

__all__ = [
    "CustomUserSerializer",
    "StudentProfileSerializer",
    "RegisterSerializer",
    "LoginSerializer",
    "VerifyEmailSerializer",
    "ChangePasswordSerializer",
    "TokenRefreshSerializer",
]
