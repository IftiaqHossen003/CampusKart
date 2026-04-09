from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.products.models import Product

from .models import Cart, CartItem
from .serializers import CartItemQuantitySerializer, CartReplaceSerializer, CartSerializer


def _cart_queryset():
    item_queryset = CartItem.objects.select_related("product").prefetch_related("product__images")
    return Cart.objects.prefetch_related(Prefetch("items", queryset=item_queryset))


def _get_or_create_cart(user):
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


def _serialize_cart(cart, request):
    cart = _cart_queryset().get(pk=cart.pk)
    return CartSerializer(cart, context={"request": request}).data


def _consolidate_items(items):
    consolidated = {}
    for item in items:
        product = item["product"]
        quantity = item["quantity"]

        if product.id in consolidated:
            consolidated[product.id]["quantity"] += quantity
        else:
            consolidated[product.id] = {"product": product, "quantity": quantity}

    return consolidated


def _validate_product_for_cart(product: Product, quantity: int) -> None:
    if product.status != Product.Status.APPROVED:
        raise ValidationError({"detail": f"Product '{product.name}' is not approved for purchase."})

    if product.stock <= 0:
        raise ValidationError({"detail": f"Product '{product.name}' is out of stock."})

    if quantity > product.stock:
        raise ValidationError({"detail": f"Insufficient stock for product '{product.name}'."})


def _replace_cart_items(cart: Cart, final_items: dict[int, dict]) -> None:
    cart.items.all().delete()

    if not final_items:
        return

    CartItem.objects.bulk_create(
        [
            CartItem(
                cart=cart,
                product=item_data["product"],
                quantity=item_data["quantity"],
            )
            for item_data in final_items.values()
        ]
    )


class CartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart = _get_or_create_cart(request.user)
        return Response(_serialize_cart(cart, request), status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CartReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        incoming_items = serializer.validated_data.get("items", [])
        merge = serializer.validated_data.get("merge", False)

        consolidated_incoming = _consolidate_items(incoming_items)

        with transaction.atomic():
            cart = _get_or_create_cart(request.user)

            final_items = {}
            if merge:
                existing_items = cart.items.select_related("product")
                for item in existing_items:
                    final_items[item.product_id] = {
                        "product": item.product,
                        "quantity": item.quantity,
                    }

            for product_id, payload in consolidated_incoming.items():
                if product_id in final_items:
                    final_items[product_id]["quantity"] += payload["quantity"]
                else:
                    final_items[product_id] = payload

            for payload in final_items.values():
                _validate_product_for_cart(payload["product"], payload["quantity"])

            _replace_cart_items(cart, final_items)

        return Response(_serialize_cart(cart, request), status=status.HTTP_200_OK)


class CartItemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, id: int):
        serializer = CartItemQuantitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        quantity = serializer.validated_data["quantity"]

        with transaction.atomic():
            cart = _get_or_create_cart(request.user)
            item = get_object_or_404(
                CartItem.objects.select_related("product"),
                pk=id,
                cart=cart,
            )

            _validate_product_for_cart(item.product, quantity)

            item.quantity = quantity
            item.save(update_fields=["quantity"])

        return Response(_serialize_cart(cart, request), status=status.HTTP_200_OK)

    def delete(self, request, id: int):
        with transaction.atomic():
            cart = _get_or_create_cart(request.user)
            item = get_object_or_404(CartItem, pk=id, cart=cart)
            item.delete()

        return Response(_serialize_cart(cart, request), status=status.HTTP_200_OK)


class CartClearView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        with transaction.atomic():
            cart = _get_or_create_cart(request.user)
            cart.items.all().delete()

        return Response(_serialize_cart(cart, request), status=status.HTTP_200_OK)
