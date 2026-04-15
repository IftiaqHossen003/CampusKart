from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from .models import VendorProfile
from .serializers import VendorProfileSerializer
from apps.admin_api.services import write_admin_audit_log


class VendorListView(generics.ListAPIView):
    queryset = VendorProfile.objects.filter(status="approved")
    serializer_class = VendorProfileSerializer
    permission_classes = [permissions.AllowAny]
    search_fields = ["shop_name", "description", "address"]
    ordering_fields = ["created_at", "total_earnings"]


class VendorDetailView(generics.RetrieveAPIView):
    queryset = VendorProfile.objects.filter(status="approved")
    serializer_class = VendorProfileSerializer
    permission_classes = [permissions.AllowAny]


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
        return vendor_profile

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
