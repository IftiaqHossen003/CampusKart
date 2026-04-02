from django.urls import path
from .views import PaymentListView, InitiatePaymentView, PaymentWebhookView

app_name = "payments"

urlpatterns = [
    path("",          PaymentListView.as_view(),    name="payment-list"),
    path("initiate/", InitiatePaymentView.as_view(), name="initiate"),
    path("webhook/",  PaymentWebhookView.as_view(),  name="webhook"),
]
