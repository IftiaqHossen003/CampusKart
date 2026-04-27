from django.urls import path
from .views import MyVendorProfileView, VendorDetailView, VendorListView, VendorSpotlightListView

app_name = "vendors"

urlpatterns = [
    path("",         VendorListView.as_view(),     name="vendor-list"),
    path("spotlight/",VendorSpotlightListView.as_view(), name="vendor-spotlight"),
    path("<int:pk>/",VendorDetailView.as_view(),   name="vendor-detail"),
    path("me/",      MyVendorProfileView.as_view(),name="my-profile"),
]
