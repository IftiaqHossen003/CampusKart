import { create } from "zustand";

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthBootstrapping: true,
  isAuthReady: false,

  startAuthBootstrap: () => {
    set({ isAuthBootstrapping: true, isAuthReady: false });
  },

  completeAuthBootstrap: ({ user = null, token = null } = {}) => {
    set({ user, token, isAuthBootstrapping: false, isAuthReady: true });
  },

  login: ({ user, token }) => {
    set({ user, token, isAuthBootstrapping: false, isAuthReady: true });
  },

  setToken: (token) => {
    set({ token, isAuthReady: true });
  },

  updateUser: (partialUser) => {
    set((state) => ({
      user: partialUser
        ? { ...(state.user || {}), ...partialUser }
        : state.user,
      isAuthBootstrapping: false,
      isAuthReady: true,
    }));
  },

  logout: () => {
    set({
      user: null,
      token: null,
      isAuthBootstrapping: false,
      isAuthReady: true,
    });
  },
}));
