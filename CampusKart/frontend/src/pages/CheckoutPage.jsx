import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { createOrder, getOrderApiErrorMessage } from "../api/orders";
import { getPaymentApiErrorMessage, initiatePayment } from "../api/payments";
import { useToast } from "../hooks/useToast";
import { useCartStore } from "../store/cartStore";

const checkoutSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters."),
  phone: z
    .string()
    .trim()
    .min(7, "Phone number is required.")
    .max(20, "Phone number is too long.")
    .regex(
      /^[0-9+()\-\s]+$/,
      "Phone can include digits, +, spaces, parentheses, and dashes only.",
    ),
  addressLine: z
    .string()
    .trim()
    .min(5, "Address line must be at least 5 characters."),
  areaCity: z.string().trim().min(2, "Area/City is required."),
  notes: z
    .string()
    .max(300, "Notes cannot exceed 300 characters.")
    .optional()
    .or(z.literal("")),
  paymentMethod: z.enum(["cod", "sslcommerz"]),
});

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

function buildDeliveryAddressString(values) {
  return [values.fullName, values.phone, values.addressLine, values.areaCity]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
}

function makeClientRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `ck-${crypto.randomUUID()}`;
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `ck-${Date.now()}-${randomPart}`;
}

function buildPaymentIdempotencyKey(orderId, paymentMethod, requestId) {
  return `pay-init:${orderId}:${paymentMethod}:${requestId}`;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const items = useCartStore((state) => state.items);
  const totalItems = useCartStore((state) => state.totalItems);
  const totalPrice = useCartStore((state) => state.totalPrice);
  const clearCart = useCartStore((state) => state.clearCart);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      addressLine: "",
      areaCity: "",
      notes: "",
      paymentMethod: "cod",
    },
  });

  const placeOrderMutation = useMutation({
    mutationFn: async (values) => {
      const requestId = makeClientRequestId();
      const deliveryAddress = buildDeliveryAddressString(values);

      const order = await createOrder({
        delivery_address: deliveryAddress,
        payment_method: values.paymentMethod,
        request_id: requestId,
        requestId,
        notes: values.notes?.trim() || "",
        deliveryAddress: {
          fullName: values.fullName,
          phone: values.phone,
          addressLine: values.addressLine,
          areaCity: values.areaCity,
          notes: values.notes?.trim() || "",
        },
      });

      const orderId = Number(order?.statusUpdateId ?? order?.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        const invalidOrderError = new Error(
          "Order was created but could not be resolved for payment initiation.",
        );
        invalidOrderError.order = order;
        throw invalidOrderError;
      }

      try {
        const paymentResult = await initiatePayment({
          orderId,
          gateway: values.paymentMethod,
          idempotencyKey: buildPaymentIdempotencyKey(
            orderId,
            values.paymentMethod,
            requestId,
          ),
        });

        return {
          order,
          paymentResult,
          paymentMethod: values.paymentMethod,
        };
      } catch (error) {
        error.order = order;
        throw error;
      }
    },
    onSuccess: async ({ order, paymentResult, paymentMethod }) => {
      showSuccess("Order placed successfully.");

      await clearCart().catch(() => {
        useCartStore.setState({
          items: [],
          totalItems: 0,
          totalPrice: 0,
        });
      });

      const orderReference = order?.orderNumber
        ? encodeURIComponent(order.orderNumber)
        : null;

      if (paymentMethod === "sslcommerz") {
        if (paymentResult?.gatewayUrl) {
          window.open(
            paymentResult.gatewayUrl,
            "_blank",
            "noopener,noreferrer",
          );
          showSuccess(
            "SSLCommerz session started. Complete payment in the opened tab.",
          );
        } else {
          showError(
            "SSLCommerz session could not be opened automatically. Please retry payment from your order.",
          );
        }

        if (orderReference) {
          navigate(`/orders/${orderReference}?payment=sslcommerz`, {
            replace: true,
          });
          return;
        }

        navigate("/orders", { replace: true });
        return;
      }

      if (orderReference) {
        navigate(`/orders/${orderReference}`, { replace: true });
        return;
      }

      navigate("/orders", { replace: true });
    },
    onError: (error) => {
      const order = error?.order;
      if (order?.orderNumber) {
        const paymentError = getPaymentApiErrorMessage(
          error,
          "Order placed but payment initiation failed.",
        );
        showError(paymentError);
        navigate(
          `/orders/${encodeURIComponent(order.orderNumber)}?payment_retry=1`,
          { replace: true },
        );
        return;
      }

      showError(
        getOrderApiErrorMessage(
          error,
          "Could not place order. Please review your details and try again.",
        ),
      );
    },
  });

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-white/20 bg-[var(--ck-surface)] p-8 text-center">
        <h1 className="text-2xl font-bold text-white">Your cart is empty</h1>
        <p className="mt-2 text-sm text-slate-400">
          Add products before proceeding to checkout.
        </p>
        <Link
          to="/shop"
          className="mt-5 inline-flex rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
        >
          Continue Shopping
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Checkout</h1>
        <p className="mt-1 text-sm text-slate-400">
          Confirm your delivery details and place your order.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <form
          onSubmit={handleSubmit((values) => placeOrderMutation.mutate(values))}
          className="space-y-5 rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-400">
                Full Name
              </span>
              <input
                type="text"
                {...register("fullName")}
                className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                placeholder="Your full name"
              />
              {errors.fullName ? (
                <span className="mt-1 block text-xs text-error">
                  {errors.fullName.message}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-400">
                Phone
              </span>
              <input
                type="tel"
                {...register("phone")}
                className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                placeholder="01XXXXXXXXX"
              />
              {errors.phone ? (
                <span className="mt-1 block text-xs text-error">
                  {errors.phone.message}
                </span>
              ) : null}
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">
              Address Line
            </span>
            <input
              type="text"
              {...register("addressLine")}
              className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
              placeholder="Hall, building, street, or landmark"
            />
            {errors.addressLine ? (
              <span className="mt-1 block text-xs text-error">
                {errors.addressLine.message}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">
              Area / City
            </span>
            <input
              type="text"
              {...register("areaCity")}
              className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
              placeholder="Area, city"
            />
            {errors.areaCity ? (
              <span className="mt-1 block text-xs text-error">
                {errors.areaCity.message}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">
              Delivery Notes (Optional)
            </span>
            <textarea
              {...register("notes")}
              rows={3}
              className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
              placeholder="Preferred delivery time, directions, etc."
            />
            {errors.notes ? (
              <span className="mt-1 block text-xs text-error">
                {errors.notes.message}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-400">
              Payment Method
            </span>
            <select
              {...register("paymentMethod")}
              className="w-full rounded-md border border-white/20 bg-[var(--ck-surface)] px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
            >
              <option value="cod">Cash on Delivery (COD)</option>
              <option value="sslcommerz">SSLCommerz</option>
            </select>
            {errors.paymentMethod ? (
              <span className="mt-1 block text-xs text-error">
                {errors.paymentMethod.message}
              </span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={placeOrderMutation.isPending}
            className="inline-flex w-full items-center justify-center rounded-md bg-[var(--ck-accent)] px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-white/20"
          >
            {placeOrderMutation.isPending ? "Placing Order..." : "Place Order"}
          </button>
        </form>

        <aside className="h-fit rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <h2 className="text-lg font-semibold text-white">Order Summary</h2>
          <p className="mt-1 text-xs text-slate-400">{totalItems} item(s)</p>

          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </p>
                </div>
                <p className="whitespace-nowrap font-semibold text-white">
                  {formatPrice(item.subtotal)}
                </p>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-white/10" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span>Subtotal</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-white">
              <span>Total</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default CheckoutPage;



