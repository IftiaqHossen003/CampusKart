from django.apps import AppConfig


class AdminApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.admin_api"
    verbose_name = "Admin API"

    def ready(self):
        import apps.admin_api.signals  # noqa: F401
