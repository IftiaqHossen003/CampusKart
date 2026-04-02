from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from .models import VendorProfile
from .serializers import VendorProfileSerializer


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
