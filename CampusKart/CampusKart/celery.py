"""
Celery application configuration for CampusKart.
"""

import os
from celery import Celery
from celery.utils.log import get_task_logger

# Set the default Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "CampusKart.settings.dev")

app = Celery("campuskart")

# Load config from Django settings, namespaced with CELERY_
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks from all installed apps
app.autodiscover_tasks()

logger = get_task_logger(__name__)


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    logger.info(f"Request: {self.request!r}")
