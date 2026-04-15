import apiClient from './client'

export async function fetchMyVendorProfile() {
  const response = await apiClient.get('/vendors/me/')
  return response.data
}

export async function updateMyVendorProfile(payload) {
  const response = await apiClient.patch('/vendors/me/', payload)
  return response.data
}
