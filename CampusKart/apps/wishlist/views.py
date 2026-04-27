from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WishlistItem
from .serializers import WishlistItemSerializer, WishlistToggleSerializer


class WishlistView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        queryset = (
            WishlistItem.objects.filter(user=request.user)
            .select_related("product", "product__vendor")
            .order_by("-added_at")
        )
        serializer = WishlistItemSerializer(queryset, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = WishlistToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_id = serializer.validated_data["product_id"]

        existing = WishlistItem.objects.filter(user=request.user, product_id=product_id).first()
        if existing is not None:
            existing.delete()
            return Response(
                {
                    "action": "removed",
                    "is_wishlisted": False,
                    "product_id": product_id,
                },
                status=status.HTTP_200_OK,
            )

        WishlistItem.objects.create(user=request.user, product_id=product_id)
        return Response(
            {
                "action": "added",
                "is_wishlisted": True,
                "product_id": product_id,
            },
            status=status.HTTP_200_OK,
        )
