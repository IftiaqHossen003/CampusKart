import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  fetchVendorAnalyticsOverview,
  fetchVendorAnalyticsPayouts,
  fetchVendorAnalyticsProducts,
  fetchVendorAnalyticsRevenue,
  getVendorAnalyticsErrorMessage,
} from "../api/vendorAnalytics";

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

function formatRating(value) {
  return toNumber(value).toFixed(2);
}

function shortDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("en-BD", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

const QUICK_ACTIONS = [
  { title: "Manage Products", to: "/vendor/products" },
  { title: "View Orders", to: "/vendor/orders" },
  { title: "Open Analytics", to: "/vendor/analytics" },
  { title: "Check Payouts", to: "/vendor/payouts" },
];

function VendorDashboardPage() {
  const overviewQuery = useQuery({
    queryKey: ["vendor-analytics", "overview"],
    queryFn: () => fetchVendorAnalyticsOverview(),
    staleTime: 60 * 1000,
  });

  const revenueQuery = useQuery({
    queryKey: ["vendor-analytics", "revenue", "30d"],
    queryFn: () => fetchVendorAnalyticsRevenue({ period: "30d" }),
    staleTime: 60 * 1000,
  });

  const productsQuery = useQuery({
    queryKey: ["vendor-analytics", "products"],
    queryFn: () => fetchVendorAnalyticsProducts(),
    staleTime: 60 * 1000,
  });

  const payoutsQuery = useQuery({
    queryKey: ["vendor-analytics", "payouts"],
    queryFn: () => fetchVendorAnalyticsPayouts(),
    staleTime: 60 * 1000,
  });

  const isLoading =
    overviewQuery.isLoading ||
    revenueQuery.isLoading ||
    productsQuery.isLoading ||
    payoutsQuery.isLoading;

  const error =
    overviewQuery.error ||
    revenueQuery.error ||
    productsQuery.error ||
    payoutsQuery.error;

  const topProducts = useMemo(() => {
    const rows = [...(productsQuery.data || [])];
    rows.sort((a, b) => toNumber(b.revenue) - toNumber(a.revenue));
    return rows.slice(0, 5);
  }, [productsQuery.data]);

  const recentRevenue = useMemo(() => {
    const rows = [...(revenueQuery.data || [])];
    return rows.slice(-10).reverse();
  }, [revenueQuery.data]);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-6">
          <div className="h-8 w-56 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-white/10" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`vendor-dashboard-card-skeleton-${index}`}
              className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-xl font-semibold text-white">
          Could not load dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {getVendorAnalyticsErrorMessage(
            error,
            "Please try again in a moment.",
          )}
        </p>
      </section>
    );
  }

  const overview = overviewQuery.data || {};
  const payouts = payoutsQuery.data || {};

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Vendor Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Quick overview of revenue, payouts, and product performance.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            This Month Revenue
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatMoney(overview.this_month_revenue)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Orders
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatCount(overview.total_orders)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Avg Rating
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatRating(overview.avg_rating)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pending Payout
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatMoney(overview.pending_payout_amount)}
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3 text-sm font-semibold text-white transition hover:border-[var(--ck-accent)]"
            >
              {action.title}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Payout Status</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <article className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Total Earned
              </p>
              <p className="mt-1 text-base font-semibold text-white">
                {formatMoney(payouts.total_earned)}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Net Received
              </p>
              <p className="mt-1 text-base font-semibold text-white">
                {formatMoney(payouts.total_net_received)}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Commission Paid
              </p>
              <p className="mt-1 text-base font-semibold text-white">
                {formatMoney(payouts.total_commission_paid)}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Pending
              </p>
              <p className="mt-1 text-base font-semibold text-white">
                {formatMoney(payouts.total_pending_amount)}
              </p>
            </article>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">
            Recent Revenue (30d)
          </h2>
          {recentRevenue.length === 0 ? (
            <p className="mt-4 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-400">
              No revenue data available.
            </p>
          ) : (
            <div className="mt-4 max-h-64 space-y-2 overflow-auto pr-1">
              {recentRevenue.map((point) => (
                <div
                  key={point.date}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-[var(--ck-surface-deep)] px-3 py-2 text-sm"
                >
                  <p className="text-slate-400">{shortDate(point.date)}</p>
                  <p className="font-semibold text-white">
                    {formatMoney(point.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Top Products</h2>
        {topProducts.length === 0 ? (
          <p className="mt-4 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-400">
            No product analytics available yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {topProducts.map((product, index) => (
              <article
                key={`${product.name}-${index}`}
                className="rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {product.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    Revenue: {formatMoney(product.revenue)}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <p>Views: {formatCount(product.views)}</p>
                  <p>Sold: {formatCount(product.sold)}</p>
                  <p>Rating: {formatRating(product.rating)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export default VendorDashboardPage;
