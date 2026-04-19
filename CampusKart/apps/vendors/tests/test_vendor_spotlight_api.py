from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.vendors.models import VendorProfile


class VendorSpotlightApiTests(APITestCase):
    def _create_vendor(self, *, email, shop_name, status_value, earnings):
        user_model = get_user_model()
        user = user_model.objects.create_user(
            email=email,
            password="StrongPass123!",
            full_name=shop_name,
            role="vendor",
            is_verified=True,
        )
        return VendorProfile.objects.create(
            user=user,
            shop_name=shop_name,
            status=status_value,
            total_earnings=Decimal(str(earnings)),
        )

    def test_spotlight_returns_top_approved_vendors_with_default_limit(self):
        top_1 = self._create_vendor(
            email="top1@example.com",
            shop_name="Top One",
            status_value=VendorProfile.Status.APPROVED,
            earnings="900.00",
        )
        top_2 = self._create_vendor(
            email="top2@example.com",
            shop_name="Top Two",
            status_value=VendorProfile.Status.APPROVED,
            earnings="700.00",
        )
        top_3 = self._create_vendor(
            email="top3@example.com",
            shop_name="Top Three",
            status_value=VendorProfile.Status.APPROVED,
            earnings="500.00",
        )
        self._create_vendor(
            email="low@example.com",
            shop_name="Low Four",
            status_value=VendorProfile.Status.APPROVED,
            earnings="100.00",
        )
        self._create_vendor(
            email="pending@example.com",
            shop_name="Pending Shop",
            status_value=VendorProfile.Status.PENDING,
            earnings="999.00",
        )

        response = self.client.get("/api/v1/vendors/spotlight/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 3)
        self.assertEqual(
            [item["id"] for item in results],
            [top_1.id, top_2.id, top_3.id],
        )

    def test_spotlight_respects_limit_parameter(self):
        first = self._create_vendor(
            email="first@example.com",
            shop_name="First",
            status_value=VendorProfile.Status.APPROVED,
            earnings="250.00",
        )
        second = self._create_vendor(
            email="second@example.com",
            shop_name="Second",
            status_value=VendorProfile.Status.APPROVED,
            earnings="200.00",
        )
        self._create_vendor(
            email="third@example.com",
            shop_name="Third",
            status_value=VendorProfile.Status.APPROVED,
            earnings="150.00",
        )

        response = self.client.get("/api/v1/vendors/spotlight/?limit=2")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 2)
        self.assertEqual([item["id"] for item in results], [first.id, second.id])
