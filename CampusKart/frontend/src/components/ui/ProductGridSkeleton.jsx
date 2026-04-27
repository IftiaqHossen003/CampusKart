function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div
          key={`product-skeleton-${index}`}
          className="overflow-hidden rounded-xl border border-white/10 bg-[var(--ck-surface)] shadow-sm"
        >
          <div className="aspect-[4/3] animate-pulse bg-white/10" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-4/5 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-white/10" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="h-9 w-full animate-pulse rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default ProductGridSkeleton


