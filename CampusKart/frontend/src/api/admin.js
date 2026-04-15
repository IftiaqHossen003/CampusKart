import apiClient from "./client";

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "undefined" || normalized === "null") {
      return false;
    }
  }

  return true;
}

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (hasValue(value)) {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

function extractArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results;
  }

  return [];
}

function normalizePaginated(payload, fallbackPage = 1) {
  const results = extractArray(payload);
  const countCandidate = toNumber(payload?.count ?? payload?.total ?? results.length);
  const count = countCandidate > 0 ? countCandidate : results.length;
  const page = Math.max(1, toNumber(payload?.page ?? fallbackPage) || 1);
  const pageSize = Math.max(1, results.length || toNumber(payload?.page_size) || 10);

  return {
    results,
    count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    next: payload?.next ?? null,
    previous: payload?.previous ?? null,
  };
}

function parseFilename(contentDisposition, fallback) {
  if (!contentDisposition) {
    return fallback;
  }

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (match?.[1]) {
    return match[1];
  }

  return fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function fetchAdminStats(params = {}) {
  const queryString = buildQueryString(params);
  const response = await apiClient.get(`/admin/stats/${queryString}`);
  return response.data;
}

export async function fetchAdminRevenueTimeseries({ days = 30 } = {}) {
  try {
    const response = await apiClient.get(`/admin/stats/revenue-timeseries/?days=${days}`);
    const points = extractArray(response.data);

    return points.map((point) => ({
      date: point.date,
      revenue: toNumber(point.collected_revenue),
    }));
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }

    const today = new Date();
    const requests = Array.from({ length: days }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (days - index - 1));
      const isoDate = date.toISOString().slice(0, 10);

      return fetchAdminStats({ from_date: isoDate, to_date: isoDate }).then((stats) => ({
        date: isoDate,
        revenue: toNumber(stats?.collected_revenue),
      }));
    });

    return Promise.all(requests);
  }
}

export async function fetchAdminRecentOrders({ limit = 10 } = {}) {
  const normalizedLimit = Math.max(1, toNumber(limit) || 10);
  const response = await apiClient.get(`/admin/orders/recent/?limit=${normalizedLimit}`);
  return extractArray(response.data);
}

export async function fetchAdminVendors({ page = 1, search = "", status = "" } = {}) {
  const queryString = buildQueryString({ page, search, status });
  const response = await apiClient.get(`/admin/vendors/${queryString}`);
  return normalizePaginated(response.data, page);
}

export async function exportAdminVendorsCsv({ search = "", status = "" } = {}) {
  const queryString = buildQueryString({ search, status });
  const response = await apiClient.get(`/admin/vendors/export/${queryString}`, {
    responseType: "blob",
  });
  const filename = parseFilename(
    response.headers?.["content-disposition"],
    "admin-vendors.csv",
  );
  downloadBlob(response.data, filename);
}

export async function approveAdminVendor(vendorId, payload = {}) {
  const response = await apiClient.post(`/admin/vendors/${vendorId}/approve/`, payload);
  return response.data;
}

export async function suspendAdminVendor(vendorId, payload = {}) {
  const response = await apiClient.post(`/admin/vendors/${vendorId}/suspend/`, payload);
  return response.data;
}

export async function fetchAdminProducts({
  page = 1,
  search = "",
  status = "",
  ordering = "-created_at",
} = {}) {
  const queryString = buildQueryString({ page, search, status, ordering });
  const response = await apiClient.get(`/admin/products/${queryString}`);
  return normalizePaginated(response.data, page);
}

export async function exportAdminProductsCsv({
  search = "",
  status = "",
  ordering = "-created_at",
} = {}) {
  const queryString = buildQueryString({ search, status, ordering });
  const response = await apiClient.get(`/admin/products/export/${queryString}`, {
    responseType: "blob",
  });
  const filename = parseFilename(
    response.headers?.["content-disposition"],
    "admin-products.csv",
  );
  downloadBlob(response.data, filename);
}

export async function approveAdminProduct(slug, payload = {}) {
  const response = await apiClient.post(`/admin/products/${slug}/approve/`, payload);
  return response.data;
}

export async function rejectAdminProduct(slug, payload = {}) {
  const response = await apiClient.post(`/admin/products/${slug}/reject/`, payload);
  return response.data;
}

export async function fetchAdminBanners({ page = 1 } = {}) {
  const queryString = buildQueryString({ page });
  const response = await apiClient.get(`/admin/banners/${queryString}`);
  return normalizePaginated(response.data, page);
}

export async function createAdminBanner(payload) {
  const response = await apiClient.post("/admin/banners/", payload);
  return response.data;
}

export async function updateAdminBanner(bannerId, payload) {
  const response = await apiClient.patch(`/admin/banners/${bannerId}/`, payload);
  return response.data;
}

export async function deleteAdminBanner(bannerId) {
  await apiClient.delete(`/admin/banners/${bannerId}/`);
}

export async function fetchAdminCategories({ page = 1 } = {}) {
  const queryString = buildQueryString({ page });
  const response = await apiClient.get(`/admin/categories/${queryString}`);
  return normalizePaginated(response.data, page);
}

export async function createAdminCategory(payload) {
  const response = await apiClient.post("/admin/categories/", payload);
  return response.data;
}

export async function updateAdminCategory(categoryId, payload) {
  const response = await apiClient.patch(`/admin/categories/${categoryId}/`, payload);
  return response.data;
}

export async function deleteAdminCategory(categoryId) {
  await apiClient.delete(`/admin/categories/${categoryId}/`);
}

export async function fetchAdminAuditLogs({
  page = 1,
  action = "",
  resource_type = "",
} = {}) {
  const queryString = buildQueryString({ page, action, resource_type });
  const response = await apiClient.get(`/admin/audit-logs/${queryString}`);
  return normalizePaginated(response.data, page);
}

function escapeCsvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes("\"") || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function downloadCsv(filename, headers, rows) {
  const headerRow = headers.map((header) => escapeCsvCell(header.label)).join(",");
  const bodyRows = rows.map((row) =>
    headers
      .map((header) => escapeCsvCell(typeof header.value === "function" ? header.value(row) : row[header.value]))
      .join(","),
  );

  const csv = [headerRow, ...bodyRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

export function getAdminApiErrorMessage(error, fallbackMessage) {
  const fallback = fallbackMessage || "Something went wrong. Please try again.";
  const data = error?.response?.data;

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (Array.isArray(data?.non_field_errors) && data.non_field_errors.length > 0) {
    return String(data.non_field_errors[0]);
  }

  if (data && typeof data === "object") {
    const firstEntry = Object.values(data)[0];
    if (typeof firstEntry === "string") {
      return firstEntry;
    }
    if (Array.isArray(firstEntry) && firstEntry.length > 0) {
      return String(firstEntry[0]);
    }
  }

  return fallback;
}
