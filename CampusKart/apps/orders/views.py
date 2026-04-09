from rest_framework import generics
from .models import Order
from .serializers import OrderSerializer


class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        scope = (self.request.query_params.get("scope") or "").strip().lower()

        base_queryset = Order.objects.prefetch_related(
            "items",
            "items__product",
            "items__product__vendor",
        )

        if getattr(user, "role", None) == "admin":
            return base_queryset

        if getattr(user, "role", None) == "vendor":
            vendor_profile = getattr(user, "vendor_profile", None)
            if vendor_profile is None:
                return Order.objects.none()

            if scope == "buyer":
                return base_queryset.filter(buyer=user)

            return base_queryset.filter(items__product__vendor=vendor_profile).distinct()

        return base_queryset.filter(buyer=user)

    def perform_create(self, serializer):
        serializer.save(buyer=self.request.user)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        base_queryset = Order.objects.prefetch_related(
            "items",
            "items__product",
            "items__product__vendor",
        )

        if getattr(user, "role", None) == "admin":
            return base_queryset

        if getattr(user, "role", None) == "vendor":
            vendor_profile = getattr(user, "vendor_profile", None)
            if vendor_profile is None:
                return Order.objects.none()
            return base_queryset.filter(items__product__vendor=vendor_profile).distinct()

        return base_queryset.filter(buyer=user)
