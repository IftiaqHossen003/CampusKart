import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)

  return {
    user,
    token,
    refreshToken,
    login,
    logout,
    isAuthenticated: Boolean(token),
  }
}