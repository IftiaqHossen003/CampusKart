from django.urls import path
from .views import (
    DomainEventBulkRetryView,
    DomainEventListView,
    DomainEventRetryView,
    DomainEventSummaryView,
    OrderDetailView,
    OrderListCreateView,
    OrderStatusUpdateView,
    VendorOrderListView,
)

app_name = "orders"

urlpatterns = [
    path("",         OrderListCreateView.as_view(), name="order-list-create"),
    path("vendor/",  VendorOrderListView.as_view(), name="vendor-order-list"),
    path("domain-events/", DomainEventListView.as_view(), name="domain-event-list"),
    path("domain-events/summary/", DomainEventSummaryView.as_view(), name="domain-event-summary"),
    path("domain-events/retry/", DomainEventBulkRetryView.as_view(), name="domain-event-bulk-retry"),
    path("domain-events/<int:id>/retry/", DomainEventRetryView.as_view(), name="domain-event-retry"),
    path("<int:pk>/",OrderDetailView.as_view(),     name="order-detail"),
    path("<int:id>/status/", OrderStatusUpdateView.as_view(), name="order-status-update"),
]
