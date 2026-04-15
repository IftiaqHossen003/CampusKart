import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchAdminRecentOrders,
  fetchAdminRevenueTimeseries,
  fetchAdminStats,
  getAdminApiErrorMessage,
} from "../api/admin";

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
    return "text-muted";
  }
  return delta > 0 ? "text-success" : "text-error";
}

function statusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "delivered") {
    return "bg-success/15 text-success";
  }
  if (normalized === "shipped" || normalized === "confirmed") {
    return "bg-accent/15 text-accent";
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
    queryFn: () => fetchAdminStats({ from_date: yesterday, to_date: yesterday }),
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
  const todayStats = useMemo(() => todayStatsQuery.data || {}, [todayStatsQuery.data]);
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
          summaryStats.total_users === undefined || summaryStats.total_users === null
            ? "N/A"
            : formatCount(summaryStats.total_users),
        delta:
          summaryStats.total_users === undefined || summaryStats.total_users === null
            ? null
            : calculateDelta(summaryStats.total_users, yesterdayStats.total_users),
      },
      {
        id: "active-vendors",
        title: "Active Vendors",
        value: formatCount(summaryStats.approved_vendors),
        delta: calculateDelta(summaryStats.approved_vendors, yesterdayStats.approved_vendors),
      },
      {
        id: "total-products",
        title: "Total Products",
        value: formatCount(summaryStats.total_products),
        delta: calculateDelta(summaryStats.total_products, yesterdayStats.total_products),
      },
      {
        id: "orders-today",
        title: "Orders Today",
        value: formatCount(todayStats.total_orders),
        delta: calculateDelta(todayStats.total_orders, yesterdayStats.total_orders),
      },
      {
        id: "total-revenue",
        title: "Total Revenue",
        value: formatMoney(summaryStats.collected_revenue),
        delta: calculateDelta(summaryStats.collected_revenue, yesterdayStats.collected_revenue),
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
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Loading dashboard metrics...</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`admin-dashboard-card-skeleton-${index}`}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      </section>
    );
  }

  if (statsQuery.isError) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">Could not load dashboard</h1>
        <p className="mt-2 text-sm text-muted">
          {getAdminApiErrorMessage(statsQuery.error, "Please try again shortly.")}
        </p>
        <button
          type="button"
          onClick={() => statsQuery.refetch()}
          className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Live overview of platform health, moderation queue, and recent activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article
            key={card.id}
            className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{card.title}</p>
            <p className="mt-2 text-2xl font-bold text-primary">{card.value}</p>
            <p className={`mt-2 text-xs font-semibold ${deltaTone(card.delta)}`}>
              {formatDelta(card.delta)} vs yesterday
            </p>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Revenue (Last 30 Days)</h2>
            <p className="text-xs text-muted">Successful payments only</p>
          </div>

          {chartQuery.isLoading ? (
            <div className="h-72 animate-pulse rounded-lg bg-slate-100" />
          ) : chartQuery.isError ? (
            <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {getAdminApiErrorMessage(chartQuery.error, "Could not load chart data.")}
            </p>
          ) : chartData.length === 0 ? (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
              No revenue data available for this period.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="shortDate"
                    interval={4}
                    tick={{ fontSize: 12, fill: "#64748B" }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#64748B" }}
                    tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => formatMoney(value)}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Bar dataKey="revenue" fill="#2E86AB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Pending Approvals</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-muted">Vendors</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {formatCount(summaryStats.pending_vendors)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-muted">Products</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {formatCount(summaryStats.pending_products)}
              </p>
            </div>
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-primary">Recent Orders</h2>

        {recentOrdersQuery.isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`admin-recent-order-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-slate-100"
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
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
            No recent orders available.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Order
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Buyer
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Total
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(recentOrdersQuery.data || []).map((order) => (
                  <tr key={order.id || order.order_number}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-800">
                      #{order.order_number || order.orderNumber || order.id}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {order.buyer_email || order.customerEmail || "-"}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {formatMoney(order.total_amount || order.total)}
                    </td>
                    <td className="px-3 py-2 text-sm text-muted">
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