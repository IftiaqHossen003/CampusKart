from django.urls import path
from .views import ChatMessageListView, ChatRoomListCreateView

app_name = "chat"

urlpatterns = [
    path("rooms/", ChatRoomListCreateView.as_view(), name="room-list-create"),
    path("rooms/<int:room_id>/messages/", ChatMessageListView.as_view(), name="room-messages"),
    path("rooms/<int:room_id>/", ChatMessageListView.as_view(), name="room-messages-legacy"),
]
