import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_WS_PORT = "8001";

function toWebSocketBaseUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function getWebSocketBaseUrl() {
  const explicitWsUrl = import.meta.env.VITE_WS_URL;
  if (explicitWsUrl) {
    return toWebSocketBaseUrl(explicitWsUrl);
  }

  const apiUrl = import.meta.env.VITE_API_URL;
  let hostname = window.location.hostname || "localhost";

  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    try {
      const parsed = new URL(apiUrl);
      if (parsed.hostname) {
        hostname = parsed.hostname;
      }
    } catch {
      // Use window hostname fallback when VITE_API_URL cannot be parsed.
    }
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsPort = import.meta.env.VITE_WS_PORT || DEFAULT_WS_PORT;
  return `${protocol}//${hostname}:${wsPort}`;
}

function buildSocketUrl(roomId, token) {
  const wsBase = getWebSocketBaseUrl();
  if (!wsBase || !roomId || !token) {
    return null;
  }

  return `${wsBase}/ws/chat/${roomId}/?token=${encodeURIComponent(token)}`;
}

export function useChatSocket({
  roomId,
  token,
  onMessage,
  onTyping,
  onReadReceipt,
}) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const shouldReconnectRef = useRef(false);
  const retryCountRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const onReadReceiptRef = useRef(onReadReceipt);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    onReadReceiptRef.current = onReadReceipt;
  }, [onReadReceipt]);

  useEffect(() => {
    const url = buildSocketUrl(roomId, token);

    if (!url) {
      return undefined;
    }

    shouldReconnectRef.current = true;

    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        retryCountRef.current = 0;
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "typing") {
            onTypingRef.current?.(payload);
            return;
          }

          if (payload.type === "read_receipt") {
            onReadReceiptRef.current?.(payload);
            return;
          }

          if (payload.message) {
            onMessageRef.current?.(payload);
          }
        } catch {
          // Ignore malformed payloads to keep socket alive.
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        socketRef.current = null;

        if (!shouldReconnectRef.current) {
          return;
        }

        const retryDelay = Math.min(5000, 1000 * 2 ** retryCountRef.current);
        retryCountRef.current += 1;

        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, retryDelay);
      };

      socket.onerror = () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;

      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }

      if (
        socketRef.current &&
        socketRef.current.readyState < WebSocket.CLOSING
      ) {
        socketRef.current.close();
      }

      socketRef.current = null;
    };
  }, [roomId, token]);

  const sendEvent = useCallback((eventPayload) => {
    if (!eventPayload) {
      return false;
    }

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(eventPayload));
    return true;
  }, []);

  return {
    isConnected,
    sendEvent,
  };
}
