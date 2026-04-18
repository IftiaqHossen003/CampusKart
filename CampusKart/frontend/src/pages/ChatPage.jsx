import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { fetchChatMessages, fetchChatRooms } from "../api/chat";
import { useChatSocket } from "../hooks/useChatSocket";
import { useToast } from "../hooks/useToast";
import { useAuthStore } from "../store/authStore";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-BD", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatRoomTimestamp(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay =
    parsed.getDate() === now.getDate() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getFullYear() === now.getFullYear();

  if (sameDay) {
    return new Intl.DateTimeFormat("en-BD", {
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }

  return new Intl.DateTimeFormat("en-BD", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function getRoomActivity(room) {
  return room?.last_message?.sent_at || room?.created_at || null;
}

function sortRoomsByActivity(rooms) {
  return [...rooms].sort((a, b) => {
    const left = new Date(getRoomActivity(a) || 0).getTime();
    const right = new Date(getRoomActivity(b) || 0).getTime();
    return right - left;
  });
}

function getRoomDisplayName(room, userRole) {
  if (userRole === "vendor") {
    return room.buyer_email || "Buyer";
  }

  return room.vendor_shop_name || "Vendor";
}

function normalizeSocketMessage(payload) {
  return {
    id: toNumber(payload.message_id || payload.id),
    sender: toNumber(payload.sender_id || payload.sender),
    sender_email: payload.sender_email || "",
    message: payload.message || "",
    is_read: Boolean(payload.is_read),
    sent_at: payload.sent_at || new Date().toISOString(),
  };
}

function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const { showError } = useToast();

  const selectedRoomId = useMemo(() => {
    const fromQuery = Number(searchParams.get("room"));
    return Number.isNaN(fromQuery) || fromQuery <= 0 ? null : fromQuery;
  }, [searchParams]);

  const currentUserId = toNumber(user?.id, 0);
  const userRole = user?.role || "student";

  const [liveMessagesByRoom, setLiveMessagesByRoom] = useState({});
  const [draftByRoom, setDraftByRoom] = useState({});
  const [typingState, setTypingState] = useState({
    roomId: null,
    isTyping: false,
  });

  const threadRef = useRef(null);
  const typingStopTimeoutRef = useRef(null);
  const typingPresenceTimeoutRef = useRef(null);
  const lastReadReceiptKeyRef = useRef("");

  const roomsQuery = useQuery({
    queryKey: ["chat-rooms"],
    queryFn: fetchChatRooms,
    staleTime: 10 * 1000,
  });

  const rooms = useMemo(
    () => sortRoomsByActivity(roomsQuery.data || []),
    [roomsQuery.data],
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId],
  );

  const messagesQuery = useQuery({
    queryKey: ["chat-messages", selectedRoomId],
    queryFn: () =>
      fetchChatMessages(selectedRoomId, { page: 1, pageSize: 100 }),
    enabled: Boolean(selectedRoomId),
    staleTime: 10 * 1000,
  });

  const messages = useMemo(() => {
    const baseMessages = messagesQuery.data?.results || [];
    const liveMessages =
      (selectedRoomId && liveMessagesByRoom[selectedRoomId]) || [];

    const merged = new Map();
    [...baseMessages, ...liveMessages].forEach((message) => {
      if (!message?.id) {
        return;
      }
      const existing = merged.get(message.id) || {};
      merged.set(message.id, { ...existing, ...message });
    });

    return [...merged.values()].sort(
      (left, right) => new Date(left.sent_at).getTime() - new Date(right.sent_at).getTime(),
    );
  }, [messagesQuery.data, liveMessagesByRoom, selectedRoomId]);

  const draft = selectedRoomId ? draftByRoom[selectedRoomId] || "" : "";
  const isPeerTyping =
    typingState.roomId === selectedRoomId && typingState.isTyping;

  const updateRoomInState = useCallback((roomId, updater) => {
    if (!roomId) {
      return;
    }

    queryClient.setQueryData(["chat-rooms"], (previousRooms) => {
      const sourceRooms = Array.isArray(previousRooms)
        ? previousRooms
        : Array.isArray(previousRooms?.results)
          ? previousRooms.results
          : null;

      if (!sourceRooms) {
        return previousRooms;
      }

      const nextRooms = sourceRooms.map((room) => {
        if (room.id !== roomId) {
          return room;
        }

        return updater(room);
      });

      if (Array.isArray(previousRooms)) {
        return nextRooms;
      }

      return {
        ...previousRooms,
        results: nextRooms,
      };
    });
  }, [queryClient]);

  const handleSocketMessage = useCallback(
    (payload) => {
      if (!selectedRoomId) {
        return;
      }

      const message = normalizeSocketMessage(payload);
      if (!message.id) {
        return;
      }

      setLiveMessagesByRoom((previous) => {
        const roomMessages = previous[selectedRoomId] || [];
        if (roomMessages.some((existing) => existing.id === message.id)) {
          return previous;
        }

        return {
          ...previous,
          [selectedRoomId]: [...roomMessages, message],
        };
      });

      updateRoomInState(selectedRoomId, (room) => ({
        ...room,
        last_message: message,
        unread_count: 0,
      }));
    },
    [selectedRoomId, updateRoomInState],
  );

  const handleTypingEvent = useCallback(
    (payload) => {
      if (toNumber(payload.room_id) !== selectedRoomId) {
        return;
      }

      if (toNumber(payload.sender_id) === currentUserId) {
        return;
      }

      setTypingState({
        roomId: selectedRoomId,
        isTyping: Boolean(payload.is_typing),
      });

      if (typingPresenceTimeoutRef.current) {
        window.clearTimeout(typingPresenceTimeoutRef.current);
      }

      if (payload.is_typing) {
        typingPresenceTimeoutRef.current = window.setTimeout(() => {
          setTypingState((current) => {
            if (current.roomId !== selectedRoomId) {
              return current;
            }
            return {
              ...current,
              isTyping: false,
            };
          });
        }, 2500);
      }
    },
    [currentUserId, selectedRoomId],
  );

  const handleReadReceiptEvent = useCallback(
    (payload) => {
      const messageId = toNumber(payload.message_id);
      if (!messageId) {
        return;
      }

      if (selectedRoomId) {
        setLiveMessagesByRoom((previous) => {
          const roomMessages = previous[selectedRoomId] || [];
          const nextRoomMessages = roomMessages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            return {
              ...message,
              is_read: true,
            };
          });

          if (!roomMessages.some((message) => message.id === messageId)) {
            nextRoomMessages.push({ id: messageId, is_read: true });
          }

          return {
            ...previous,
            [selectedRoomId]: nextRoomMessages,
          };
        });
      }

      updateRoomInState(selectedRoomId, (room) => {
        if (room.last_message?.id !== messageId) {
          return room;
        }

        return {
          ...room,
          last_message: {
            ...room.last_message,
            is_read: true,
          },
        };
      });
    },
    [selectedRoomId, updateRoomInState],
  );

  const { isConnected, sendEvent } = useChatSocket({
    roomId: selectedRoomId,
    token,
    onMessage: handleSocketMessage,
    onTyping: handleTypingEvent,
    onReadReceipt: handleReadReceiptEvent,
  });

  useEffect(() => {
    if (!threadRef.current) {
      return;
    }

    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length, isPeerTyping]);

  useEffect(() => {
    if (!selectedRoomId || !messages.length) {
      return;
    }

    const latestIncoming = [...messages]
      .reverse()
      .find((message) => message.sender !== currentUserId);

    if (!latestIncoming) {
      return;
    }

    const receiptKey = `${selectedRoomId}:${latestIncoming.id}`;
    if (lastReadReceiptKeyRef.current === receiptKey) {
      return;
    }

    if (sendEvent({ type: "read_receipt", message_id: latestIncoming.id })) {
      lastReadReceiptKeyRef.current = receiptKey;
    }
  }, [currentUserId, messages, selectedRoomId, sendEvent]);

  useEffect(
    () => () => {
      if (typingStopTimeoutRef.current) {
        window.clearTimeout(typingStopTimeoutRef.current);
      }

      if (typingPresenceTimeoutRef.current) {
        window.clearTimeout(typingPresenceTimeoutRef.current);
      }
    },
    [],
  );

  const clearRoomSelection = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("room");
    setSearchParams(next);
    lastReadReceiptKeyRef.current = "";
  };

  const openRoom = (roomId) => {
    const next = new URLSearchParams(searchParams);
    next.set("room", String(roomId));
    setSearchParams(next);
    lastReadReceiptKeyRef.current = "";

    updateRoomInState(roomId, (room) => ({
      ...room,
      unread_count: 0,
    }));
  };

  const handleDraftChange = (event) => {
    if (!selectedRoomId) {
      return;
    }

    const next = event.target.value;
    setDraftByRoom((previous) => ({
      ...previous,
      [selectedRoomId]: next,
    }));

    if (!next.trim()) {
      sendEvent({ type: "typing", is_typing: false });
      return;
    }

    sendEvent({ type: "typing", is_typing: true });

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }

    typingStopTimeoutRef.current = window.setTimeout(() => {
      sendEvent({ type: "typing", is_typing: false });
    }, 1200);
  };

  const handleSendMessage = () => {
    if (!selectedRoomId) {
      return;
    }

    const messageText = draft.trim();
    if (!messageText) {
      return;
    }

    if (!sendEvent({ message: messageText })) {
      showError("Chat connection is still reconnecting. Please try again.");
      return;
    }

    setDraftByRoom((previous) => ({
      ...previous,
      [selectedRoomId]: "",
    }));
    sendEvent({ type: "typing", is_typing: false });

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }
  };

  const lastOwnMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].sender === currentUserId) {
        return messages[index].id;
      }
    }

    return null;
  }, [currentUserId, messages]);

  const isRoomListHiddenOnMobile = Boolean(selectedRoomId);
  const isThreadVisible = Boolean(selectedRoomId);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Chat</h1>
        <p className="mt-1 text-sm text-muted">
          Real-time conversations with buyers and vendors.
        </p>
      </div>

      <div className="h-[calc(100vh-14rem)] min-h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex h-full">
          <aside
            className={`w-full border-r border-slate-200 md:w-[340px] ${isRoomListHiddenOnMobile ? "hidden md:block" : "block"}`}
          >
            <header className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">
                Conversations
              </h2>
            </header>

            <div className="h-[calc(100%-53px)] overflow-y-auto">
              {roomsQuery.isLoading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`chat-room-skeleton-${index}`}
                      className="h-16 animate-pulse rounded-lg bg-slate-100"
                    />
                  ))}
                </div>
              ) : null}

              {!roomsQuery.isLoading && rooms.length === 0 ? (
                <div className="p-5 text-sm text-muted">
                  No conversations yet. Start a chat from any product page.
                </div>
              ) : null}

              {!roomsQuery.isLoading && rooms.length > 0
                ? rooms.map((room) => {
                    const roomTitle = getRoomDisplayName(room, userRole);
                    const roomSubtitle =
                      room.product_name || "General conversation";
                    const roomTime = formatRoomTimestamp(getRoomActivity(room));
                    const isSelected = room.id === selectedRoomId;

                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => openRoom(room.id)}
                        className={`w-full border-b border-slate-100 px-4 py-3 text-left transition ${
                          isSelected ? "bg-primary/5" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {roomTitle}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-600">
                              {room.last_message?.message || roomSubtitle}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {roomTime ? (
                              <span className="text-[11px] text-slate-500">
                                {roomTime}
                              </span>
                            ) : null}

                            {room.unread_count > 0 ? (
                              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {room.unread_count}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                : null}
            </div>
          </aside>

          <div
            className={`flex flex-1 flex-col ${isThreadVisible ? "flex" : "hidden md:flex"}`}
          >
            {selectedRoom ? (
              <>
                <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={clearRoomSelection}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 md:hidden"
                    >
                      Back
                    </button>

                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {getRoomDisplayName(selectedRoom, userRole)}
                      </p>
                      <p className="text-xs text-muted">
                        {selectedRoom.product_name || "General conversation"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      isConnected
                        ? "bg-success/15 text-success"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {isConnected ? "Connected" : "Reconnecting..."}
                  </span>
                </header>

                <div
                  ref={threadRef}
                  className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4"
                >
                  {messagesQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div
                          key={`message-skeleton-${index}`}
                          className="h-14 animate-pulse rounded-lg bg-slate-200"
                        />
                      ))}
                    </div>
                  ) : null}

                  {!messagesQuery.isLoading && messages.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-muted">
                      No messages yet. Start the conversation.
                    </div>
                  ) : null}

                  {!messagesQuery.isLoading
                    ? messages.map((message) => {
                        const isMine = message.sender === currentUserId;
                        const showSeen =
                          isMine &&
                          message.id === lastOwnMessageId &&
                          Boolean(message.is_read);

                        return (
                          <div
                            key={message.id}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${
                                isMine
                                  ? "rounded-br-sm bg-primary text-white"
                                  : "rounded-bl-sm bg-white text-slate-800"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {message.message}
                              </p>
                              <div
                                className={`mt-1 flex items-center justify-end gap-2 text-[11px] ${
                                  isMine ? "text-white/85" : "text-slate-500"
                                }`}
                              >
                                <span>{formatDateTime(message.sent_at)}</span>
                                {showSeen ? <span>Seen</span> : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    : null}

                  {isPeerTyping ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                        typing...
                      </div>
                    </div>
                  ) : null}
                </div>

                <footer className="border-t border-slate-200 bg-white p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={handleDraftChange}
                      rows={2}
                      placeholder={
                        isConnected
                          ? "Type a message"
                          : "Waiting for connection..."
                      }
                      className="max-h-32 min-h-[44px] flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={!draft.trim() || !isConnected}
                      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div>
                  <h2 className="text-lg font-semibold text-primary">
                    Select a conversation
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Choose a chat from the left panel to view messages.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChatPage;
