import apiClient from "./client";

function toBoolean(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function buildQueryString({ page = 1, isRead } = {}) {
  const query = new URLSearchParams();
  query.set("page", String(page));

  const parsedIsRead = toBoolean(isRead);
  if (parsedIsRead !== undefined) {
    query.set("is_read", String(parsedIsRead));
  }

  return `?${query.toString()}`;
}

function normalizeNotificationList(payload) {
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload)
      ? payload
      : [];

  let totalPages = 1;
  const count = Number(payload?.count ?? results.length ?? 0);
  if (count > 0) {
    totalPages = Math.max(1, Math.ceil(count / 20));
  }

  return {
    count,
    totalPages,
    next: payload?.next || null,
    previous: payload?.previous || null,
    results,
  };
}

export async function fetchNotifications({ page = 1, isRead } = {}) {
  const response = await apiClient.get(
    `/notifications/${buildQueryString({ page, isRead })}`,
  );
  return normalizeNotificationList(response.data);
}

export async function markNotificationRead(id) {
  const response = await apiClient.patch(`/notifications/${id}/read/`, {});
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await apiClient.post("/notifications/mark-all-read/", {});
  return response.data;
}

export async function fetchUnreadNotificationCount() {
  const response = await apiClient.get("/notifications/unread-count/");
  return Number(response.data?.unread_count || 0);
}
