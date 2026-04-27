from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from CampusKart.pagination import DefaultPageNumberPagination
from .models import VendorProfile
from .serializers import VendorProfileSerializer, VendorSpotlightSerializer
from apps.admin_api.services import write_admin_audit_log


class VendorListView(generics.ListAPIView):
    serializer_class = VendorProfileSerializer
    permission_classes = [permissions.AllowAny]
    search_fields = ["shop_name", "description", "address"]
    ordering_fields = ["created_at", "total_earnings"]

    def get_queryset(self):
        return VendorProfile.objects.filter(status=VendorProfile.Status.APPROVED).select_related("user", "approved_by")


class VendorDetailView(generics.RetrieveAPIView):
    serializer_class = VendorProfileSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return VendorProfile.objects.filter(status=VendorProfile.Status.APPROVED).select_related("user", "approved_by")


class VendorSpotlightPagination(DefaultPageNumberPagination):
    page_size = 3
    page_size_query_param = "limit"
    max_page_size = 12


class VendorSpotlightListView(generics.ListAPIView):
    serializer_class = VendorSpotlightSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = VendorSpotlightPagination

    def get_queryset(self):
        return VendorProfile.objects.filter(status=VendorProfile.Status.APPROVED).select_related(
            "user", "approved_by"
        ).order_by(
            "-total_earnings", "-created_at", "id"
        )


class MyVendorProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = VendorProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        user = self.request.user

        if getattr(user, "role", None) != "vendor":
            raise PermissionDenied("Only vendor accounts can access this endpoint.")

        vendor_profile, _ = VendorProfile.objects.get_or_create(
            user=user,
            defaults={
                "shop_name": user.full_name or f"Vendor {user.id}",
                "shop_slug": f"vendor-{user.id}",
                "contact_email": user.email,
            },
        )
        return VendorProfile.objects.select_related("user", "approved_by").get(pk=vendor_profile.pk)

    def perform_update(self, serializer):
        instance = self.get_object()
        before = VendorProfileSerializer(instance=instance, context={"request": self.request}).data
        updated_instance = serializer.save()
        after = VendorProfileSerializer(instance=updated_instance, context={"request": self.request}).data

        write_admin_audit_log(
            actor=self.request.user,
            action="vendor_profile_updated",
            resource_type="vendor_profile",
            resource_id=str(updated_instance.pk),
            request_method=self.request.method,
            request_path=self.request.path,
            before=before,
            after=after,
            metadata={
                "updated_fields": sorted(list(serializer.validated_data.keys())),
            },
        )
