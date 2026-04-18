from rest_framework import serializers

from apps.auth_app.models import CustomUser
from apps.products.models import Product
from apps.vendors.models import VendorProfile

from .models import ChatMessage, ChatRoom


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.CharField(source="sender.email", read_only=True)

    class Meta:
        model = ChatMessage
        fields = ["id", "sender", "sender_email", "message", "is_read", "sent_at"]
        read_only_fields = ["id", "sender", "sender_email", "is_read", "sent_at"]


class ChatRoomSerializer(serializers.ModelSerializer):
    buyer_email = serializers.CharField(source="buyer.email", read_only=True)
    vendor_id = serializers.IntegerField(source="vendor.id", read_only=True)
    vendor_user_id = serializers.IntegerField(source="vendor.user_id", read_only=True)
    vendor_shop_name = serializers.CharField(source="vendor.shop_name", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True, allow_null=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = [
            "id",
            "buyer",
            "buyer_email",
            "vendor_id",
            "vendor_user_id",
            "vendor_shop_name",
            "product",
            "product_name",
            "last_message",
            "unread_count",
            "created_at",
        ]

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-sent_at").first()
        if msg:
            return ChatMessageSerializer(msg).data
        return None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return 0

        annotated_value = getattr(obj, "unread_count", None)
        if annotated_value is not None:
            return annotated_value

        return obj.messages.filter(is_read=False).exclude(sender=user).count()


class ChatRoomCreateSerializer(serializers.Serializer):
    vendor_id = serializers.IntegerField(required=False)
    buyer_id = serializers.IntegerField(required=False)
    product_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        request = self.context["request"]
        user = request.user

        vendor_id = attrs.get("vendor_id")
        buyer_id = attrs.get("buyer_id")
        product_id = attrs.get("product_id")

        if user.role == CustomUser.Role.STUDENT:
            if not vendor_id:
                raise serializers.ValidationError({"vendor_id": "This field is required for buyers."})
            buyer = user
            try:
                vendor = VendorProfile.objects.get(pk=vendor_id)
            except VendorProfile.DoesNotExist as exc:
                raise serializers.ValidationError({"vendor_id": "Vendor not found."}) from exc
        elif user.role == CustomUser.Role.VENDOR:
            if not buyer_id:
                raise serializers.ValidationError({"buyer_id": "This field is required for vendors."})
            if not hasattr(user, "vendor_profile"):
                raise serializers.ValidationError({"detail": "Vendor profile not found."})
            vendor = user.vendor_profile
            try:
                buyer = CustomUser.objects.get(pk=buyer_id, role=CustomUser.Role.STUDENT)
            except CustomUser.DoesNotExist as exc:
                raise serializers.ValidationError({"buyer_id": "Buyer not found."}) from exc
        else:
            raise serializers.ValidationError({"detail": "Only buyers or vendors can create chat rooms."})

        product = None
        if product_id is not None:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist as exc:
                raise serializers.ValidationError({"product_id": "Product not found."}) from exc
            if product.vendor_id != vendor.id:
                raise serializers.ValidationError({"product_id": "Product does not belong to the selected vendor."})

        attrs["buyer"] = buyer
        attrs["vendor"] = vendor
        attrs["product"] = product
        return attrs

    def create(self, validated_data):
        room, _ = ChatRoom.objects.get_or_create(
            buyer=validated_data["buyer"],
            vendor=validated_data["vendor"],
            product=validated_data["product"],
        )
        return room

    def to_representation(self, instance):
        return ChatRoomSerializer(instance=instance, context=self.context).data
