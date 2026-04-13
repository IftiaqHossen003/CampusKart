from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import logging

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.models import Cart, CartItem
from apps.notifications.models import Notification
from apps.products.models import Product
from apps.vendors.models import VendorProfile

from .events import emit_domain_event
from .models import DomainEvent, Order, OrderItem, VendorOrder
from .serializers import (
    CreateOrderSerializer,
    DomainEventBulkRetrySerializer,
    DomainEventRetrySerializer,
    DomainEventSerializer,
    OrderSerializer,
    OrderStatusUpdateSerializer,
)
from .throttles import DomainEventAdminListThrottle, DomainEventAdminRetryThrottle
from .tasks import process_domain_event

logger = logging.getLogger(__name__)


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _require_admin(user):
    if getattr(user, "role", "") != "admin":
        raise PermissionDenied("Only admin users can access domain event operations.")


def _base_orders_queryset():
    return Order.objects.select_related("buyer").prefetch_related(
        Prefetch(
            "vendor_orders",
            queryset=VendorOrder.objects.select_related("vendor", "vendor__user"),
        ),
        Prefetch(
            "items",
            queryset=OrderItem.objects.select_related("product", "product__vendor", "vendor_order"),
        )
    )


def _vendor_orders_queryset(user, *, scope: str = ""):
    vendor_profile = getattr(user, "vendor_profile", None)
    if vendor_profile is None:
        return Order.objects.none()

    if scope == "buyer":
        return _base_orders_queryset().filter(buyer=user)

    return _base_orders_queryset().filter(
        Q(vendor_orders__vendor=vendor_profile) | Q(items__product__vendor=vendor_profile)
    ).distinct()


class OrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return CreateOrderSerializer
        return OrderSerializer

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", "")
        scope = (self.request.query_params.get("scope") or "").strip().lower()

        if role == "admin":
            return _base_orders_queryset()

        if role == "vendor":
            return _vendor_orders_queryset(user, scope=scope)

        return _base_orders_queryset().filter(buyer=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order, replayed = self.perform_create(serializer)

        response_serializer = OrderSerializer(order, context={"request": request})
        headers = self.get_success_headers(response_serializer.data)
        response_status = status.HTTP_200_OK if replayed else status.HTTP_201_CREATED
        return Response(response_serializer.data, status=response_status, headers=headers)

    def _find_existing_order(self, request_id: str | None):
        if not request_id:
            return None

        return _base_orders_queryset().filter(
            buyer=self.request.user,
            checkout_request_id=request_id,
        ).first()

    def perform_create(self, serializer):
        request_id = serializer.validated_data.get("request_id")
        existing_order = self._find_existing_order(request_id)
        if existing_order is not None:
            return existing_order, True

        with transaction.atomic():
            existing_order = self._find_existing_order(request_id)
            if existing_order is not None:
                return existing_order, True

            cart = (
                Cart.objects.select_for_update()
                .filter(user=self.request.user)
                .prefetch_related(
                    Prefetch("items", queryset=CartItem.objects.select_related("product", "product__vendor"))
                )
                .first()
            )

            if cart is None:
                replayed_order = self._find_existing_order(request_id)
                if replayed_order is not None:
                    return replayed_order, True
                raise ValidationError({"detail": "Your cart is empty."})

            cart_items = list(cart.items.all())
            if not cart_items:
                replayed_order = self._find_existing_order(request_id)
                if replayed_order is not None:
                    return replayed_order, True
                raise ValidationError({"detail": "Your cart is empty."})

            product_ids = [item.product_id for item in cart_items]
            products_by_id = {
                product.id: product
                for product in Product.objects.select_for_update()
                .select_related("vendor")
                .filter(id__in=product_ids)
            }

            vendor_ids = {
                product.vendor_id
                for product in products_by_id.values()
                if product.vendor_id is not None
            }
            vendor_profiles_by_id = VendorProfile.objects.in_bulk(vendor_ids)

            order = Order.objects.create(
                buyer=self.request.user,
                checkout_request_id=request_id,
                delivery_address=serializer.validated_data["delivery_address"],
                payment_method=serializer.validated_data.get("payment_method", Order.PaymentMethod.COD),
                notes=serializer.validated_data.get("notes", ""),
            )

            total_amount = Decimal("0.00")
            order_items_by_vendor = defaultdict(list)
            vendor_subtotals = defaultdict(lambda: Decimal("0.00"))

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

                vendor_profile = vendor_profiles_by_id.get(product.vendor_id)
                if vendor_profile is None:
                    raise ValidationError(
                        {"detail": f"Product '{product.name}' has an invalid vendor mapping."}
                    )

                if vendor_profile.status != VendorProfile.Status.APPROVED:
                    raise ValidationError(
                        {"detail": f"Vendor for product '{product.name}' is not approved."}
                    )

                unit_price = _money(Decimal(str(product.effective_price)))
                line_total = _money(unit_price * cart_item.quantity)
                total_amount += line_total
                vendor_subtotals[vendor_profile.id] += line_total

                order_items_by_vendor[vendor_profile.id].append(
                    {
                        "product": product,
                        "quantity": cart_item.quantity,
                        "unit_price": unit_price,
                    }
                )

                product.stock -= cart_item.quantity
                product.total_sold += cart_item.quantity
                product.save(update_fields=["stock", "total_sold", "updated_at"])

            vendor_orders = {}
            for vendor_id, subtotal in vendor_subtotals.items():
                vendor_profile = vendor_profiles_by_id[vendor_id]
                commission_rate = _money(Decimal(str(vendor_profile.commission_rate)))
                commission_amount = _money(subtotal * commission_rate / Decimal("100"))
                net_vendor_amount = _money(subtotal - commission_amount)

                vendor_orders[vendor_id] = VendorOrder.objects.create(
                    order=order,
                    vendor=vendor_profile,
                    subtotal_amount=_money(subtotal),
                    commission_rate=commission_rate,
                    commission_amount=commission_amount,
                    net_vendor_amount=net_vendor_amount,
                )

            order_items = []
            for vendor_id, grouped_items in order_items_by_vendor.items():
                vendor_order = vendor_orders[vendor_id]
                for grouped_item in grouped_items:
                    order_items.append(
                        OrderItem(
                            order=order,
                            vendor_order=vendor_order,
                            product=grouped_item["product"],
                            quantity=grouped_item["quantity"],
                            unit_price=grouped_item["unit_price"],
                        )
                    )

            OrderItem.objects.bulk_create(order_items)

            order.total_amount = _money(total_amount)
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
                    "vendor_order_count": len(vendor_orders),
                    "payment_method": order.payment_method,
                },
            )

            emit_domain_event(
                event_type="OrderCreatedEvent",
                order=order,
                idempotency_key=f"order-created:{order.pk}",
                payload={
                    "order_id": order.pk,
                    "order_number": str(order.order_number),
                    "buyer_id": order.buyer_id,
                    "payment_method": order.payment_method,
                    "total_amount": str(order.total_amount),
                    "vendor_order_count": len(vendor_orders),
                },
            )

            for vendor_order in vendor_orders.values():
                emit_domain_event(
                    event_type="VendorOrderCreatedEvent",
                    order=order,
                    vendor_order=vendor_order,
                    idempotency_key=f"vendor-order-created:{vendor_order.pk}",
                    payload={
                        "order_id": order.pk,
                        "vendor_order_id": vendor_order.pk,
                        "vendor_id": vendor_order.vendor_id,
                        "subtotal_amount": str(vendor_order.subtotal_amount),
                        "net_vendor_amount": str(vendor_order.net_vendor_amount),
                    },
                )

            return order, False


class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", "")

        if role == "admin":
            return _base_orders_queryset()

        if role == "vendor":
            return _vendor_orders_queryset(user)

        return _base_orders_queryset().filter(buyer=user)


class VendorOrderListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", "")

        if role == "admin":
            return _base_orders_queryset()

        if role != "vendor":
            raise PermissionDenied("Only vendor users can access vendor orders.")

        return _vendor_orders_queryset(user)


class OrderStatusUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, id: int):
        order = get_object_or_404(
            Order.objects.prefetch_related("items__product__vendor", "vendor_orders__vendor"),
            pk=id,
        )

        if request.user.role == "admin":
            serializer = OrderStatusUpdateSerializer(
                data=request.data,
                context={"order": order},
            )
            serializer.is_valid(raise_exception=True)

            order.status = serializer.validated_data["status"]
            order.save(update_fields=["status", "updated_at"])
        elif request.user.role == "vendor":
            self._update_vendor_status(order=order, user=request.user, data=request.data)
            order.refresh_from_db()
        else:
            raise PermissionDenied("You do not have permission to update this order status.")

        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _update_vendor_status(*, order: Order, user, data):
        vendor_profile = getattr(user, "vendor_profile", None)
        if vendor_profile is None or vendor_profile.status != VendorProfile.Status.APPROVED:
            raise PermissionDenied("You do not have permission to update this order status.")

        vendor_order = order.vendor_orders.filter(vendor=vendor_profile).first()
        if vendor_order is not None:
            serializer = OrderStatusUpdateSerializer(
                data=data,
                context={"order": vendor_order},
            )
            serializer.is_valid(raise_exception=True)

            vendor_order.status = serializer.validated_data["status"]
            vendor_order.save(update_fields=["status", "updated_at"])

            OrderStatusUpdateView._sync_parent_status(order)
            return

        if not OrderStatusUpdateView._can_update_legacy_vendor_order_status(user, order):
            raise PermissionDenied("You do not have permission to update this order status.")

        serializer = OrderStatusUpdateSerializer(
            data=data,
            context={"order": order},
        )
        serializer.is_valid(raise_exception=True)

        order.status = serializer.validated_data["status"]
        order.save(update_fields=["status", "updated_at"])

    @staticmethod
    def _sync_parent_status(order: Order):
        statuses = list(order.vendor_orders.values_list("status", flat=True))
        if not statuses:
            return

        if all(status == Order.Status.DELIVERED for status in statuses):
            next_status = Order.Status.DELIVERED
        elif all(status == Order.Status.SHIPPED for status in statuses):
            next_status = Order.Status.SHIPPED
        elif all(status == Order.Status.CONFIRMED for status in statuses):
            next_status = Order.Status.CONFIRMED
        elif all(status == Order.Status.PENDING for status in statuses):
            next_status = Order.Status.PENDING
        elif all(status == Order.Status.CANCELLED for status in statuses):
            next_status = Order.Status.CANCELLED
        elif any(status in {Order.Status.SHIPPED, Order.Status.DELIVERED} for status in statuses):
            next_status = Order.Status.PARTIALLY_SHIPPED
        else:
            next_status = Order.Status.PENDING

        if order.status != next_status:
            order.status = next_status
            order.save(update_fields=["status", "updated_at"])

        if order.status == Order.Status.DELIVERED:
            from apps.payments.services import finalize_cod_on_parent_delivery

            finalize_cod_on_parent_delivery(order=order)

    @staticmethod
    def _can_update_legacy_vendor_order_status(user, order: Order) -> bool:
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


class DomainEventListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DomainEventSerializer
    throttle_classes = [DomainEventAdminListThrottle]

    def get_queryset(self):
        _require_admin(self.request.user)

        queryset = DomainEvent.objects.select_related("order", "vendor_order")

        status_filter = (self.request.query_params.get("status") or "").strip().lower()
        if status_filter in {
            DomainEvent.Status.PENDING,
            DomainEvent.Status.PROCESSED,
            DomainEvent.Status.FAILED,
        }:
            queryset = queryset.filter(status=status_filter)

        event_type_filter = (self.request.query_params.get("event_type") or "").strip()
        if event_type_filter:
            queryset = queryset.filter(event_type=event_type_filter)

        order_id_filter = (self.request.query_params.get("order_id") or "").strip()
        if order_id_filter.isdigit():
            queryset = queryset.filter(order_id=int(order_id_filter))

        ordering_param = (self.request.query_params.get("ordering") or "").strip()
        allowed_ordering_fields = {
            "created_at",
            "updated_at",
            "retry_count",
            "event_type",
            "status",
        }
        if ordering_param:
            normalized_field = ordering_param.lstrip("-")
            if normalized_field in allowed_ordering_fields:
                queryset = queryset.order_by(ordering_param)
            else:
                queryset = queryset.order_by("-created_at")
        else:
            queryset = queryset.order_by("-created_at")

        return queryset


class DomainEventSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DomainEventAdminListThrottle]

    def get(self, request):
        _require_admin(request.user)

        queryset = DomainEvent.objects.all()

        event_type_filter = (request.query_params.get("event_type") or "").strip()
        if event_type_filter:
            queryset = queryset.filter(event_type=event_type_filter)

        order_id_filter = (request.query_params.get("order_id") or "").strip()
        if order_id_filter.isdigit():
            queryset = queryset.filter(order_id=int(order_id_filter))

        aggregates = queryset.aggregate(
            total=Count("id"),
            pending=Count("id", filter=Q(status=DomainEvent.Status.PENDING)),
            processed=Count("id", filter=Q(status=DomainEvent.Status.PROCESSED)),
            failed=Count("id", filter=Q(status=DomainEvent.Status.FAILED)),
        )

        top_event_types = list(
            queryset.values("event_type")
            .annotate(count=Count("id"))
            .order_by("-count", "event_type")[:10]
        )

        return Response(
            {
                "total": aggregates["total"],
                "status_counts": {
                    "pending": aggregates["pending"],
                    "processed": aggregates["processed"],
                    "failed": aggregates["failed"],
                },
                "top_event_types": top_event_types,
            },
            status=status.HTTP_200_OK,
        )


