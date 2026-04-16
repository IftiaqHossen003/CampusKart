import apiClient from "./client";

function normalizeVendorList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}

export async function fetchMyVendorProfile() {
  const response = await apiClient.get("/vendors/me/");
  return response.data;
}

export async function updateMyVendorProfile(payload) {
  const response = await apiClient.patch("/vendors/me/", payload);
  return response.data;
}

export async function fetchVendorSpotlight({ limit = 3 } = {}) {
  const response = await apiClient.get(`/vendors/spotlight/?limit=${limit}`);
  return normalizeVendorList(response.data);
}
