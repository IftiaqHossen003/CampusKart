from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from .models import OTP

logger = logging.getLogger(__name__)
User = get_user_model()


def _issue_otp(user, purpose: str) -> OTP:
    OTP.objects.filter(user=user, purpose=purpose, is_used=False).update(is_used=True)
    return OTP.objects.create(user=user, purpose=purpose)


def _send_otp_email(*, recipient: str, subject: str, code: str, action_label: str) -> None:
    send_mail(
        subject=subject,
        message=(
            f"Your CampusKart {action_label} code is: {code}\n\n"
            "This code expires in 10 minutes."
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[recipient],
        fail_silently=False,
    )


@shared_task(bind=True, max_retries=3)
def send_verification_email(self, user_id: int) -> None:
    user = User.objects.filter(pk=user_id).first()
    if user is None or not user.is_active or user.is_verified:
        return

    otp = _issue_otp(user, "email_verify")
    try:
        _send_otp_email(
            recipient=user.email,
            subject="CampusKart Email Verification Code",
            code=otp.code,
            action_label="email verification",
        )
    except Exception as exc:
        logger.exception("Failed sending verification email user_id=%s", user_id)
        raise self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3)
def send_password_reset_email(self, user_id: int) -> None:
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return

    otp = _issue_otp(user, "password_reset")
    try:
        _send_otp_email(
            recipient=user.email,
            subject="CampusKart Password Reset Code",
            code=otp.code,
            action_label="password reset",
        )
    except Exception as exc:
        logger.exception("Failed sending password reset email user_id=%s", user_id)
        raise self.retry(exc=exc, countdown=60)
