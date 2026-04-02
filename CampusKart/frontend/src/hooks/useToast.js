import { useToastStore } from '../store/toastStore'

export function useToast() {
  const pushToast = useToastStore((state) => state.pushToast)

  return {
    showToast: (message, type = 'info') => pushToast({ message, type }),
    showError: (message) => pushToast({ message, type: 'error' }),
    showSuccess: (message) => pushToast({ message, type: 'success' }),
  }
}