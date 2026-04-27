import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchStudentOrders, getOrderApiErrorMessage } from '../api/orders'
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

function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPage = Math.max(1, Number(searchParams.get('page') || 1))

  const ordersQuery = useQuery({
    queryKey: ['student-orders', currentPage],
    queryFn: () => fetchStudentOrders({ page: currentPage }),
    staleTime: 30 * 1000,
  })

  const orders = ordersQuery.data?.results || []
  const totalPages = ordersQuery.data?.totalPages || 1
  const totalCount = ordersQuery.data?.count || 0

  const handlePageChange = (page) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(page))
    setSearchParams(next)
  }

  if (ordersQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-white">My Orders</h1>
        </div>
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`orders-skeleton-${index}`} className="h-14 animate-pulse rounded bg-white/10" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (ordersQuery.isError) {
    return (
      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-xl font-semibold text-white">Could not load orders</h1>
        <p className="mt-2 text-sm text-slate-400">
          {getOrderApiErrorMessage(ordersQuery.error, 'Please try again in a moment.')}
        </p>
        <button
          type="button"
          onClick={() => ordersQuery.refetch()}
          className="mt-5 rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
        >
          Retry
        </button>
      </section>
    )
  }

  if (orders.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-white/20 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-2xl font-bold text-white">No orders yet</h1>
        <p className="mt-2 text-sm text-slate-400">Once you place an order, it will appear here.</p>
        <Link
          to="/shop"
          className="mt-5 inline-flex rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
        >
          Start Shopping
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">My Orders</h1>
        <p className="mt-1 text-sm text-slate-400">Track and review your past purchases.</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)]">
        <div className="border-b border-white/10 px-4 py-3 text-sm text-slate-400">
          {totalCount} order{totalCount === 1 ? '' : 's'} found
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-[var(--ck-surface-deep)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Items</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 bg-[var(--ck-surface)]">
              {orders.map((order) => {
                const orderReference = order.orderNumber || order.id
                return (
                  <tr key={orderReference}>
                    <td className="px-4 py-3 text-sm font-medium text-white">#{order.orderNumber || order.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatDate(order.placedAt)}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{order.itemCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatPrice(order.total)}</td>
                    <td className="px-4 py-3 text-sm">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Link
                        to={`/orders/${encodeURIComponent(orderReference)}`}
                        className="font-medium text-[var(--ck-accent)] hover:underline"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-white/10 md:hidden">
          {orders.map((order) => {
            const orderReference = order.orderNumber || order.id
            return (
              <article key={orderReference} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Order #{order.orderNumber || order.id}</p>
                    <p className="text-xs text-slate-400">{formatDate(order.placedAt)}</p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>{order.itemCount} item(s)</span>
                  <span className="font-semibold">{formatPrice(order.total)}</span>
                </div>

                <Link
                  to={`/orders/${encodeURIComponent(orderReference)}`}
                  className="inline-flex text-sm font-medium text-[var(--ck-accent)] hover:underline"
                >
                  View Details
                </Link>
              </article>
            )
          })}
        </div>

        <div className="p-4">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
        </div>
      </div>
    </section>
  )
}

export default OrdersPage




