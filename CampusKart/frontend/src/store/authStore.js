import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  refreshToken: null,

  login: ({ user, token, refreshToken }) => {
    set({ user, token, refreshToken })
  },

  setToken: (token) => {
    set({ token })
  },

  logout: () => {
    set({ user: null, token: null, refreshToken: null })
  },
}))