from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Payment
from .serializers import PaymentSerializer, InitiatePaymentSerializer


class PaymentListView(generics.ListAPIView):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)


class InitiatePaymentView(APIView):
    """POST /api/v1/payments/initiate/ — create payment record & call gateway."""

    def post(self, request):
        serializer = InitiatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # TODO: integrate Razorpay / Stripe SDK here
        return Response({"detail": "Payment initiated."}, status=status.HTTP_201_CREATED)


class PaymentWebhookView(APIView):
    """POST /api/v1/payments/webhook/ — receive gateway callbacks."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # TODO: verify signature and update Payment status
        return Response({"detail": "Webhook received."})
