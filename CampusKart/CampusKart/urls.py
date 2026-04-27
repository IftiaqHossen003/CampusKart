"""
URL configuration for CampusKart project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path

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
    path(API_V1 + "cart/",          include("apps.cart.urls",         namespace="cart")),
    path("api/products/",            include(("apps.products.urls", "products_public"), namespace="products_public")),
    path("api/categories/",          CategoryViewSet.as_view({"get": "list"}), name="categories-public-list"),
    path("api/categories/<int:pk>/", CategoryViewSet.as_view({"get": "retrieve"}), name="categories-public-detail"),
    path(API_V1 + "orders/",        include("apps.orders.urls",       namespace="orders")),
    path(API_V1 + "payments/",      include("apps.payments.urls",     namespace="payments")),
    path(API_V1 + "chat/",          include("apps.chat.urls",         namespace="chat")),
    path(API_V1 + "notifications/", include("apps.notifications.urls",namespace="notifications")),
    path(API_V1 + "reviews/",       include("apps.reviews.urls",      namespace="reviews")),
]
