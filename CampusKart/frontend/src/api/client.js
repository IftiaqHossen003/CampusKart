import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

let refreshPromise = null

function isPublicAuthEndpoint(url = '') {
  return (
    url.includes('/auth/login/') ||
    url.includes('/auth/register/') ||
    url.includes('/auth/verify-email/') ||
    url.includes('/auth/resend-verification/')
  )
}

async function requestNewAccessToken() {
  const { refreshToken, setToken } = useAuthStore.getState()

  if (!refreshToken) {
    throw new Error('No refresh token available.')
  }

  const response = await axios.post(
    `${API_BASE_URL}/auth/token/refresh/`,
    { refresh: refreshToken },
    { withCredentials: true },
  )

  const newAccessToken = response.data?.access

  if (!newAccessToken) {
    throw new Error('Token refresh did not return a new access token.')
  }

  setToken(newAccessToken)
  return newAccessToken
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const originalRequest = error?.config || {}
    const requestUrl = originalRequest?.url || ''

    if (status !== 401) {
      return Promise.reject(error)
    }

    if (isPublicAuthEndpoint(requestUrl)) {
      return Promise.reject(error)
    }

    if (requestUrl.includes('/auth/token/refresh/')) {
      useAuthStore.getState().logout()
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }

      return Promise.reject(error)
    }

    if (!originalRequest._retry) {
      originalRequest._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = requestNewAccessToken().finally(() => {
            refreshPromise = null
          })
        }

        const newAccessToken = await refreshPromise
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`

        return apiClient(originalRequest)
      } catch (refreshError) {
        useAuthStore.getState().logout()
        if (window.location.pathname !== '/login') {
          window.location.assign('/login')
        }

        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

export default apiClient