from django.urls import path

from .views import (
    AdminAuditLogListView,
    AdminBannerDetailView,
    AdminBannerListCreateView,
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    AdminProductQueueExportCsvView,
    AdminProductApproveView,
    AdminProductQueueListView,
    AdminProductRejectView,
    AdminRecentOrderListView,
    AdminRevenueTimeseriesView,
    AdminVendorQueueExportCsvView,
    AdminStatsView,
    AdminVendorQueueListView,
    AdminVendorApproveView,
    AdminVendorSuspendView,
)

app_name = "admin_api"

urlpatterns = [
    path("stats/", AdminStatsView.as_view(), name="stats"),
    path("stats/revenue-timeseries/", AdminRevenueTimeseriesView.as_view(), name="stats-revenue-timeseries"),
    path("orders/recent/", AdminRecentOrderListView.as_view(), name="orders-recent"),
    path("vendors/", AdminVendorQueueListView.as_view(), name="vendor-list"),
    path("vendors/export/", AdminVendorQueueExportCsvView.as_view(), name="vendor-export"),
    path("vendors/<int:id>/approve/", AdminVendorApproveView.as_view(), name="vendor-approve"),
    path("vendors/<int:id>/suspend/", AdminVendorSuspendView.as_view(), name="vendor-suspend"),
    path("products/", AdminProductQueueListView.as_view(), name="product-list"),
    path("products/export/", AdminProductQueueExportCsvView.as_view(), name="product-export"),
    path("products/<slug:slug>/approve/", AdminProductApproveView.as_view(), name="product-approve"),
    path("products/<slug:slug>/reject/", AdminProductRejectView.as_view(), name="product-reject"),
    path("banners/", AdminBannerListCreateView.as_view(), name="banner-list-create"),
    path("banners/<int:pk>/", AdminBannerDetailView.as_view(), name="banner-detail"),
    path("categories/", AdminCategoryListCreateView.as_view(), name="category-list-create"),
    path("categories/<int:pk>/", AdminCategoryDetailView.as_view(), name="category-detail"),
    path("audit-logs/", AdminAuditLogListView.as_view(), name="audit-log-list"),
]
