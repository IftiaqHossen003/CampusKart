from django.urls import include, path
from rest_framework.routers import DefaultRouter
from apps.reviews.views import ProductReviewEligibilityView, ProductReviewListCreateView

from .views import (
    CategoryViewSet,
    ProductImageDeleteView,
    ProductImageUploadView,
    ProductViewSet,
)

app_name = "products"

router = DefaultRouter()
# Register categories first so the prefix isn't matched as a product slug
router.register("categories", CategoryViewSet, basename="category")
router.register("", ProductViewSet, basename="product")

urlpatterns = [
    path("<int:id>/reviews/", ProductReviewListCreateView.as_view(), name="product-reviews"),
    path("<int:id>/review-eligibility/", ProductReviewEligibilityView.as_view(), name="product-review-eligibility"),
    path("<int:id>/images/", ProductImageUploadView.as_view(), name="product-image-upload"),
    path(
        "<int:id>/images/<int:image_id>/",
        ProductImageDeleteView.as_view(),
        name="product-image-delete",
    ),
    path("", include(router.urls)),
]
