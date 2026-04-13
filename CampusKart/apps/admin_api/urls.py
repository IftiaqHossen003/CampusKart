from django.urls import path

from .views import (
    AdminAuditLogListView,
    AdminBannerDetailView,
    AdminBannerListCreateView,
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    AdminProductApproveView,
    AdminProductRejectView,
    AdminStatsView,
    AdminVendorApproveView,
    AdminVendorSuspendView,
)

app_name = "admin_api"

urlpatterns = [
    path("stats/", AdminStatsView.as_view(), name="stats"),
    path("vendors/<int:id>/approve/", AdminVendorApproveView.as_view(), name="vendor-approve"),
    path("vendors/<int:id>/suspend/", AdminVendorSuspendView.as_view(), name="vendor-suspend"),
    path("products/<slug:slug>/approve/", AdminProductApproveView.as_view(), name="product-approve"),
    path("products/<slug:slug>/reject/", AdminProductRejectView.as_view(), name="product-reject"),
    path("banners/", AdminBannerListCreateView.as_view(), name="banner-list-create"),
    path("banners/<int:pk>/", AdminBannerDetailView.as_view(), name="banner-detail"),
    path("categories/", AdminCategoryListCreateView.as_view(), name="category-list-create"),
    path("categories/<int:pk>/", AdminCategoryDetailView.as_view(), name="category-detail"),
    path("audit-logs/", AdminAuditLogListView.as_view(), name="audit-log-list"),
]
