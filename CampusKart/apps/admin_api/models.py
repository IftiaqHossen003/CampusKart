from django.conf import settings
from django.db import models


class Banner(models.Model):
    title = models.CharField(max_length=255)
    image_url = models.URLField(max_length=500)
    link = models.URLField(max_length=500, blank=True)
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "admin_banners"
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return f"{self.position}:{self.title}"


class AdminAuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="admin_audit_logs",
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=80)
    resource_type = models.CharField(max_length=60)
    resource_id = models.CharField(max_length=100, blank=True)
    request_method = models.CharField(max_length=10, blank=True)
    request_path = models.CharField(max_length=255, blank=True)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "admin_audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action", "created_at"], name="idx_ad_audit_action_created"),
            models.Index(
                fields=["resource_type", "resource_id", "created_at"],
                name="idx_ad_audit_resource_created",
            ),
            models.Index(fields=["actor", "created_at"], name="idx_ad_audit_actor_created"),
        ]

    def __str__(self) -> str:
        return f"{self.action}:{self.resource_type}:{self.resource_id or '-'}"
