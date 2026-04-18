from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auth_app.permissions import IsVendor

from .analytics_serializers import (
    VendorOverviewSerializer,
    VendorPayoutAnalyticsResponseSerializer,
    VendorProductAnalyticsSerializer,
    VendorRevenuePointSerializer,
    VendorRevenueQuerySerializer,
)
from .analytics_services import (
    get_vendor_overview,
    get_vendor_payouts_analytics,
    get_vendor_products_analytics,
    get_vendor_revenue_series,
)


class VendorAnalyticsOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        payload = get_vendor_overview(request.user.vendor_profile)
        serializer = VendorOverviewSerializer(payload)
        return Response(serializer.data)


class VendorAnalyticsRevenueView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        query_serializer = VendorRevenueQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        period = query_serializer.validated_data["period"]

        payload = get_vendor_revenue_series(request.user.vendor_profile, period)
        serializer = VendorRevenuePointSerializer(payload, many=True)
        return Response(serializer.data)


class VendorAnalyticsProductsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        payload = get_vendor_products_analytics(request.user.vendor_profile)
        serializer = VendorProductAnalyticsSerializer(payload, many=True)
        return Response(serializer.data)


class VendorAnalyticsPayoutsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        payload = get_vendor_payouts_analytics(request.user.vendor_profile)
        serializer = VendorPayoutAnalyticsResponseSerializer(payload)
        return Response(serializer.data)
