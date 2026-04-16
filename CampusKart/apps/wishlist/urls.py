from django.urls import path

from .views import WishlistView

app_name = "wishlist"

urlpatterns = [
    path("", WishlistView.as_view(), name="wishlist"),
]
