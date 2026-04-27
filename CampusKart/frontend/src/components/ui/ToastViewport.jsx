import { useToastStore } from '../../store/toastStore'

const toastClasses = {
  success: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-200',
  error: 'border-red-500/40 bg-red-950/70 text-red-200',
  warning: 'border-amber-500/40 bg-amber-950/70 text-amber-200',
  info: 'border-white/20 bg-[var(--ck-surface)] text-white',
}

function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-md ${toastClasses[toast.type] || toastClasses.info}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <p>{toast.message}</p>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-xs font-semibold text-slate-600 transition hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default ToastViewport