class DomainEventRetryView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DomainEventAdminRetryThrottle]

    def post(self, request, id: int):
        _require_admin(request.user)

        event = get_object_or_404(DomainEvent, pk=id)
        serializer = DomainEventRetrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        force_reset = bool(serializer.validated_data.get("force_reset", True))

        if event.status == DomainEvent.Status.PROCESSED:
            return Response(
                {"detail": "Processed events cannot be retried."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if event.status == DomainEvent.Status.FAILED and not force_reset:
            return Response(
                {"detail": "Failed event requires force_reset=true for manual retry."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if force_reset:
            event.status = DomainEvent.Status.PENDING
            event.retry_count = 0
            event.error_message = ""
            event.processed_at = None
            event.save(update_fields=["status", "retry_count", "error_message", "processed_at", "updated_at"])

        process_domain_event.delay(event.id)
        logger.info(
            "domain_event_manual_retry_queued",
            extra={
                "actor_id": getattr(request.user, "id", None),
                "event_id": event.id,
                "event_type": event.event_type,
                "force_reset": force_reset,
            },
        )
        return Response(
            {
                "detail": "Domain event retry queued.",
                "event": DomainEventSerializer(event, context={"request": request}).data,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class DomainEventBulkRetryView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DomainEventAdminRetryThrottle]

    def post(self, request):
        _require_admin(request.user)

        serializer = DomainEventBulkRetrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        force_reset = bool(validated_data.get("force_reset", True))
        dry_run = bool(validated_data.get("dry_run", False))
        limit = int(validated_data.get("limit", 50))

        queryset = DomainEvent.objects.all()

        status_filter = validated_data.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        else:
            queryset = queryset.exclude(status=DomainEvent.Status.PROCESSED)

        event_type_filter = validated_data.get("event_type")
        if event_type_filter:
            queryset = queryset.filter(event_type=event_type_filter)

        order_id_filter = validated_data.get("order_id")
        if order_id_filter is not None:
            queryset = queryset.filter(order_id=order_id_filter)

        created_before = validated_data.get("created_before")
        if created_before is not None:
            queryset = queryset.filter(created_at__lte=created_before)

        logger.info(
            "domain_event_bulk_retry_requested",
            extra={
                "actor_id": getattr(request.user, "id", None),
                "status": status_filter,
                "event_type": event_type_filter,
                "order_id": order_id_filter,
                "created_before": created_before.isoformat() if created_before else None,
                "limit": limit,
                "force_reset": force_reset,
                "dry_run": dry_run,
            },
        )

        events = list(queryset.order_by("created_at", "id")[:limit])
        if not events:
            return Response(
                {
                    "detail": "No matching domain events found.",
                    "queued": 0,
                    "selected": 0,
                    "skipped_failed": 0,
                    "event_ids": [],
                },
                status=status.HTTP_200_OK,
            )

        selected_ids = [event.id for event in events]
        failed_ids = [event.id for event in events if event.status == DomainEvent.Status.FAILED]

        if force_reset:
            queued_ids = selected_ids
            skipped_failed = 0
            if not dry_run:
                DomainEvent.objects.filter(id__in=selected_ids).update(
                    status=DomainEvent.Status.PENDING,
                    retry_count=0,
                    error_message="",
                    processed_at=None,
                )
        else:
            queued_ids = [event.id for event in events if event.status == DomainEvent.Status.PENDING]
            skipped_failed = len(failed_ids)

        if not dry_run:
            for event_id in queued_ids:
                process_domain_event.delay(event_id)

        logger.info(
            "domain_event_bulk_retry_completed",
            extra={
                "actor_id": getattr(request.user, "id", None),
                "selected": len(selected_ids),
                "queued": len(queued_ids),
                "skipped_failed": skipped_failed,
                "dry_run": dry_run,
            },
        )

        return Response(
            {
                "detail": "Domain event bulk retry preview generated." if dry_run else "Domain event bulk retry queued.",
                "selected": len(selected_ids),
                "queued": len(queued_ids),
                "skipped_failed": skipped_failed,
                "event_ids": queued_ids,
                "dry_run": dry_run,
            },
            status=status.HTTP_200_OK if dry_run else status.HTTP_202_ACCEPTED,
        )
