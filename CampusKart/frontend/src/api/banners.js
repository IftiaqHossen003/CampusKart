import apiClient from "./client";

function normalizeBannerList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}

export async function fetchPublicBanners() {
  const response = await apiClient.get("/banners/");
  return normalizeBannerList(response.data);
}
