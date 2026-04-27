import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isAuthBootstrapping = useAuthStore(
    (state) => state.isAuthBootstrapping,
  );
  const isAuthReady = useAuthStore((state) => state.isAuthReady);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  return {
    user,
    token,
    isAuthBootstrapping,
    isAuthReady,
    login,
    logout,
    isAuthenticated: Boolean(token),
  };
}
