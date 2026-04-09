from django.urls import path

from .views import CartClearView, CartItemCreateView, CartItemDetailView, CartView

app_name = "cart"

urlpatterns = [
    path("", CartView.as_view(), name="cart-detail"),
    path("items/", CartItemCreateView.as_view(), name="cart-item-create"),
    path("items/<int:id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
    path("clear/", CartClearView.as_view(), name="cart-clear"),
]
