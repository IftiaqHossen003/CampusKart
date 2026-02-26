from django.urls import path
from .views import (
    CategoryListView,
    ProductListView,
    ProductDetailView,
    ProductCreateView,
    ProductUpdateDestroyView,
)

app_name = "products"

urlpatterns = [
    path("categories/",        CategoryListView.as_view(),        name="category-list"),
    path("",                   ProductListView.as_view(),         name="product-list"),
    path("create/",            ProductCreateView.as_view(),       name="product-create"),
    path("<slug:slug>/",       ProductDetailView.as_view(),       name="product-detail"),
    path("<int:pk>/manage/",   ProductUpdateDestroyView.as_view(),name="product-manage"),
]
