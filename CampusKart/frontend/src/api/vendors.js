import apiClient from './client'

export async function fetchMyVendorProfile() {
  const response = await apiClient.get('/vendors/me/')
  return response.data
}
