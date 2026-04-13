from django.urls import path
from .views import (
    InitiatePaymentView,
    PaymentListView,
    PaymentReturnView,
    PaymentWebhookView,
    VendorPayoutListView,
    VendorPayoutMarkPaidView,
)

app_name = "payments"

urlpatterns = [
    path("",          PaymentListView.as_view(),    name="payment-list"),
    path("initiate/", InitiatePaymentView.as_view(), name="initiate"),
    path("return/success/", PaymentReturnView.as_view(result_hint="success"), name="return-success"),
    path("return/fail/", PaymentReturnView.as_view(result_hint="failed"), name="return-fail"),
    path("return/cancel/", PaymentReturnView.as_view(result_hint="cancelled"), name="return-cancel"),
    path("webhook/",  PaymentWebhookView.as_view(),  name="webhook"),
    path("payouts/",  VendorPayoutListView.as_view(), name="vendor-payout-list"),
    path("payouts/<int:id>/mark-paid/", VendorPayoutMarkPaidView.as_view(), name="vendor-payout-mark-paid"),
]
