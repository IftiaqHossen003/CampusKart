import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  fetchStudentOrders,
  getOrderApiErrorMessage,
  updateOrderStatus,
} from "../api/orders";
import OrderStatusBadge from "../components/ui/OrderStatusBadge";
import Pagination from "../components/ui/Pagination";
import { useToast } from "../hooks/useToast";

const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "partially_shipped", label: "Partially Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function formatStatusLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAllowedTransitions(status) {
  const normalized = normalizeText(status);

  if (normalized === "pending") {
    return ["pending", "confirmed"];
  }

  if (normalized === "confirmed") {
    return ["confirmed", "shipped"];
  }

  if (normalized === "shipped") {
    return ["shipped", "delivered"];
  }

  return [normalized || "pending"];
}

function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const status = searchParams.get("status") || "all";
  const search = (searchParams.get("search") || "").trim();

  const ordersQuery = useQuery({
    queryKey: ["admin-orders", page],
    queryFn: () => fetchStudentOrders({ page }),
    staleTime: 30 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, nextStatus }) =>
      updateOrderStatus(orderId, nextStatus),
    onMutate: ({ orderId }) => {
      setUpdatingOrderId(String(orderId));
    },
    onSuccess: (_data, variables) => {
      showSuccess(
        `Order status updated to ${formatStatusLabel(variables.nextStatus)}.`,
      );
    },
    onError: (error) => {
      showError(
        getOrderApiErrorMessage(error, "Could not update order status."),
      );
    },
    onSettled: () => {
      setUpdatingOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard", "stats"] });
      queryClient.invalidateQueries({
        queryKey: ["admin-dashboard", "recent-orders"],
      });
    },
  });

  const totalPages = ordersQuery.data?.totalPages || 1;

  const filteredOrders = useMemo(() => {
    const allOrders = ordersQuery.data?.results || [];
    const normalizedSearch = normalizeText(search);

    return allOrders.filter((order) => {
      const matchesStatus =
        status === "all" ||
        normalizeText(order.status) === normalizeText(status);

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        order.orderNumber,
        order.customerName,
        order.customerEmail,
        order.deliveryAddress?.display,
      ]
        .map((value) => normalizeText(value))
        .join(" ");

      return haystack.includes(normalizedSearch);
    });
  }, [ordersQuery.data, search, status]);

  const handleStatusFilterChange = (nextStatus) => {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === "all") {
      next.delete("status");
    } else {
      next.set("status", nextStatus);
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  const handleSearchChange = (event) => {
    const next = new URLSearchParams(searchParams);
    const value = event.target.value;

    if (value.trim()) {
      next.set("search", value);
    } else {
      next.delete("search");
    }

    next.set("page", "1");
    setSearchParams(next);
  };

  const handlePageChange = (nextPage) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  };

  if (ordersQuery.isLoading) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-white">Admin Orders</h1>
          <p className="mt-1 text-sm text-slate-400">Loading orders...</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`admin-orders-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-white/5"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (ordersQuery.isError) {
    return (
      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-xl font-semibold text-white">
          Could not load orders
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {getOrderApiErrorMessage(
            ordersQuery.error,
            "Please try again in a moment.",
          )}
        </p>
        <button
          type="button"
          onClick={() => ordersQuery.refetch()}
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
        <h1 className="text-2xl font-bold text-white">Admin Orders</h1>
        <p className="mt-1 text-sm text-slate-400">
          Monitor and progress orders across all buyers and vendors.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search order number, customer, or address"
            className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
          />
          <select
            value={status}
            onChange={(event) => handleStatusFilterChange(event.target.value)}
            className="rounded-md border border-white/20 bg-[var(--ck-surface)] px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
          >
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Showing {filteredOrders.length} order
          {filteredOrders.length === 1 ? "" : "s"} on this page.
        </p>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[var(--ck-surface)] p-8 text-center">
          <h2 className="text-lg font-semibold text-white">
            No orders found
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Try a different filter or search query.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-[var(--ck-surface-deep)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Next Step
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[var(--ck-surface)]">
                {filteredOrders.map((order) => {
                  const targetOrderId = order.statusUpdateId || order.id;
                  const transitions = getAllowedTransitions(order.status);
                  const currentStatus = normalizeText(
                    order.status || "pending",
                  );
                  const isUpdating =
                    String(updatingOrderId) === String(targetOrderId);
                  const canChange =
                    transitions.length > 1 && Boolean(targetOrderId);

                  return (
                    <tr key={order.id || order.orderNumber}>
                      <td className="px-4 py-3 text-sm font-medium text-white">
                        #{order.orderNumber || order.id}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        <p>{order.customerName || "Customer"}</p>
                        <p className="text-xs text-slate-400">
                          {order.customerEmail || "-"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatDate(order.placedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {order.itemCount || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatPrice(order.total)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={currentStatus}
                          disabled={!canChange || isUpdating}
                          onChange={(event) => {
                            const nextStatus = event.target.value;
                            if (nextStatus === currentStatus) {
                              return;
                            }

                            updateStatusMutation.mutate({
                              orderId: targetOrderId,
                              nextStatus,
                            });
                          }}
                          className="w-full max-w-[180px] rounded-md border border-white/20 bg-[var(--ck-surface)] px-2 py-1.5 text-sm focus:border-[var(--ck-accent)] focus:outline-none disabled:cursor-not-allowed disabled:bg-white/5"
                        >
                          {transitions.map((option) => (
                            <option
                              key={`${targetOrderId}-${option}`}
                              value={option}
                            >
                              {formatStatusLabel(option)}
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

          <div className="divide-y divide-white/10 md:hidden">
            {filteredOrders.map((order) => {
              const targetOrderId = order.statusUpdateId || order.id;
              const transitions = getAllowedTransitions(order.status);
              const currentStatus = normalizeText(order.status || "pending");
              const isUpdating =
                String(updatingOrderId) === String(targetOrderId);
              const canChange =
                transitions.length > 1 && Boolean(targetOrderId);

              return (
                <article
                  key={order.id || order.orderNumber}
                  className="space-y-3 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Order #{order.orderNumber || order.id}
                      </p>
                      <p className="text-xs text-slate-400">
                        {order.customerName || "Customer"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {order.customerEmail || "-"}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <p>Date: {formatDate(order.placedAt)}</p>
                    <p>Items: {order.itemCount || 0}</p>
                    <p className="col-span-2">
                      Total: {formatPrice(order.total)}
                    </p>
                  </div>

                  <select
                    value={currentStatus}
                    disabled={!canChange || isUpdating}
                    onChange={(event) => {
                      const nextStatus = event.target.value;
                      if (nextStatus === currentStatus) {
                        return;
                      }

                      updateStatusMutation.mutate({
                        orderId: targetOrderId,
                        nextStatus,
                      });
                    }}
                    className="w-full rounded-md border border-white/20 bg-[var(--ck-surface)] px-2 py-1.5 text-sm focus:border-[var(--ck-accent)] focus:outline-none disabled:cursor-not-allowed disabled:bg-white/5"
                  >
                    {transitions.map((option) => (
                      <option
                        key={`${targetOrderId}-mobile-${option}`}
                        value={option}
                      >
                        {formatStatusLabel(option)}
                      </option>
                    ))}
                  </select>
                </article>
              );
            })}
          </div>

          <div className="p-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminOrdersPage;




