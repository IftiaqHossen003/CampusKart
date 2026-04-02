"""
Celery tasks for auth_app.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,       # retry after 60 s
    autoretry_for=(Exception,),
    acks_late=True,
)
def send_verification_email(self, user_id: int) -> None:
    """
    Create a fresh OTP for email_verify and dispatch the verification email.

    Retries up to 3 times with exponential back-off on any exception.
    """
    from django.contrib.auth import get_user_model
    from .models import OTP

    User = get_user_model()

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.error("send_verification_email: user %s not found — skipping.", user_id)
        return  # don't retry for non-existent users

    # Invalidate any previous unused OTPs for this purpose
    OTP.objects.filter(user=user, purpose="email_verify", is_used=False).update(is_used=True)

    # Create a fresh OTP (code + expiry are set by model defaults)
    otp = OTP.objects.create(user=user, purpose="email_verify")

    subject = "Verify your CampusKart email address"

    # ------------------------------------------------------------------
    # Render both HTML and plain-text bodies.
    # Templates live at templates/emails/verify_email.html (and .txt).
    # Fall back to a plain inline message if the template doesn't exist.
    # ------------------------------------------------------------------
    context = {
        "user": user,
        "code": otp.code,
        "expiry_minutes": 10,
        "platform_name": "CampusKart",
    }

    try:
        html_body  = render_to_string("emails/verify_email.html", context)
        plain_body = strip_tags(html_body)
    except Exception:
        plain_body = (
            f"Hi {user.full_name or user.email},\n\n"
            f"Your CampusKart email verification code is: {otp.code}\n\n"
            f"This code expires in 10 minutes.\n\n"
            f"If you did not create this account, please ignore this email."
        )
        html_body = None

    try:
        send_mail(
            subject=subject,
            message=plain_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_body,
            fail_silently=False,
        )
        logger.info("Verification email sent to %s (OTP pk=%s)", user.email, otp.pk)
    except Exception as exc:
        logger.warning(
            "Failed to send verification email to %s: %s. Retrying…",
            user.email, exc
        )
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    acks_late=True,
)
def send_password_reset_email(self, user_id: int) -> None:
    """
    Create a password-reset OTP and email it to the user.
    """
    from django.contrib.auth import get_user_model
    from .models import OTP

    User = get_user_model()

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.error("send_password_reset_email: user %s not found — skipping.", user_id)
        return

    # Invalidate old reset OTPs
    OTP.objects.filter(user=user, purpose="password_reset", is_used=False).update(is_used=True)

    otp = OTP.objects.create(user=user, purpose="password_reset")

    subject = "Reset your CampusKart password"
    context = {
        "user": user,
        "code": otp.code,
        "expiry_minutes": 10,
        "platform_name": "CampusKart",
    }

    try:
        html_body  = render_to_string("emails/password_reset.html", context)
        plain_body = strip_tags(html_body)
    except Exception:
        plain_body = (
            f"Hi {user.full_name or user.email},\n\n"
            f"Your CampusKart password reset code is: {otp.code}\n\n"
            f"This code expires in 10 minutes.\n\n"
            f"If you did not request a password reset, please ignore this email."
        )
        html_body = None

    try:
        send_mail(
            subject=subject,
            message=plain_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_body,
            fail_silently=False,
        )
        logger.info("Password reset email sent to %s (OTP pk=%s)", user.email, otp.pk)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
