import apiClient from './client'

export async function fetchReviewsByProduct(productId) {
  const response = await apiClient.get(`/reviews/?product=${productId}`)
  return response.data
}
