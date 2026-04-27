from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import ChatMessage, ChatRoom
from .pagination import ChatMessageCursorPagination
from .serializers import ChatMessageSerializer, ChatRoomCreateSerializer, ChatRoomSerializer


class ChatRoomListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ChatRoomCreateSerializer
        return ChatRoomSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = ChatRoom.objects.select_related("buyer", "vendor", "vendor__user", "product")
        queryset = queryset.prefetch_related("messages", "messages__sender")

        if user.role == "vendor":
            queryset = queryset.filter(vendor__user=user)
        else:
            queryset = queryset.filter(buyer=user)

        return queryset.annotate(
            unread_count=Count(
                "messages",
                filter=Q(messages__is_read=False) & ~Q(messages__sender=user),
            )
        ).order_by("-created_at")


class ChatMessageListView(generics.ListAPIView):
    serializer_class = ChatMessageSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ChatMessageCursorPagination

    _room = None

    def _get_room(self):
        if self._room is not None:
            return self._room

        room = get_object_or_404(
            ChatRoom.objects.select_related("vendor", "vendor__user"),
            pk=self.kwargs["room_id"],
        )
        if not room.has_participant(self.request.user):
            self.permission_denied(self.request, message="You are not a participant in this room.")
        self._room = room
        return room

    def get_queryset(self):
        room = self._get_room()
        return room.messages.select_related("sender").order_by("-sent_at")

    def list(self, request, *args, **kwargs):
        room = self._get_room()
        ChatMessage.objects.filter(room=room, is_read=False).exclude(sender=request.user).update(is_read=True)
        return super().list(request, *args, **kwargs)
