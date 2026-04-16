import apiClient from "./client";

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

  if (typeof value === "number" && Number.isNaN(value)) {
    return false;
  }

  return true;
}

function buildQueryString(params) {
  const query = new URLSearchParams();

  if (hasValue(params.category)) {
    query.set("category", params.category);
  }

  if (Array.isArray(params.tags)) {
    params.tags.forEach((tag) => {
      if (tag) {
        query.append("tag", tag);
      }
    });
  }

  if (hasValue(params.min_price)) {
    query.set("min_price", String(params.min_price));
  }

  if (hasValue(params.max_price)) {
    query.set("max_price", String(params.max_price));
  }

  if (hasValue(params.search)) {
    query.set("search", params.search);
  }

  if (hasValue(params.vendor)) {
    query.set("vendor", String(params.vendor));
  }

  if (hasValue(params.status)) {
    query.set("status", params.status);
  }

  if (hasValue(params.ordering)) {
    query.set("ordering", params.ordering);
  }

  if (hasValue(params.pageSize)) {
    query.set("page_size", String(params.pageSize));
  } else if (hasValue(params.page_size)) {
    query.set("page_size", String(params.page_size));
  }

  query.set("page", String(params.page || 1));

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export async function fetchProducts(filters) {
  const queryString = buildQueryString(filters);
  const response = await apiClient.get(`/products/${queryString}`);
  return response.data;
}

export async function fetchProductBySlug(slug) {
  const response = await apiClient.get(`/products/${slug}/`);
  return response.data;
}

export async function fetchCategories() {
  const response = await apiClient.get("/products/categories/");
  return response.data;
}

export async function fetchProductTags() {
  const response = await apiClient.get("/products/tags/");
  return response.data;
}

export async function createProduct(payload) {
  const response = await apiClient.post("/products/", payload);
  return response.data;
}

export async function uploadProductImage(productId, imageFile) {
  const formData = new FormData();
  formData.append("image", imageFile);

  const response = await apiClient.post(
    `/products/${productId}/images/`,
    formData,
  );
  return response.data;
}

export async function updateProduct(slug, payload) {
  const response = await apiClient.patch(`/products/${slug}/`, payload);
  return response.data;
}

export async function deleteProduct(slug) {
  await apiClient.delete(`/products/${slug}/`);
}
