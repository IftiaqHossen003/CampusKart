import { Suspense, lazy, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  exportVendorPayoutsCsv,
  fetchVendorAnalyticsOverview,
  fetchVendorAnalyticsPayouts,
  fetchVendorAnalyticsProducts,
  fetchVendorAnalyticsRevenue,
  getVendorAnalyticsErrorMessage,
} from "../api/vendorAnalytics";
import OrderStatusBadge from "../components/ui/OrderStatusBadge";
import { useToast } from "../hooks/useToast";

const VendorRevenueChart = lazy(
  () => import("../components/charts/VendorRevenueChart"),
);

const PERIOD_OPTIONS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
];

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

function formatDate(value) {
  if (!value) {
    return "N/A";
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

function calculateTrend(current, previous) {
  const currentValue = toNumber(current);
  const previousValue = toNumber(previous);

  if (currentValue === previousValue) {
    return { direction: "flat", delta: 0 };
  }

  if (previousValue === 0) {
    return {
      direction: currentValue > 0 ? "up" : "flat",
      delta: null,
    };
  }

  const delta =
    ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  if (delta > 0) {
    return { direction: "up", delta };
  }
  return { direction: "down", delta };
}

function trendClassName(direction) {
  if (direction === "up") {
    return "text-success";
  }
  if (direction === "down") {
    return "text-error";
  }
  return "text-muted";
}

function trendArrow(direction) {
  if (direction === "up") {
    return "↑";
  }
  if (direction === "down") {
    return "↓";
  }
  return "•";
}

function trendText(trend) {
  if (trend.delta === null) {
    return "new vs last month";
  }

  const sign = trend.delta > 0 ? "+" : "";
  return `${sign}${trend.delta.toFixed(1)}% vs last month`;
}

function VendorAnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const { showError, showSuccess } = useToast();

  const overviewQuery = useQuery({
    queryKey: ["vendor-analytics", "overview"],
    queryFn: () => fetchVendorAnalyticsOverview(),
    staleTime: 60 * 1000,
  });

  const revenueQuery = useQuery({
    queryKey: ["vendor-analytics", "revenue", period],
    queryFn: () => fetchVendorAnalyticsRevenue({ period }),
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

  const exportCsvMutation = useMutation({
    mutationFn: () => exportVendorPayoutsCsv(),
    onSuccess: () => {
      showSuccess("Payout CSV downloaded.");
    },
    onError: (error) => {
      showError(
        getVendorAnalyticsErrorMessage(error, "Could not download CSV."),
      );
    },
  });

  const cards = useMemo(() => {
    const overview = overviewQuery.data || {};

    const revenueTrend = calculateTrend(
      overview.this_month_revenue,
      overview.last_month_revenue,
    );
    const orderTrend = calculateTrend(
      overview.this_month_orders,
      overview.last_month_orders,
    );
    const ratingTrend = calculateTrend(
      overview.this_month_avg_rating,
      overview.last_month_avg_rating,
    );
    const pendingTrend = calculateTrend(
      overview.this_month_pending_payout,
      overview.last_month_pending_payout,
    );

    return [
      {
        id: "this-month-revenue",
        title: "This Month Revenue",
        value: formatMoney(overview.this_month_revenue),
        trend: revenueTrend,
      },
      {
        id: "total-orders",
        title: "Total Orders",
        value: formatCount(overview.total_orders),
        trend: orderTrend,
      },
      {
        id: "avg-rating",
        title: "Avg Rating",
        value: formatRating(overview.avg_rating),
        trend: ratingTrend,
      },
      {
        id: "pending-payout",
        title: "Pending Payout",
        value: formatMoney(overview.pending_payout_amount),
        trend: pendingTrend,
      },
    ];
  }, [overviewQuery.data]);

  const chartData = useMemo(
    () =>
      (revenueQuery.data || []).map((point) => ({
        ...point,
        shortDate: shortDate(point.date),
      })),
    [revenueQuery.data],
  );

  const topProducts = useMemo(() => {
    const rows = [...(productsQuery.data || [])];
    rows.sort((a, b) => toNumber(b.revenue) - toNumber(a.revenue));
    return rows.slice(0, 10);
  }, [productsQuery.data]);

  const payouts = payoutsQuery.data?.payouts || [];

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Vendor Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Performance insights for revenue, products, and payouts.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">Overview</h2>
        </div>

        {overviewQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`vendor-analytics-overview-skeleton-${index}`}
                className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
        ) : overviewQuery.isError ? (
          <div className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getVendorAnalyticsErrorMessage(
              overviewQuery.error,
              "Could not load overview cards.",
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article
                key={card.id}
                className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {card.title}
                </p>
                <p className="mt-2 text-2xl font-bold text-primary">
                  {card.value}
                </p>
                <p
                  className={`mt-2 text-xs font-semibold ${trendClassName(card.trend.direction)}`}
                >
                  {trendArrow(card.trend.direction)} {trendText(card.trend)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">Revenue Trend</h2>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  period === option.value
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {revenueQuery.isLoading ? (
          <div className="h-72 animate-pulse rounded-lg bg-slate-100" />
        ) : revenueQuery.isError ? (
          <div className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getVendorAnalyticsErrorMessage(
              revenueQuery.error,
              "Could not load revenue chart.",
            )}
          </div>
        ) : chartData.length === 0 ? (
          <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
            No revenue data available for this period.
          </div>
        ) : (
          <div className="h-72">
            <Suspense
              fallback={<div className="h-full animate-pulse rounded-lg bg-slate-100" />}
            >
              <VendorRevenueChart data={chartData} />
            </Suspense>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-primary">Top Products</h2>

        {productsQuery.isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`vendor-analytics-products-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-slate-100"
              />
            ))}
          </div>
        ) : productsQuery.isError ? (
          <div className="mt-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getVendorAnalyticsErrorMessage(
              productsQuery.error,
              "Could not load top products.",
            )}
          </div>
        ) : topProducts.length === 0 ? (
          <div className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
            No product analytics available yet.
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Views
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Sold
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                      Rating
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {topProducts.map((product, index) => (
                    <tr key={`${product.name}-${index}`}>
                      <td className="px-4 py-3 text-sm text-slate-800">
                        <div className="flex items-center gap-3">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-slate-200" />
                          )}
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatCount(product.views)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatCount(product.sold)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatMoney(product.revenue)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatRating(product.rating)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 md:hidden">
              {topProducts.map((product, index) => (
                <article
                  key={`vendor-analytics-product-mobile-${index}`}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-slate-200" />
                    )}
                    <p className="text-sm font-semibold text-slate-800">
                      {product.name}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
                    <p>Views: {formatCount(product.views)}</p>
                    <p>Sold: {formatCount(product.sold)}</p>
                    <p>Revenue: {formatMoney(product.revenue)}</p>
                    <p>Rating: {formatRating(product.rating)}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">Payouts</h2>
          <button
            type="button"
            onClick={() => exportCsvMutation.mutate()}
            disabled={
              exportCsvMutation.isPending ||
              payoutsQuery.isLoading ||
              payouts.length === 0
            }
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportCsvMutation.isPending ? "Downloading..." : "Download CSV"}
          </button>
        </div>

        {payoutsQuery.isLoading ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`vendor-analytics-payout-summary-skeleton-${index}`}
                  className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`vendor-analytics-payout-row-skeleton-${index}`}
                  className="h-12 animate-pulse rounded bg-slate-100"
                />
              ))}
            </div>
          </>
        ) : payoutsQuery.isError ? (
          <div className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getVendorAnalyticsErrorMessage(
              payoutsQuery.error,
              "Could not load payouts analytics.",
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted">
                  Total Earned
                </p>
                <p className="mt-1 text-lg font-semibold text-primary">
                  {formatMoney(payoutsQuery.data?.total_earned)}
                </p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted">
                  Commission Paid
                </p>
                <p className="mt-1 text-lg font-semibold text-primary">
                  {formatMoney(payoutsQuery.data?.total_commission_paid)}
                </p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted">
                  Net Received
                </p>
                <p className="mt-1 text-lg font-semibold text-primary">
                  {formatMoney(payoutsQuery.data?.total_net_received)}
                </p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted">
                  Pending
                </p>
                <p className="mt-1 text-lg font-semibold text-primary">
                  {formatMoney(payoutsQuery.data?.total_pending_amount)}
                </p>
              </article>
            </div>

            {payouts.length === 0 ? (
              <div className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
                No payout records available.
              </div>
            ) : (
              <>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          Order #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          Gross
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          Commission %
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          Net
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {payouts.map((payout) => (
                        <tr key={`${payout.order_number}-${payout.date}`}>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">
                            #{payout.order_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {formatDate(payout.date)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {formatMoney(payout.gross)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {toNumber(payout.commission_percentage).toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {formatMoney(payout.net)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <OrderStatusBadge status={payout.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-3 md:hidden">
                  {payouts.map((payout) => (
                    <article
                      key={`vendor-analytics-payout-mobile-${payout.order_number}-${payout.date}`}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          #{payout.order_number}
                        </p>
                        <OrderStatusBadge status={payout.status} />
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {formatDate(payout.date)}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
                        <p>Gross: {formatMoney(payout.gross)}</p>
                        <p>
                          Commission:{" "}
                          {toNumber(payout.commission_percentage).toFixed(2)}%
                        </p>
                        <p>Net: {formatMoney(payout.net)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </section>
  );
}

export default VendorAnalyticsPage;
