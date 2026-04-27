import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { fetchAdminStats } from "../api/admin";
import {
  fetchPayouts,
  getPaymentApiErrorMessage,
  markPayoutPaid,
} from "../api/payments";
import OrderStatusBadge from "../components/ui/OrderStatusBadge";
import Pagination from "../components/ui/Pagination";
import { useToast } from "../hooks/useToast";

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
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

function AdminPayoutsPage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));

  const payoutsQuery = useQuery({
    queryKey: ["admin-payouts", currentPage],
    queryFn: () => fetchPayouts({ page: currentPage }),
    staleTime: 30 * 1000,
  });

  const statsQuery = useQuery({
    queryKey: ["admin-dashboard", "stats"],
    queryFn: () => fetchAdminStats(),
    staleTime: 60 * 1000,
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ payoutId, payoutReference }) =>
      markPayoutPaid(payoutId, payoutReference),
    onSuccess: () => {
      showSuccess("Payout marked as paid.");
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-payouts"] });
    },
    onError: (error) => {
      showError(
        getPaymentApiErrorMessage(error, "Could not mark payout as paid."),
      );
    },
  });

  const payouts = payoutsQuery.data?.results || [];
  const totalPages = payoutsQuery.data?.totalPages || 1;
  const totalCount = payoutsQuery.data?.count || 0;
  const totalPaidOut = statsQuery.data?.total_paid_out;
  const adminProfit = statsQuery.data?.admin_profit;

  const handlePageChange = (page) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    setSearchParams(next);
  };

  const canMarkPaid = (status) => {
    const normalized = String(status || "").toLowerCase();
    return (
      normalized === "ready" ||
      normalized === "pending" ||
      normalized === "failed"
    );
  };

  const handleMarkPaid = (payout) => {
    const payoutReference = window.prompt(
      "Enter payout reference (optional):",
      payout.payoutReference || "",
    );
    if (payoutReference === null) {
      return;
    }

    markPaidMutation.mutate({
      payoutId: payout.id,
      payoutReference,
    });
  };

  if (payoutsQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-white">Admin Payouts</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/5" />
        </div>
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`admin-payouts-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-white/10"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (payoutsQuery.isError) {
    return (
      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-xl font-semibold text-white">
          Could not load payouts
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {getPaymentApiErrorMessage(
            payoutsQuery.error,
            "Please try again in a moment.",
          )}
        </p>
        <button
          type="button"
          onClick={() => payoutsQuery.refetch()}
          className="mt-5 rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
        >
          Retry
        </button>
      </section>
    );
  }

  if (payouts.length === 0) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-white">Admin Payouts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage payout release and completion lifecycle.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Paid Out
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {statsQuery.isError ? "N/A" : formatPrice(totalPaidOut)}
            </p>
          </article>
          <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Admin Profit
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {statsQuery.isError ? "N/A" : formatPrice(adminProfit)}
            </p>
          </article>
        </div>

        <div className="rounded-xl border border-dashed border-white/20 bg-[var(--ck-surface)] p-8 text-center">
          <h2 className="text-xl font-semibold text-white">No payouts found</h2>
          <p className="mt-2 text-sm text-slate-400">
            Payout rows will appear as orders move through payment lifecycle.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Admin Payouts</h1>
        <p className="mt-1 text-sm text-slate-400">
          {totalCount} payout{totalCount === 1 ? "" : "s"} found.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Paid Out
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {statsQuery.isLoading || statsQuery.isError
              ? "N/A"
              : formatPrice(totalPaidOut)}
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Admin Profit
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {statsQuery.isLoading || statsQuery.isError
              ? "N/A"
              : formatPrice(adminProfit)}
          </p>
        </article>
      </div>

      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-[var(--ck-surface-deep)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Vendor
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Net Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Reference
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 bg-[var(--ck-surface)]">
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    #{payout.orderNumber || payout.id}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {payout.vendorName || "Vendor"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {formatPrice(payout.netAmount)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <OrderStatusBadge status={payout.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {payout.payoutReference || "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => handleMarkPaid(payout)}
                      disabled={
                        !canMarkPaid(payout.status) ||
                        markPaidMutation.isPending
                      }
                      className="rounded-md bg-[var(--ck-accent)] px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-white/20"
                    >
                      Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-white/10 md:hidden">
          {payouts.map((payout) => (
            <article key={payout.id} className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">
                  Order #{payout.orderNumber || payout.id}
                </p>
                <OrderStatusBadge status={payout.status} />
              </div>
              <p className="text-sm text-slate-400">
                Vendor: {payout.vendorName || "Vendor"}
              </p>
              <p className="text-sm text-slate-400">
                Net: {formatPrice(payout.netAmount)}
              </p>
              <p className="text-xs text-slate-400">
                Reference: {payout.payoutReference || "-"}
              </p>
              <p className="text-xs text-slate-400">
                Created: {formatDate(payout.createdAt)}
              </p>

              <button
                type="button"
                onClick={() => handleMarkPaid(payout)}
                disabled={
                  !canMarkPaid(payout.status) || markPaidMutation.isPending
                }
                className="rounded-md bg-[var(--ck-accent)] px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-white/20"
              >
                Mark Paid
              </button>
            </article>
          ))}
        </div>

        <div className="p-4">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    </section>
  );
}

export default AdminPayoutsPage;
