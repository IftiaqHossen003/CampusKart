from django.contrib import admin
from .models import ChatMessage, ChatRoom


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ["id", "buyer", "vendor", "product", "created_at"]
    search_fields = ["buyer__email", "vendor__shop_name", "product__name"]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ["room", "sender", "is_read", "sent_at"]
    list_filter = ["is_read"]
    search_fields = ["sender__email", "message"]
