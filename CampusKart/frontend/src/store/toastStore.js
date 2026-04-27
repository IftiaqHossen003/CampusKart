import { create } from 'zustand'

const TOAST_DURATION = 3500

export const useToastStore = create((set) => ({
  toasts: [],

  pushToast: ({ message, type = 'info' }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }))
    }, TOAST_DURATION)
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }))
  },
}))