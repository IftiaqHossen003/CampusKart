function buildPages(currentPage, totalPages) {
  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, currentPage + 2)
  const pages = []

  for (let page = start; page <= end; page += 1) {
    pages.push(page)
  }

  return pages
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) {
    return null
  }

  const pages = buildPages(currentPage, totalPages)

  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Product pagination">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Prev
      </button>

      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            page === currentPage
              ? 'bg-primary text-white'
              : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </button>
      ))}

      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}

export default Pagination
