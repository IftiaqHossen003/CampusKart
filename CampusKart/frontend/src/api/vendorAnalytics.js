import apiClient from "./client";

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
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

export async function fetchVendorAnalyticsOverview() {
  const response = await apiClient.get("/vendor/analytics/overview/");
  return response.data;
}

export async function fetchVendorAnalyticsRevenue({ period = "30d" } = {}) {
  const response = await apiClient.get(
    `/vendor/analytics/revenue/?period=${period}`,
  );
  return Array.isArray(response.data)
    ? response.data.map((point) => ({
        date: point.date,
        revenue: toNumber(point.revenue),
        orders: toNumber(point.orders),
      }))
    : [];
}

export async function fetchVendorAnalyticsProducts() {
  const response = await apiClient.get("/vendor/analytics/products/");
  return Array.isArray(response.data)
    ? response.data.map((item) => ({
        ...item,
        views: toNumber(item.views),
        sold: toNumber(item.sold),
        revenue: toNumber(item.revenue),
        rating: toNumber(item.rating),
      }))
    : [];
}

export async function fetchVendorAnalyticsPayouts() {
  const response = await apiClient.get("/vendor/analytics/payouts/");
  return response.data;
}

export async function exportVendorPayoutsCsv() {
  const response = await apiClient.get("/vendor/analytics/payouts/export/", {
    responseType: "blob",
  });
  const filename = parseFilename(
    response.headers?.["content-disposition"],
    "vendor-payouts.csv",
  );
  downloadBlob(response.data, filename);
  return filename;
}

export function getVendorAnalyticsErrorMessage(error, fallbackMessage) {
  const fallback =
    fallbackMessage || "Something went wrong while loading analytics.";
  const data = error?.response?.data;

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (
    Array.isArray(data?.non_field_errors) &&
    data.non_field_errors.length > 0
  ) {
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
