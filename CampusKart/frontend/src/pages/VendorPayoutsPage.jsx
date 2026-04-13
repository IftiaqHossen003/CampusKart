import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { fetchPayouts, getPaymentApiErrorMessage } from '../api/payments'
import OrderStatusBadge from '../components/ui/OrderStatusBadge'
import Pagination from '../components/ui/Pagination'

function toNumber(value) {
  const number = Number(value)
  return Number.isNaN(number) ? 0 : number
}

function formatPrice(value) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(toNumber(value))
}

function formatDate(value) {
  if (!value) {
    return 'N/A'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function VendorPayoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPage = Math.max(1, Number(searchParams.get('page') || 1))

  const payoutsQuery = useQuery({
    queryKey: ['vendor-payouts', currentPage],
    queryFn: () => fetchPayouts({ page: currentPage }),
    staleTime: 30 * 1000,
  })

  const payouts = payoutsQuery.data?.results || []
  const totalPages = payoutsQuery.data?.totalPages || 1
  const totalCount = payoutsQuery.data?.count || 0

  const handlePageChange = (page) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(page))
    setSearchParams(next)
  }

  if (payoutsQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">Vendor Payouts</h1>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`vendor-payouts-skeleton-${index}`} className="h-12 animate-pulse rounded bg-slate-200" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (payoutsQuery.isError) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">Could not load payouts</h1>
        <p className="mt-2 text-sm text-muted">
          {getPaymentApiErrorMessage(payoutsQuery.error, 'Please try again in a moment.')}
        </p>
        <button
          type="button"
          onClick={() => payoutsQuery.refetch()}
          className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Retry
        </button>
      </section>
    )
  }

  if (payouts.length === 0) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">Vendor Payouts</h1>
          <p className="mt-1 text-sm text-muted">Track payout status for delivered orders.</p>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-primary">No payouts found</h2>
          <p className="mt-2 text-sm text-muted">Payout records will appear after payment lifecycle milestones.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Vendor Payouts</h1>
        <p className="mt-1 text-sm text-muted">{totalCount} payout{totalCount === 1 ? '' : 's'} found.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Net Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Release</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">#{payout.orderNumber || payout.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatPrice(payout.netAmount)}</td>
                  <td className="px-4 py-3 text-sm">
                    <OrderStatusBadge status={payout.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDate(payout.releaseAt)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDate(payout.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 md:hidden">
          {payouts.map((payout) => (
            <article key={payout.id} className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">Order #{payout.orderNumber || payout.id}</p>
                <OrderStatusBadge status={payout.status} />
              </div>
              <p className="text-sm text-slate-700">Net: {formatPrice(payout.netAmount)}</p>
              <p className="text-xs text-muted">Release: {formatDate(payout.releaseAt)}</p>
              <p className="text-xs text-muted">Paid: {formatDate(payout.paidAt)}</p>
            </article>
          ))}
        </div>

        <div className="p-4">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
        </div>
      </div>
    </section>
  )
}

export default VendorPayoutsPage
