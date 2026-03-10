from rest_framework import generics, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]


class ProductListView(generics.ListAPIView):
    queryset = Product.objects.filter(status=Product.Status.APPROVED).select_related("vendor", "category").prefetch_related("images", "tags")
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "status", "vendor"]
    search_fields = ["name", "description"]
    ordering_fields = ["price", "total_sold", "avg_rating", "created_at"]


class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.filter(status=Product.Status.APPROVED)
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"


class ProductCreateView(generics.CreateAPIView):
    serializer_class = ProductSerializer

    def perform_create(self, serializer):
        serializer.save(vendor=self.request.user.vendor_profile)


class ProductUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        return Product.objects.filter(vendor=self.request.user.vendor_profile)
