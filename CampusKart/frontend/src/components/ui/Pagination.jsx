function buildPages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-right', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis-left',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ]
  }

  return [
    1,
    'ellipsis-left',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-right',
    totalPages,
  ]
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) {
    return null
  }

  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages))
  const pages = buildPages(safeCurrentPage, totalPages)

  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Product pagination">
      <button
        type="button"
        disabled={safeCurrentPage <= 1}
        onClick={() => onPageChange(safeCurrentPage - 1)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Prev
      </button>

      {pages.map((page) => (
        page === 'ellipsis-left' || page === 'ellipsis-right' ? (
          <span
            key={page}
            className="px-2 py-1.5 text-sm font-medium text-slate-500"
            aria-hidden="true"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              page === safeCurrentPage
                ? 'bg-primary text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            aria-current={page === safeCurrentPage ? 'page' : undefined}
          >
            {page}
          </button>
        )
      ))}

      <button
        type="button"
        disabled={safeCurrentPage >= totalPages}
        onClick={() => onPageChange(safeCurrentPage + 1)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}

export default Pagination
