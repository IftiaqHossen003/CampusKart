"""
URL configuration for CampusKart project.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)
from apps.products.views import CategoryViewSet

API_V1 = "api/v1/"

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),

    # OpenAPI schema & docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    # Application routes
    path(API_V1 + "auth/",          include("apps.auth_app.urls",     namespace="auth")),
    path(API_V1 + "vendors/",       include("apps.vendors.urls",      namespace="vendors")),
    path(API_V1 + "products/",      include("apps.products.urls",     namespace="products")),
    path("api/products/",            include(("apps.products.urls", "products_public"), namespace="products_public")),
    path("api/categories/",          CategoryViewSet.as_view({"get": "list"}), name="categories-public-list"),
    path("api/categories/<int:pk>/", CategoryViewSet.as_view({"get": "retrieve"}), name="categories-public-detail"),
    path(API_V1 + "orders/",        include("apps.orders.urls",       namespace="orders")),
    path(API_V1 + "payments/",      include("apps.payments.urls",     namespace="payments")),
    path(API_V1 + "chat/",          include("apps.chat.urls",         namespace="chat")),
    path(API_V1 + "notifications/", include("apps.notifications.urls",namespace="notifications")),
    path(API_V1 + "reviews/",       include("apps.reviews.urls",      namespace="reviews")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

    import debug_toolbar  # noqa: E402
    urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns
