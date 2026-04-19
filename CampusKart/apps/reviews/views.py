from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.orders.models import Order
from apps.products.models import Product
from .models import Review
from .serializers import ProductReviewSerializer


def _review_stats_for_product(product_id: int) -> dict:
    aggregate = Review.objects.filter(product_id=product_id, is_approved=True).aggregate(
        average_rating=Avg("rating"),
        total_reviews=Count("id"),
    )

    star_buckets = {str(star): 0 for star in range(1, 6)}
    per_star = (
        Review.objects.filter(product_id=product_id, is_approved=True)
        .values("rating")
        .annotate(count=Count("id"))
    )
    for row in per_star:
        star_buckets[str(row["rating"])] = row["count"]

    average_rating = aggregate["average_rating"]
    return {
        "average_rating": float(average_rating) if average_rating is not None else 0.0,
        "total_reviews": aggregate["total_reviews"] or 0,
        "rating_counts": star_buckets,
    }


class ProductReviewListCreateView(generics.ListCreateAPIView):
    class ProductReviewPagination(PageNumberPagination):
        page_size = 5

    serializer_class = ProductReviewSerializer
    pagination_class = ProductReviewPagination

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_product(self):
        return get_object_or_404(Product, pk=self.kwargs["id"])

    def get_queryset(self):
        product = self.get_product()
        return Review.objects.select_related("user", "product", "order").filter(
            product=product,
            is_approved=True,
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["product"] = self.get_product()
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        stats = _review_stats_for_product(self.get_product().id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data["stats"] = stats
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data, "stats": stats})

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, product=self.get_product())


class LegacyProductReviewListView(generics.ListAPIView):
    serializer_class = ProductReviewSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        product_id = self.request.query_params.get("product")
        queryset = Review.objects.select_related("user", "product", "order").filter(is_approved=True)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset


class ProductReviewEligibilityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, id: int):
        product = get_object_or_404(Product, pk=id)

        delivered_orders = (
            Order.objects.filter(
                buyer=request.user,
                status=Order.Status.DELIVERED,
                items__product=product,
            )
            .exclude(reviews__user=request.user, reviews__product=product)
            .distinct()
            .order_by("-created_at")
        )

        eligible_orders = [
            {
                "id": order.id,
                "order_number": str(order.order_number),
                "created_at": order.created_at,
            }
            for order in delivered_orders
        ]

        return Response(
            {
                "can_review": bool(eligible_orders),
                "eligible_orders": eligible_orders,
            }
        )
