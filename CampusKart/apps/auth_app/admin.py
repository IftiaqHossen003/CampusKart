from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html

from .models import CustomUser, StudentProfile, OTP


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------

class StudentProfileInline(admin.StackedInline):
    model       = StudentProfile
    can_delete  = False
    verbose_name_plural = "Student Profile"
    fields      = ["student_id", "university", "department", "id_document_url", "is_id_verified"]


# ---------------------------------------------------------------------------
# CustomUser admin
# ---------------------------------------------------------------------------

@admin.register(CustomUser)
class CustomUserAdmin(BaseUserAdmin):
    ordering     = ["-created_at"]
    list_display = [
        "email", "full_name", "role", "is_active", "is_verified", "is_staff", "created_at"
    ]
    list_filter  = ["role", "is_active", "is_verified", "is_staff"]
    search_fields = ["email", "full_name", "phone"]
    readonly_fields = ["created_at", "updated_at", "avatar_preview"]
    inlines      = [StudentProfileInline]

    fieldsets = (
        (None,            {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("full_name", "phone", "avatar", "avatar_preview")}),
        ("Permissions",   {"fields": (
            "role", "is_active", "is_staff", "is_superuser",
            "is_verified", "groups", "user_permissions",
        )}),
        ("Timestamps",    {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields":  ("email", "full_name", "role", "password1", "password2"),
        }),
    )

    @admin.display(description="Avatar")
    def avatar_preview(self, obj):
        if obj.avatar:
            return format_html('<img src="{}" width="60" height="60" />', obj.avatar.url)
        return "—"

    actions = ["verify_users", "deactivate_users"]

    @admin.action(description="Mark selected users as verified")
    def verify_users(self, request, queryset):
        updated = queryset.update(is_verified=True)
        self.message_user(request, f"{updated} user(s) marked as verified.")

    @admin.action(description="Deactivate selected users")
    def deactivate_users(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} user(s) deactivated.")


# ---------------------------------------------------------------------------
# StudentProfile admin
# ---------------------------------------------------------------------------

@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display   = ["user", "student_id", "university", "department", "is_id_verified"]
    list_filter    = ["is_id_verified", "university"]
    search_fields  = ["user__email", "student_id", "university"]
    list_editable  = ["is_id_verified"]
    readonly_fields = ["user"]


# ---------------------------------------------------------------------------
# OTP admin
# ---------------------------------------------------------------------------

@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display  = ["user", "purpose", "is_used", "is_expired_display", "expires_at", "created_at"]
    list_filter   = ["purpose", "is_used"]
    search_fields = ["user__email"]
    readonly_fields = ["code", "created_at"]

    @admin.display(boolean=True, description="Expired?")
    def is_expired_display(self, obj):
        return obj.is_expired
