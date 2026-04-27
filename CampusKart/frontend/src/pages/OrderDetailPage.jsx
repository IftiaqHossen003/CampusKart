import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { fetchOrderDetail, getOrderApiErrorMessage } from "../api/orders";
import {
  fetchMyPayments,
  getPaymentApiErrorMessage,
  initiatePayment,
} from "../api/payments";
import OrderStatusBadge from "../components/ui/OrderStatusBadge";
import { useToast } from "../hooks/useToast";
import { useCartStore } from "../store/cartStore";

const ORDER_PROGRESS_STEPS = ["confirmed", "shipped", "delivered"];
const TERMINAL_PAYMENT_STATUSES = new Set(["success", "failed"]);

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

function getStatusRank(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  const ranking = {
    pending: 0,
    confirmed: 1,
    shipped: 2,
    delivered: 3,
    completed: 3,
  };

  return ranking[normalized] ?? 0;
}

function makePaymentRetryKey(orderId, paymentMethod) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `pay-retry:${orderId}:${paymentMethod}:${crypto.randomUUID()}`;
  }

  return `pay-retry:${orderId}:${paymentMethod}:${Date.now()}`;
}

function OrderDetailPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showSuccess } = useToast();
  const addItem = useCartStore((state) => state.addItem);

  const isSslcommerzFlow = searchParams.get("payment") === "sslcommerz";
  const hasPaymentRetry = searchParams.get("payment_retry") === "1";

  const orderQuery = useQuery({
    queryKey: ["order-detail", orderNumber],
    queryFn: () => fetchOrderDetail(orderNumber),
    enabled: Boolean(orderNumber),
    staleTime: 30 * 1000,
  });

  const paymentQuery = useQuery({
    queryKey: ["order-payments", orderQuery.data?.orderNumber],
    queryFn: () => fetchMyPayments(),
    enabled: Boolean(orderQuery.data?.orderNumber),
    refetchInterval: (query) => {
      if (!isSslcommerzFlow) {
        return false;
      }

      const payments = Array.isArray(query.state.data) ? query.state.data : [];
      const currentPayment = payments.find(
        (payment) => payment.orderNumber === orderQuery.data?.orderNumber,
      );
      const paymentStatus = String(currentPayment?.status || "").toLowerCase();
      if (TERMINAL_PAYMENT_STATUSES.has(paymentStatus)) {
        return false;
      }

      return 8000;
    },
    staleTime: 5 * 1000,
  });

  const retryPaymentMutation = useMutation({
    mutationFn: async () => {
      const order = orderQuery.data;
      const orderId = Number(order?.statusUpdateId ?? order?.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        throw new Error("Unable to resolve order id for payment retry.");
      }

      const paymentMethod = String(order?.paymentMethod || "cod").toLowerCase();
      const result = await initiatePayment({
        orderId,
        gateway: paymentMethod,
        idempotencyKey: makePaymentRetryKey(orderId, paymentMethod),
      });

      return {
        paymentMethod,
        result,
      };
    },
    onSuccess: ({ paymentMethod, result }) => {
      if (paymentMethod === "sslcommerz") {
        if (result?.gatewayUrl) {
          window.open(result.gatewayUrl, "_blank", "noopener,noreferrer");
          showSuccess(
            "SSLCommerz session started. Complete payment in the opened tab.",
          );
        } else {
          showError(
            "SSLCommerz session could not be opened automatically. Please try again.",
          );
        }

        navigate(
          `/orders/${encodeURIComponent(orderQuery.data?.orderNumber || orderNumber)}?payment=sslcommerz`,
          { replace: true },
        );
      } else {
        showSuccess("COD payment initiation retried successfully.");
        navigate(
          `/orders/${encodeURIComponent(orderQuery.data?.orderNumber || orderNumber)}`,
          { replace: true },
        );
      }

      orderQuery.refetch();
      paymentQuery.refetch();
    },
    onError: (error) => {
      showError(
        getPaymentApiErrorMessage(error, "Could not retry payment initiation."),
      );
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async () => {
      const order = orderQuery.data;
      const orderItems = order?.items || [];

      if (orderItems.length === 0) {
        throw new Error("This order has no items to re-order.");
      }

      let successCount = 0;
      let failedCount = 0;
      let firstError = null;

      for (const item of orderItems) {
        if (!item.productId) {
          failedCount += 1;
          continue;
        }

        try {
          await addItem({
            product: {
              id: item.productId,
              name: item.name,
              slug: item.productSlug || "",
              price: item.unitPrice,
              stock: item.stock,
              thumbnail_url: item.imageUrl,
            },
            quantity: item.quantity,
          });
          successCount += 1;
        } catch (error) {
          failedCount += 1;
          if (!firstError) {
            firstError = error;
          }
        }
      }

      return {
        successCount,
        failedCount,
        firstError,
      };
    },
    onSuccess: ({ successCount, failedCount, firstError }) => {
      if (successCount > 0 && failedCount === 0) {
        showSuccess("Items were added to your cart.");
        navigate("/cart");
        return;
      }

      if (successCount > 0 && failedCount > 0) {
        showSuccess(`${successCount} item(s) added to cart.`);
        showError(
          getOrderApiErrorMessage(
            firstError,
            `${failedCount} item(s) could not be added. They may be out of stock or unavailable.`,
          ),
        );
        navigate("/cart");
        return;
      }

      showError(
        getOrderApiErrorMessage(firstError, "Could not re-order these items."),
      );
    },
    onError: (error) => {
      showError(
        getOrderApiErrorMessage(error, "Could not re-order these items."),
      );
    },
  });

  if (orderQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-white/10" />
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`order-detail-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-white/10"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <section className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-xl font-semibold text-white">Order not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          {getOrderApiErrorMessage(
            orderQuery.error,
            "We could not load this order right now.",
          )}
        </p>
        <Link
          to="/orders"
          className="mt-5 inline-flex rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
        >
          Back to Orders
        </Link>
      </section>
    );
  }

  const order = orderQuery.data;
  const statusRank = getStatusRank(order.status);
  const orderPayment = (paymentQuery.data || []).find(
    (payment) => payment.orderNumber === order.orderNumber,
  );
  const canRetryPayment =
    hasPaymentRetry &&
    !retryPaymentMutation.isPending &&
    !TERMINAL_PAYMENT_STATUSES.has(
      String(orderPayment?.status || "").toLowerCase(),
    );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/orders"
            className="text-sm font-medium text-[var(--ck-accent)] hover:underline"
          >
            ← Back to Orders
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Order #{order.orderNumber || order.id}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Placed on {formatDate(order.placedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => reorderMutation.mutate()}
          disabled={reorderMutation.isPending || !order.items?.length}
          className="rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-white/20"
        >
          {reorderMutation.isPending ? "Adding Items..." : "Re-order"}
        </button>
      </div>

      {isSslcommerzFlow ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          SSLCommerz payment was initiated. Status updates can take a few
          seconds; this page refreshes payment state automatically.
        </div>
      ) : null}

      {hasPaymentRetry ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>
            Your order was created, but payment initiation failed. Retry payment
            for this same order.
          </p>
          <button
            type="button"
            onClick={() => retryPaymentMutation.mutate()}
            disabled={!canRetryPayment}
            className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
          >
            {retryPaymentMutation.isPending ? "Retrying..." : "Retry Payment"}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
            <h2 className="text-base font-semibold text-white">
              Order Progress
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {ORDER_PROGRESS_STEPS.map((step, index) => {
                const stepRank = index + 1;
                const isDone = statusRank > stepRank;
                const isCurrent = statusRank === stepRank;

                return (
                  <div key={step} className="relative">
                    <div
                      className={`rounded-md border px-3 py-3 text-center text-xs font-semibold ${
                        isDone || isCurrent
                          ? "border-accent bg-[var(--ck-accent)]/10 text-[var(--ck-accent)]"
                          : "border-white/10 bg-[var(--ck-surface-deep)] text-slate-400"
                      }`}
                    >
                      {formatLabel(step)}
                    </div>
                    {index < ORDER_PROGRESS_STEPS.length - 1 ? (
                      <span className="absolute -right-2 top-1/2 hidden h-0.5 w-4 -translate-y-1/2 bg-white/20 sm:block" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)]">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-base font-semibold text-white">Items</h2>
            </div>

            <div className="divide-y divide-white/10">
              {(order.items || []).map((item) => (
                <article
                  key={item.id}
                  className="grid grid-cols-[64px_1fr_auto] gap-3 px-4 py-4 sm:grid-cols-[72px_1fr_auto]"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-16 w-16 rounded-md border border-white/10 object-cover sm:h-[72px] sm:w-[72px]"
                  />

                  <div>
                    <p className="text-sm font-semibold text-white">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Qty: {item.quantity} × {formatPrice(item.unitPrice)}
                    </p>
                  </div>

                  <p className="whitespace-nowrap text-sm font-semibold text-white">
                    {formatPrice(item.subtotal)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
            <h2 className="text-base font-semibold text-white">
              Order Details
            </h2>
            <div className="mt-3 space-y-2 text-sm text-slate-400">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Status</span>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Payment</span>
                <span className="font-medium">
                  {formatLabel(order.paymentMethod || "cod")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Payment Status</span>
                {orderPayment ? (
                  <OrderStatusBadge status={orderPayment.status} />
                ) : (
                  <span className="font-medium text-slate-400">N/A</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Items</span>
                <span className="font-medium">{order.itemCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
            <h2 className="text-base font-semibold text-white">
              Delivery Address
            </h2>
            <div className="mt-3 space-y-1 text-sm text-slate-400">
              {order.deliveryAddress?.fullName ? (
                <p>{order.deliveryAddress.fullName}</p>
              ) : null}
              {order.deliveryAddress?.phone ? (
                <p>{order.deliveryAddress.phone}</p>
              ) : null}
              {order.deliveryAddress?.addressLine ? (
                <p>{order.deliveryAddress.addressLine}</p>
              ) : null}
              {order.deliveryAddress?.areaCity ? (
                <p>{order.deliveryAddress.areaCity}</p>
              ) : null}
              {order.deliveryAddress?.notes ? (
                <p className="pt-1 text-xs text-slate-400">
                  Notes: {order.deliveryAddress.notes}
                </p>
              ) : null}
              {!order.deliveryAddress?.display ? (
                <p className="text-sm text-slate-400">
                  No address details available.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
            <h2 className="text-base font-semibold text-white">Summary</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-400">
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-bold text-white">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default OrderDetailPage;




