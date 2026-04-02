from rest_framework import generics, permissions
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

    def get_object(self):
        return VendorProfile.objects.get(user=self.request.user)
