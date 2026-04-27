import apiClient from "./client";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getPageFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    const page = Number(parsed.searchParams.get("page"));
    return Number.isNaN(page) ? null : page;
  } catch {
    return null;
  }
}

function normalizeMessage(rawMessage = {}) {
  return {
    id: toNumber(rawMessage.id),
    sender: toNumber(rawMessage.sender),
    sender_email: rawMessage.sender_email || "",
    message: rawMessage.message || "",
    is_read: Boolean(rawMessage.is_read),
    sent_at: rawMessage.sent_at || null,
  };
}

function normalizeRoom(rawRoom = {}) {
  return {
    id: toNumber(rawRoom.id),
    buyer: toNumber(rawRoom.buyer),
    buyer_email: rawRoom.buyer_email || "",
    vendor_id: toNumber(rawRoom.vendor_id),
    vendor_user_id: toNumber(rawRoom.vendor_user_id),
    vendor_shop_name: rawRoom.vendor_shop_name || "Vendor",
    product: rawRoom.product ? toNumber(rawRoom.product) : null,
    product_name: rawRoom.product_name || null,
    unread_count: toNumber(rawRoom.unread_count),
    created_at: rawRoom.created_at || null,
    last_message: rawRoom.last_message
      ? normalizeMessage(rawRoom.last_message)
      : null,
  };
}

export async function fetchChatRooms() {
  const response = await apiClient.get("/chat/rooms/");
  const payload = response.data;

  if (Array.isArray(payload)) {
    return payload.map((room) => normalizeRoom(room));
  }

  if (Array.isArray(payload?.results)) {
    return payload.results.map((room) => normalizeRoom(room));
  }

  return [];
}

export async function createChatRoom({ vendorId, buyerId, productId } = {}) {
  const payload = {};

  if (vendorId !== undefined && vendorId !== null) {
    payload.vendor_id = Number(vendorId);
  }

  if (buyerId !== undefined && buyerId !== null) {
    payload.buyer_id = Number(buyerId);
  }

  if (productId !== undefined && productId !== null) {
    payload.product_id = Number(productId);
  }

  const response = await apiClient.post("/chat/rooms/", payload);
  return normalizeRoom(response.data || {});
}

export async function fetchChatMessages(
  roomId,
  { page = 1, pageSize = 100 } = {},
) {
  const response = await apiClient.get(`/chat/rooms/${roomId}/messages/`, {
    params: {
      page,
      page_size: pageSize,
    },
  });

  const payload = response.data || {};
  const results = Array.isArray(payload.results)
    ? payload.results.map((message) => normalizeMessage(message))
    : [];

  const count = toNumber(payload.count);
  const resolvedPageSize = Math.max(1, toNumber(pageSize, 100));

  return {
    results,
    count,
    nextPage: getPageFromUrl(payload.next),
    previousPage: getPageFromUrl(payload.previous),
    totalPages: Math.max(1, Math.ceil(count / resolvedPageSize)),
  };
}
