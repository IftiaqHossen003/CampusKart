function toStatusLabel(status) {
  const normalized = String(status || "pending")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "Pending";
  }

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const statusClasses = {
  pending: "bg-warning/15 text-warning",
  initiated: "bg-warning/15 text-warning",
  confirmed: "bg-[var(--ck-accent)]/20 text-[var(--ck-accent)]",
  processing: "bg-[var(--ck-accent)]/20 text-[var(--ck-accent)]",
  shipped: "bg-[var(--ck-accent)]/20 text-[var(--ck-accent)]",
  partially_shipped: "bg-[var(--ck-accent)]/20 text-[var(--ck-accent)]",
  delivered: "bg-success/15 text-success",
  success: "bg-success/15 text-success",
  completed: "bg-success/15 text-success",
  ready: "bg-[var(--ck-accent)]/20 text-[var(--ck-accent)]",
  paid: "bg-success/15 text-success",
  cancelled: "bg-error/15 text-error",
  canceled: "bg-error/15 text-error",
  failed: "bg-error/15 text-error",
  refunded: "bg-white/10 text-slate-600",
};

function OrderStatusBadge({ status, className = "" }) {
  const normalized = String(status || "pending")
    .trim()
    .toLowerCase();
  const classes = statusClasses[normalized] || "bg-white/10 text-slate-600";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes} ${className}`}
    >
      {toStatusLabel(normalized)}
    </span>
  );
}

export default OrderStatusBadge;


