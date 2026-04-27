function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <svg
        viewBox="0 0 240 180"
        className="mx-auto h-36 w-48"
        role="img"
        aria-label="Empty results"
      >
        <rect x="30" y="40" width="180" height="100" rx="14" fill="#E2E8F0" />
        <rect x="46" y="56" width="148" height="12" rx="6" fill="#CBD5E1" />
        <rect x="46" y="78" width="98" height="12" rx="6" fill="#CBD5E1" />
        <circle cx="184" cy="124" r="18" fill="#2E86AB" />
        <line x1="197" y1="137" x2="214" y2="154" stroke="#2E86AB" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <h3 className="mt-4 text-lg font-semibold text-primary">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
      >
        {actionLabel}
      </button>
    </div>
  )
}

export default EmptyState
