import apiClient from "./client";

function normalizeWishlist(payload) {
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload)
      ? payload
      : [];

  return {
    count: Number(payload?.count ?? results.length ?? 0),
    results,
  };
}

export async function fetchWishlist() {
  const response = await apiClient.get("/wishlist/");
  return normalizeWishlist(response.data);
}

export async function toggleWishlist(productId) {
  const response = await apiClient.post("/wishlist/", {
    product_id: productId,
  });
  return response.data;
}
