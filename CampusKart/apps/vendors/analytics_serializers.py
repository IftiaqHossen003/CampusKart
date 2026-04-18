from rest_framework import serializers


class VendorTopProductSerializer(serializers.Serializer):
    name = serializers.CharField()
    total_sold = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)


class VendorOverviewSerializer(serializers.Serializer):
    total_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    this_month_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    last_month_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_orders = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    total_products = serializers.IntegerField()
    approved_products = serializers.IntegerField()
    pending_products = serializers.IntegerField()
    top_product = VendorTopProductSerializer(allow_null=True)
    avg_rating = serializers.DecimalField(max_digits=4, decimal_places=2)


class VendorRevenueQuerySerializer(serializers.Serializer):
    period = serializers.ChoiceField(
        choices=("7d", "30d", "90d", "1y"),
        default="30d",
    )


class VendorRevenuePointSerializer(serializers.Serializer):
    date = serializers.DateField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    orders = serializers.IntegerField()


class VendorProductAnalyticsSerializer(serializers.Serializer):
    name = serializers.CharField()
    views = serializers.IntegerField()
    sold = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    rating = serializers.DecimalField(max_digits=4, decimal_places=2)


class VendorPayoutAnalyticsItemSerializer(serializers.Serializer):
    order_number = serializers.CharField()
    gross = serializers.DecimalField(max_digits=14, decimal_places=2)
    commission = serializers.DecimalField(max_digits=14, decimal_places=2)
    net = serializers.DecimalField(max_digits=14, decimal_places=2)
    status = serializers.CharField()
    date = serializers.DateTimeField()


class VendorPayoutAnalyticsResponseSerializer(serializers.Serializer):
    payouts = VendorPayoutAnalyticsItemSerializer(many=True)
    total_pending_payout_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
