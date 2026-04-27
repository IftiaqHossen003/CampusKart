from django.urls import path
from .views import OrderListCreateView, OrderDetailView, OrderStatusUpdateView

app_name = "orders"

urlpatterns = [
    path("",         OrderListCreateView.as_view(), name="order-list-create"),
    path("<int:pk>/",OrderDetailView.as_view(),     name="order-detail"),
    path("<int:id>/status/", OrderStatusUpdateView.as_view(), name="order-status-update"),
]
