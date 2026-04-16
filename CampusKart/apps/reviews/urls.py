from django.urls import path
from .views import LegacyProductReviewListView

app_name = "reviews"

urlpatterns = [
    path("", LegacyProductReviewListView.as_view(), name="review-list-legacy"),
]
