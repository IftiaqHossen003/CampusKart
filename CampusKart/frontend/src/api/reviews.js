import apiClient from "./client";

function normalizeReviewPage(payload) {
  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload)
      ? payload
      : [];

  const nextUrl = payload?.next || null;
  let nextPage = null;

  if (nextUrl) {
    try {
      const parsed = new URL(nextUrl);
      const page = Number(parsed.searchParams.get("page"));
      if (!Number.isNaN(page) && page > 0) {
        nextPage = page;
      }
    } catch {
      // Leave nextPage as null if URL parsing fails.
    }
  }

  return {
    count: Number(payload?.count || results.length || 0),
    results,
    stats: payload?.stats || {
      average_rating: 0,
      total_reviews: 0,
      rating_counts: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      },
    },
    nextPage,
  };
}

export async function fetchProductReviews(productId, { page = 1 } = {}) {
  const response = await apiClient.get(
    `/products/${productId}/reviews/?page=${page}`,
  );
  return normalizeReviewPage(response.data);
}

export async function createProductReview(productId, payload) {
  const response = await apiClient.post(
    `/products/${productId}/reviews/`,
    payload,
  );
  return response.data;
}

export async function fetchProductReviewEligibility(productId) {
  const response = await apiClient.get(
    `/products/${productId}/review-eligibility/`,
  );
  return response.data;
}
