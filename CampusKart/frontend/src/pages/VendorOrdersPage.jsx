import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchVendorOrders,
  getOrderApiErrorMessage,
  updateOrderStatus,
} from "../api/orders";
import OrderStatusBadge from "../components/ui/OrderStatusBadge";
import Pagination from "../components/ui/Pagination";
import { useToast } from "../hooks/useToast";

const STATUS_FILTER_OPTIONS = [
  { label: "All Statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Shipped", value: "shipped" },
  { label: "Partially Shipped", value: "partially_shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

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

function formatLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAllowedTransitions(status) {
  const normalized = String(status || "pending")
    .trim()
    .toLowerCase();

  if (normalized === "pending") {
    return ["pending", "confirmed"];
  }

  if (normalized === "confirmed") {
    return ["confirmed", "shipped"];
  }

  if (normalized === "shipped") {
    return ["shipped", "delivered"];
  }

  if (normalized === "partially_shipped") {
    return ["partially_shipped", "shipped", "delivered"];
  }

  if (normalized === "delivered") {
    return ["delivered"];
  }

  return [normalized || "pending"];
}

function VendorOrdersPage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));
  const statusFilter = searchParams.get("status") || "all";

  const queryParams = useMemo(
    () => ({
      page: currentPage,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [currentPage, statusFilter],
  );

  const queryKey = useMemo(() => ["vendor-orders", queryParams], [queryParams]);

  const vendorOrdersQuery = useQuery({
    queryKey,
    queryFn: () => fetchVendorOrders(queryParams),
    staleTime: 30 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }) => updateOrderStatus(orderId, status),
    onMutate: async ({ orderId, status }) => {
      setUpdatingOrderId(String(orderId));
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (current) => {
        if (!current?.results) {
          return current;
        }

        return {
          ...current,
          results: current.results.map((order) => {
            const targetOrderId = order.statusUpdateId || order.id;
            if (String(targetOrderId) !== String(orderId)) {
              return order;
            }

            return {
              ...order,
              status,
            };
          }),
        };
      });

      return {
        previousData,
      };
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }

      showError(
        getOrderApiErrorMessage(error, "Could not update order status."),
      );
    },
    onSuccess: (_response, variables) => {
      showSuccess(`Order status updated to ${formatLabel(variables.status)}.`);
    },
    onSettled: () => {
      setUpdatingOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

  const orders = vendorOrdersQuery.data?.results || [];
  const totalPages = vendorOrdersQuery.data?.totalPages || 1;
  const totalCount = vendorOrdersQuery.data?.count || 0;

  const handlePageChange = (page) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    setSearchParams(next);
  };

  const handleFilterChange = (value) => {
    const next = new URLSearchParams(searchParams);

    if (value === "all") {
      next.delete("status");
    } else {
      next.set("status", value);
    }

    next.set("page", "1");
    setSearchParams(next);
  };

  if (vendorOrdersQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">Vendor Orders</h1>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`vendor-orders-skeleton-${index}`}
                className="h-14 animate-pulse rounded bg-slate-200"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (vendorOrdersQuery.isError) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">
          Could not load vendor orders
        </h1>
        <p className="mt-2 text-sm text-muted">
          {getOrderApiErrorMessage(
            vendorOrdersQuery.error,
            "Please try again in a moment.",
          )}
        </p>
        <button
          type="button"
          onClick={() => vendorOrdersQuery.refetch()}
          className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Retry
        </button>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">Vendor Orders</h1>
          <p className="mt-1 text-sm text-muted">
            Manage incoming orders from students.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-primary">
            No orders found
          </h2>
          <p className="mt-2 text-sm text-muted">
            New customer orders will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">Vendor Orders</h1>
            <p className="mt-1 text-sm text-muted">
              Track and update the status of customer orders.
            </p>
          </div>

          <label
            className="flex items-center gap-2 text-sm text-slate-700"
            htmlFor="vendor-order-status-filter"
          >
            <span>Status</span>
            <select
              id="vendor-order-status-filter"
              value={statusFilter}
              onChange={(event) => handleFilterChange(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-muted">
          {totalCount} order{totalCount === 1 ? "" : "s"} found
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Total
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Current
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Update Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {orders.map((order) => {
                const targetOrderId = order.statusUpdateId || order.id;
                const transitionOptions = getAllowedTransitions(order.status);
                const canChangeStatus =
                  transitionOptions.length > 1 && Boolean(targetOrderId);
                const isRowUpdating =
                  String(updatingOrderId) === String(targetOrderId);

                return (
                  <tr key={order.id || order.orderNumber}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      #{order.orderNumber || order.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {order.customerName || "Customer"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {formatDate(order.placedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {formatPrice(order.total)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={String(order.status || "pending").toLowerCase()}
                        disabled={!canChangeStatus || isRowUpdating}
                        onChange={(event) => {
                          const nextStatus = event.target.value;
                          if (nextStatus === order.status) {
                            return;
                          }

                          updateStatusMutation.mutate({
                            orderId: targetOrderId,
                            status: nextStatus,
                          });
                        }}
                        className="w-full max-w-[180px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        {transitionOptions.map((status) => (
                          <option
                            key={`${targetOrderId}-${status}`}
                            value={status}
                          >
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 md:hidden">
          {orders.map((order) => {
            const targetOrderId = order.statusUpdateId || order.id;
            const transitionOptions = getAllowedTransitions(order.status);
            const canChangeStatus =
              transitionOptions.length > 1 && Boolean(targetOrderId);
            const isRowUpdating =
              String(updatingOrderId) === String(targetOrderId);

            return (
              <article
                key={order.id || order.orderNumber}
                className="space-y-3 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Order #{order.orderNumber || order.id}
                    </p>
                    <p className="text-xs text-muted">
                      {order.customerName || "Customer"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDate(order.placedAt)}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span>Total</span>
                  <span className="font-semibold">
                    {formatPrice(order.total)}
                  </span>
                </div>

                <select
                  value={String(order.status || "pending").toLowerCase()}
                  disabled={!canChangeStatus || isRowUpdating}
                  onChange={(event) => {
                    const nextStatus = event.target.value;
                    if (nextStatus === order.status) {
                      return;
                    }

                    updateStatusMutation.mutate({
                      orderId: targetOrderId,
                      status: nextStatus,
                    });
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {transitionOptions.map((status) => (
                    <option
                      key={`${targetOrderId}-mobile-${status}`}
                      value={status}
                    >
                      {formatLabel(status)}
                    </option>
                  ))}
                </select>
              </article>
            );
          })}
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

export default VendorOrdersPage;
