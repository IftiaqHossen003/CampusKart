from django.urls import path
from .views import OrderListCreateView, OrderDetailView, OrderStatusUpdateView, VendorOrderListView

app_name = "orders"

urlpatterns = [
    path("",         OrderListCreateView.as_view(), name="order-list-create"),
    path("vendor/",  VendorOrderListView.as_view(), name="order-vendor-list"),
    path("<int:pk>/",OrderDetailView.as_view(),     name="order-detail"),
    path("<int:id>/status/", OrderStatusUpdateView.as_view(), name="order-status-update"),
]
