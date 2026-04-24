import { Suspense, lazy, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAdminRecentOrders,
  fetchAdminRevenueTimeseries,
  fetchAdminStats,
  getAdminApiErrorMessage,
} from "../api/admin";

const AdminRevenueChart = lazy(
  () => import("../components/charts/AdminRevenueChart"),
);

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(toNumber(value));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateDelta(current, previous) {
  const currentValue = toNumber(current);
  const previousValue = toNumber(previous);

  if (previousValue === 0 && currentValue === 0) {
    return 0;
  }

  if (previousValue === 0) {
    return null;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function formatDelta(delta) {
  if (delta === null) {
    return "new";
  }

  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function deltaTone(delta) {
  if (delta === null || delta === 0) {
    return "text-slate-400";
  }
  return delta > 0 ? "text-success" : "text-error";
}

function statusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "delivered") {
    return "bg-success/15 text-success";
  }
  if (normalized === "shipped" || normalized === "confirmed") {
    return "bg-[var(--ck-accent)]/15 text-[var(--ck-accent)]";
  }
  if (normalized === "cancelled" || normalized === "refunded") {
    return "bg-error/15 text-error";
  }
  return "bg-warning/15 text-warning";
}

function AdminDashboardPage() {
  const today = useMemo(() => {
    const date = new Date();
    return toIsoDate(date);
  }, []);

  const yesterday = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return toIsoDate(date);
  }, []);

  const statsQuery = useQuery({
    queryKey: ["admin-dashboard", "stats"],
    queryFn: () => fetchAdminStats(),
    staleTime: 60 * 1000,
  });

  const yesterdayStatsQuery = useQuery({
    queryKey: ["admin-dashboard", "stats", "yesterday", yesterday],
    queryFn: () =>
      fetchAdminStats({ from_date: yesterday, to_date: yesterday }),
    staleTime: 60 * 1000,
  });

  const todayStatsQuery = useQuery({
    queryKey: ["admin-dashboard", "stats", "today", today],
    queryFn: () => fetchAdminStats({ from_date: today, to_date: today }),
    staleTime: 60 * 1000,
  });

  const chartQuery = useQuery({
    queryKey: ["admin-dashboard", "revenue-timeseries", 30],
    queryFn: () => fetchAdminRevenueTimeseries({ days: 30 }),
    staleTime: 5 * 60 * 1000,
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["admin-dashboard", "recent-orders"],
    queryFn: () => fetchAdminRecentOrders({ limit: 10 }),
    staleTime: 60 * 1000,
  });

  const summaryStats = useMemo(() => statsQuery.data || {}, [statsQuery.data]);
  const todayStats = useMemo(
    () => todayStatsQuery.data || {},
    [todayStatsQuery.data],
  );
  const yesterdayStats = useMemo(
    () => yesterdayStatsQuery.data || {},
    [yesterdayStatsQuery.data],
  );

  const cards = useMemo(
    () => [
      {
        id: "total-users",
        title: "Total Users",
        value:
          summaryStats.total_users === undefined ||
          summaryStats.total_users === null
            ? "N/A"
            : formatCount(summaryStats.total_users),
        delta:
          summaryStats.total_users === undefined ||
          summaryStats.total_users === null
            ? null
            : calculateDelta(
                summaryStats.total_users,
                yesterdayStats.total_users,
              ),
      },
      {
        id: "active-vendors",
        title: "Active Vendors",
        value: formatCount(summaryStats.approved_vendors),
        delta: calculateDelta(
          summaryStats.approved_vendors,
          yesterdayStats.approved_vendors,
        ),
      },
      {
        id: "total-products",
        title: "Total Products",
        value: formatCount(summaryStats.total_products),
        delta: calculateDelta(
          summaryStats.total_products,
          yesterdayStats.total_products,
        ),
      },
      {
        id: "orders-today",
        title: "Orders Today",
        value: formatCount(todayStats.total_orders),
        delta: calculateDelta(
          todayStats.total_orders,
          yesterdayStats.total_orders,
        ),
      },
      {
        id: "total-revenue",
        title: "Total Revenue",
        value: formatMoney(summaryStats.collected_revenue),
        delta: calculateDelta(
          summaryStats.collected_revenue,
          yesterdayStats.collected_revenue,
        ),
      },
      {
        id: "total-paid-out",
        title: "Total Paid Out",
        value: formatMoney(summaryStats.total_paid_out),
        delta: calculateDelta(
          summaryStats.total_paid_out,
          yesterdayStats.total_paid_out,
        ),
      },
      {
        id: "admin-profit",
        title: "Admin Profit",
        value: formatMoney(summaryStats.admin_profit),
        delta: calculateDelta(
          summaryStats.admin_profit,
          yesterdayStats.admin_profit,
        ),
      },
    ],
    [summaryStats, todayStats, yesterdayStats],
  );

  const chartData = useMemo(() => {
    return (chartQuery.data || []).map((point) => ({
      ...point,
      shortDate: new Date(point.date).toLocaleDateString("en-BD", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [chartQuery.data]);

  if (statsQuery.isLoading) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Loading dashboard metrics...
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={`admin-dashboard-card-skeleton-${index}`}
              className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      </section>
    );
  }

  if (statsQuery.isError) {
    return (
      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-xl font-semibold text-white">
          Could not load dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {getAdminApiErrorMessage(
            statsQuery.error,
            "Please try again shortly.",
          )}
        </p>
        <button
          type="button"
          onClick={() => statsQuery.refetch()}
          className="mt-5 rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live overview of platform health, moderation queue, and recent
          activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-7">
        {cards.map((card) => (
          <article
            key={card.id}
            className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {card.title}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
            <p
              className={`mt-2 text-xs font-semibold ${deltaTone(card.delta)}`}
            >
              {formatDelta(card.delta)} vs yesterday
            </p>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Revenue (Last 30 Days)
            </h2>
            <p className="text-xs text-slate-400">Successful payments only</p>
          </div>

          {chartQuery.isLoading ? (
            <div className="h-72 animate-pulse rounded-lg bg-white/5" />
          ) : chartQuery.isError ? (
            <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {getAdminApiErrorMessage(
                chartQuery.error,
                "Could not load chart data.",
              )}
            </p>
          ) : chartData.length === 0 ? (
            <p className="rounded-md bg-white/5 px-3 py-2 text-sm text-slate-400">
              No revenue data available for this period.
            </p>
          ) : (
            <div className="h-72">
              <Suspense
                fallback={<div className="h-full animate-pulse rounded-lg bg-white/5" />}
              >
                <AdminRevenueChart data={chartData} />
              </Suspense>
            </div>
          )}
        </article>

        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <h2 className="text-lg font-semibold text-white">
            Pending Approvals
          </h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Vendors
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatCount(summaryStats.pending_vendors)}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Products
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatCount(summaryStats.pending_products)}
              </p>
            </div>
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
        <h2 className="text-lg font-semibold text-white">Recent Orders</h2>

        {recentOrdersQuery.isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`admin-recent-order-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-white/5"
              />
            ))}
          </div>
        ) : recentOrdersQuery.isError ? (
          <p className="mt-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getAdminApiErrorMessage(
              recentOrdersQuery.error,
              "Could not load recent orders.",
            )}
          </p>
        ) : (recentOrdersQuery.data || []).length === 0 ? (
          <p className="mt-4 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-400">
            No recent orders available.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-[var(--ck-surface-deep)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Order
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Buyer
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Total
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[var(--ck-surface)]">
                {(recentOrdersQuery.data || []).map((order) => (
                  <tr key={order.id || order.order_number}>
                    <td className="px-3 py-2 text-sm font-medium text-white">
                      #{order.order_number || order.orderNumber || order.id}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-400">
                      {order.buyer_email || order.customerEmail || "-"}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-400">
                      {formatMoney(order.total_amount || order.total)}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-400">
                      {formatDate(order.created_at || order.placedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}

export default AdminDashboardPage;




