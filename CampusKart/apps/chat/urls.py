from django.urls import path
from .views import ChatRoomListView, MessageListView

app_name = "chat"

urlpatterns = [
    path("rooms/",                  ChatRoomListView.as_view(), name="room-list"),
    path("rooms/<int:room_id>/",    MessageListView.as_view(),  name="message-list"),
]
