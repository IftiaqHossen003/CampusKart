import apiClient from "./client";

export async function fetchMyProfile() {
  const response = await apiClient.get("/auth/me/");
  return response.data;
}

export async function updateMyProfile(payload) {
  const requestConfig =
    payload instanceof FormData
      ? {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      : undefined;

  const response = await apiClient.patch("/auth/me/", payload, requestConfig);
  return response.data;
}

export async function changeMyPassword(payload) {
  const response = await apiClient.patch("/auth/change-password/", payload);
  return response.data;
}
