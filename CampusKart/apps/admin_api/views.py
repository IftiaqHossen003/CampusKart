from datetime import timedelta
from decimal import Decimal

from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auth_app.permissions import IsAdmin
from apps.payments.models import Payment
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile

from .models import AdminAuditLog, Banner
from .serializers import (
    AdminAuditLogSerializer,
    AdminBannerSerializer,
    AdminCategorySerializer,
    AdminProductModerationSerializer,
    AdminRevenuePointSerializer,
    AdminRevenueTimeseriesQuerySerializer,
    AdminStatsQuerySerializer,
    AdminStatsSerializer,
    AdminVendorQueueSerializer,
    AdminVendorModerationSerializer,
)
from .services import get_cached_admin_stats, write_admin_audit_log


class AdminStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        query_serializer = AdminStatsQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)

        from_date = query_serializer.validated_data.get("from_date")
        to_date = query_serializer.validated_data.get("to_date")

        stats = get_cached_admin_stats(from_date=from_date, to_date=to_date)
        return Response(AdminStatsSerializer(instance=stats).data, status=status.HTTP_200_OK)


class AdminRevenueTimeseriesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        query_serializer = AdminRevenueTimeseriesQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)

        days = query_serializer.validated_data.get("days", 30)
        today = timezone.now().date()
        start_date = today - timedelta(days=days - 1)

        revenue_by_day = (
            Payment.objects.filter(
                status=Payment.Status.SUCCESS,
                created_at__date__gte=start_date,
                created_at__date__lte=today,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(
                collected_revenue=Coalesce(
                    Sum("amount"),
                    Value(Decimal("0.00"), output_field=DecimalField(max_digits=14, decimal_places=2)),
                )
            )
            .order_by("day")
        )

        revenue_map = {row["day"]: row["collected_revenue"] for row in revenue_by_day}
        points = []

        for offset in range(days):
            day = start_date + timedelta(days=offset)
            points.append(
                {
                    "date": day,
                    "collected_revenue": revenue_map.get(day, Decimal("0.00")),
                }
            )

        return Response(AdminRevenuePointSerializer(points, many=True).data, status=status.HTTP_200_OK)


class AdminVendorQueueListView(generics.ListAPIView):
    serializer_class = AdminVendorQueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        queryset = VendorProfile.objects.select_related("user", "approved_by").all()

        status_param = (self.request.query_params.get("status") or "").strip().lower()
        valid_statuses = {
            VendorProfile.Status.PENDING,
            VendorProfile.Status.APPROVED,
            VendorProfile.Status.SUSPENDED,
        }
        if status_param in valid_statuses:
            queryset = queryset.filter(status=status_param)

        search = (self.request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(shop_name__icontains=search)
                | Q(user__full_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(contact_email__icontains=search)
            )

        return queryset.order_by("-created_at")


class AdminVendorApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, id: int):
        serializer = AdminVendorModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor = get_object_or_404(VendorProfile, pk=id)
        before = {
            "status": vendor.status,
            "approved_by": vendor.approved_by_id,
            "approved_at": vendor.approved_at.isoformat() if vendor.approved_at else None,
        }

        vendor.status = VendorProfile.Status.APPROVED
        vendor.approved_by = request.user
        vendor.approved_at = timezone.now()
        vendor.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        after = {
            "status": vendor.status,
            "approved_by": vendor.approved_by_id,
            "approved_at": vendor.approved_at.isoformat() if vendor.approved_at else None,
        }
        write_admin_audit_log(
            actor=request.user,
            action="vendor_approved",
            resource_type="vendor_profile",
            resource_id=str(vendor.pk),
            request_method=request.method,
            request_path=request.path,
            before=before,
            after=after,
            metadata=serializer.validated_data,
        )

        return Response(
            {
                "id": vendor.pk,
                "status": vendor.status,
                "approved_by": vendor.approved_by_id,
                "approved_at": vendor.approved_at,
            },
            status=status.HTTP_200_OK,
        )


class AdminVendorSuspendView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, id: int):
        serializer = AdminVendorModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vendor = get_object_or_404(VendorProfile, pk=id)
        before = {
            "status": vendor.status,
            "approved_by": vendor.approved_by_id,
            "approved_at": vendor.approved_at.isoformat() if vendor.approved_at else None,
        }

        vendor.status = VendorProfile.Status.SUSPENDED
        vendor.approved_by = request.user
        vendor.approved_at = timezone.now()
        vendor.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        after = {
            "status": vendor.status,
            "approved_by": vendor.approved_by_id,
            "approved_at": vendor.approved_at.isoformat() if vendor.approved_at else None,
        }
        write_admin_audit_log(
            actor=request.user,
            action="vendor_suspended",
            resource_type="vendor_profile",
            resource_id=str(vendor.pk),
            request_method=request.method,
            request_path=request.path,
            before=before,
            after=after,
            metadata=serializer.validated_data,
        )

        return Response(
            {
                "id": vendor.pk,
                "status": vendor.status,
                "approved_by": vendor.approved_by_id,
                "approved_at": vendor.approved_at,
            },
            status=status.HTTP_200_OK,
        )


class AdminProductApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, slug: str):
        serializer = AdminProductModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = get_object_or_404(Product, slug=slug)
        before = {
            "status": product.status,
            "approved_by": product.approved_by_id,
            "approved_at": product.approved_at.isoformat() if product.approved_at else None,
        }

        product.status = Product.Status.APPROVED
        product.approved_by = request.user
        product.approved_at = timezone.now()
        product.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        after = {
            "status": product.status,
            "approved_by": product.approved_by_id,
            "approved_at": product.approved_at.isoformat() if product.approved_at else None,
        }
        write_admin_audit_log(
            actor=request.user,
            action="product_approved",
            resource_type="product",
            resource_id=str(product.pk),
            request_method=request.method,
            request_path=request.path,
            before=before,
            after=after,
            metadata=serializer.validated_data,
        )

        return Response(
            {
                "id": product.pk,
                "slug": product.slug,
                "status": product.status,
                "approved_by": product.approved_by_id,
                "approved_at": product.approved_at,
            },
            status=status.HTTP_200_OK,
        )


class AdminProductRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, slug: str):
        serializer = AdminProductModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = get_object_or_404(Product, slug=slug)
        before = {
            "status": product.status,
            "approved_by": product.approved_by_id,
            "approved_at": product.approved_at.isoformat() if product.approved_at else None,
        }

        product.status = Product.Status.REJECTED
        product.approved_by = request.user
        product.approved_at = timezone.now()
        product.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

        after = {
            "status": product.status,
            "approved_by": product.approved_by_id,
            "approved_at": product.approved_at.isoformat() if product.approved_at else None,
        }
        write_admin_audit_log(
            actor=request.user,
            action="product_rejected",
            resource_type="product",
            resource_id=str(product.pk),
            request_method=request.method,
            request_path=request.path,
            before=before,
            after=after,
            metadata=serializer.validated_data,
        )

        return Response(
            {
                "id": product.pk,
                "slug": product.slug,
                "status": product.status,
                "approved_by": product.approved_by_id,
                "approved_at": product.approved_at,
            },
            status=status.HTTP_200_OK,
        )


class AdminBannerListCreateView(generics.ListCreateAPIView):
    serializer_class = AdminBannerSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = Banner.objects.all().order_by("position", "id")

    def perform_create(self, serializer):
        instance = serializer.save()
        write_admin_audit_log(
            actor=self.request.user,
            action="banner_created",
            resource_type="banner",
            resource_id=str(instance.pk),
            request_method=self.request.method,
            request_path=self.request.path,
            after=AdminBannerSerializer(instance=instance).data,
        )


class AdminBannerDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminBannerSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = Banner.objects.all()

    def perform_update(self, serializer):
        before = AdminBannerSerializer(instance=self.get_object()).data
        instance = serializer.save()
        write_admin_audit_log(
            actor=self.request.user,
            action="banner_updated",
            resource_type="banner",
            resource_id=str(instance.pk),
            request_method=self.request.method,
            request_path=self.request.path,
            before=before,
            after=AdminBannerSerializer(instance=instance).data,
        )

    def perform_destroy(self, instance):
        before = AdminBannerSerializer(instance=instance).data
        resource_id = str(instance.pk)
        super().perform_destroy(instance)
        write_admin_audit_log(
            actor=self.request.user,
            action="banner_deleted",
            resource_type="banner",
            resource_id=resource_id,
            request_method=self.request.method,
            request_path=self.request.path,
            before=before,
        )


class AdminCategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = AdminCategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = Category.objects.all().order_by("name")

    def perform_create(self, serializer):
        instance = serializer.save()
        write_admin_audit_log(
            actor=self.request.user,
            action="category_created",
            resource_type="category",
            resource_id=str(instance.pk),
            request_method=self.request.method,
            request_path=self.request.path,
            after=AdminCategorySerializer(instance=instance).data,
        )


class AdminCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminCategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = Category.objects.all()

    def perform_update(self, serializer):
        before = AdminCategorySerializer(instance=self.get_object()).data
        instance = serializer.save()
        write_admin_audit_log(
            actor=self.request.user,
            action="category_updated",
            resource_type="category",
            resource_id=str(instance.pk),
            request_method=self.request.method,
            request_path=self.request.path,
            before=before,
            after=AdminCategorySerializer(instance=instance).data,
        )

    def perform_destroy(self, instance):
        before = AdminCategorySerializer(instance=instance).data
        resource_id = str(instance.pk)
        super().perform_destroy(instance)
        write_admin_audit_log(
            actor=self.request.user,
            action="category_deleted",
            resource_type="category",
            resource_id=resource_id,
            request_method=self.request.method,
            request_path=self.request.path,
            before=before,
        )


class AdminAuditLogListView(generics.ListAPIView):
    serializer_class = AdminAuditLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        queryset = AdminAuditLog.objects.select_related("actor").all()

        action = (self.request.query_params.get("action") or "").strip()
        if action:
            queryset = queryset.filter(action=action)

        resource_type = (self.request.query_params.get("resource_type") or "").strip()
        if resource_type:
            queryset = queryset.filter(resource_type=resource_type)

        actor_id = (self.request.query_params.get("actor_id") or "").strip()
        if actor_id.isdigit():
            queryset = queryset.filter(actor_id=int(actor_id))

        return queryset.order_by("-created_at")
