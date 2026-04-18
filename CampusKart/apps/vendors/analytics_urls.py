from django.urls import path

from .analytics_views import (
    VendorAnalyticsOverviewView,
    VendorAnalyticsPayoutsView,
    VendorAnalyticsProductsView,
    VendorAnalyticsRevenueView,
)

app_name = "vendor_analytics"

urlpatterns = [
    path("overview/", VendorAnalyticsOverviewView.as_view(), name="overview"),
    path("revenue/", VendorAnalyticsRevenueView.as_view(), name="revenue"),
    path("products/", VendorAnalyticsProductsView.as_view(), name="products"),
    path("payouts/", VendorAnalyticsPayoutsView.as_view(), name="payouts"),
]
