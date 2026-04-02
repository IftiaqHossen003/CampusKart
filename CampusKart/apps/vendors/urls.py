from django.urls import path
from .views import VendorListView, VendorDetailView, MyVendorProfileView

app_name = "vendors"

urlpatterns = [
    path("",         VendorListView.as_view(),     name="vendor-list"),
    path("<int:pk>/",VendorDetailView.as_view(),   name="vendor-detail"),
    path("me/",      MyVendorProfileView.as_view(),name="my-profile"),
]
