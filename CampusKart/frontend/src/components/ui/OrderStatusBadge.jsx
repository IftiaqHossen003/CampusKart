function toStatusLabel(status) {
  const normalized = String(status || 'pending').trim().toLowerCase()
  if (!normalized) {
    return 'Pending'
  }

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const statusClasses = {
  pending: 'bg-warning/15 text-warning',
  confirmed: 'bg-sky-100 text-sky-700',
  processing: 'bg-sky-100 text-sky-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-success/15 text-success',
  completed: 'bg-success/15 text-success',
  cancelled: 'bg-error/15 text-error',
  canceled: 'bg-error/15 text-error',
  failed: 'bg-error/15 text-error',
  refunded: 'bg-slate-100 text-slate-700',
}

function OrderStatusBadge({ status, className = '' }) {
  const normalized = String(status || 'pending').trim().toLowerCase()
  const classes = statusClasses[normalized] || 'bg-slate-100 text-slate-700'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes} ${className}`}>
      {toStatusLabel(normalized)}
    </span>
  )
}

export default OrderStatusBadge
