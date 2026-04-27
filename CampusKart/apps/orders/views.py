from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.models import Cart, CartItem
from apps.notifications.models import Notification
from apps.products.models import Product
from apps.vendors.models import VendorProfile

from .models import Order, OrderItem
from .serializers import (
    CreateOrderSerializer,
    OrderSerializer,
    OrderStatusUpdateSerializer,
)


class OrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return CreateOrderSerializer
        return OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(buyer=self.request.user).prefetch_related("items")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = self.perform_create(serializer)

        response_serializer = OrderSerializer(order, context={"request": request})
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        with transaction.atomic():
            cart = (
                Cart.objects.select_for_update()
                .filter(user=self.request.user)
                .prefetch_related(
                    Prefetch("items", queryset=CartItem.objects.select_related("product"))
                )
                .first()
            )

            if cart is None:
                raise ValidationError({"detail": "Your cart is empty."})

            cart_items = list(cart.items.all())
            if not cart_items:
                raise ValidationError({"detail": "Your cart is empty."})

            product_ids = [item.product_id for item in cart_items]
            products_by_id = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            order = Order.objects.create(
                buyer=self.request.user,
                delivery_address=serializer.validated_data["delivery_address"],
                notes=serializer.validated_data.get("notes", ""),
            )

            total_amount = Decimal("0.00")
            order_items = []

            for cart_item in cart_items:
                product = products_by_id.get(cart_item.product_id)
                if product is None:
                    raise ValidationError(
                        {"detail": "One or more products in your cart are no longer available."}
                    )

                if product.status != Product.Status.APPROVED:
                    raise ValidationError(
                        {"detail": f"Product '{product.name}' is not approved for purchase."}
                    )

                if cart_item.quantity > product.stock:
                    raise ValidationError(
                        {"detail": f"Insufficient stock for product '{product.name}'."}
                    )

                unit_price = product.effective_price
                line_total = unit_price * cart_item.quantity
                total_amount += line_total

                order_items.append(
                    OrderItem(
                        order=order,
                        product=product,
                        quantity=cart_item.quantity,
                        unit_price=unit_price,
                    )
                )

                product.stock -= cart_item.quantity
                product.total_sold += cart_item.quantity
                product.save(update_fields=["stock", "total_sold", "updated_at"])

            OrderItem.objects.bulk_create(order_items)

            order.total_amount = total_amount
            order.save(update_fields=["total_amount", "updated_at"])

            cart.items.all().delete()

            Notification.objects.create(
                recipient=self.request.user,
                notification_type=Notification.Type.ORDER,
                title="Order placed",
                body=(
                    f"Your order {order.order_number} has been placed successfully."
                ),
                data={
                    "event": "order_placed",
                    "order_id": order.id,
                    "order_number": str(order.order_number),
                },
            )

            return order


class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(buyer=self.request.user)


class OrderStatusUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, id: int):
        order = get_object_or_404(
            Order.objects.prefetch_related("items__product__vendor"),
            pk=id,
        )

        if not self._can_update_status(request.user, order):
            raise PermissionDenied("You do not have permission to update this order status.")

        serializer = OrderStatusUpdateSerializer(
            data=request.data,
            context={"order": order},
        )
        serializer.is_valid(raise_exception=True)

        order.status = serializer.validated_data["status"]
        order.save(update_fields=["status", "updated_at"])

        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _can_update_status(user, order: Order) -> bool:
        if user.role == "admin":
            return True

        if user.role != "vendor":
            return False

        vendor_profile = getattr(user, "vendor_profile", None)
        if vendor_profile is None or vendor_profile.status != VendorProfile.Status.APPROVED:
            return False

        vendor_ids = set(
            order.items.exclude(product__isnull=True)
            .values_list("product__vendor_id", flat=True)
            .distinct()
        )

        if not vendor_ids:
            return False

        # Mixed-vendor orders are admin-only for status transitions.
        if len(vendor_ids) > 1:
            return False

        return vendor_ids == {vendor_profile.id}
