import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { createOrder, getOrderApiErrorMessage } from '../api/orders'
import { useToast } from '../hooks/useToast'
import { useCartStore } from '../store/cartStore'

const checkoutSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.'),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number is required.')
    .max(20, 'Phone number is too long.')
    .regex(/^[0-9+()\-\s]+$/, 'Phone can include digits, +, spaces, parentheses, and dashes only.'),
  addressLine: z.string().trim().min(5, 'Address line must be at least 5 characters.'),
  areaCity: z.string().trim().min(2, 'Area/City is required.'),
  notes: z.string().max(300, 'Notes cannot exceed 300 characters.').optional().or(z.literal('')),
  paymentMethod: z.literal('cod'),
})

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

function CheckoutPage() {
  const navigate = useNavigate()
  const { showError, showSuccess } = useToast()

  const items = useCartStore((state) => state.items)
  const totalItems = useCartStore((state) => state.totalItems)
  const totalPrice = useCartStore((state) => state.totalPrice)
  const clearCart = useCartStore((state) => state.clearCart)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      addressLine: '',
      areaCity: '',
      notes: '',
      paymentMethod: 'cod',
    },
  })

  const placeOrderMutation = useMutation({
    mutationFn: (values) =>
      createOrder({
        paymentMethod: values.paymentMethod,
        notes: values.notes?.trim() || '',
        deliveryAddress: {
          fullName: values.fullName,
          phone: values.phone,
          addressLine: values.addressLine,
          areaCity: values.areaCity,
          notes: values.notes?.trim() || '',
        },
      }),
    onSuccess: async (order) => {
      showSuccess('Order placed successfully.')

      await clearCart().catch(() => {
        useCartStore.setState({
          items: [],
          totalItems: 0,
          totalPrice: 0,
        })
      })

      if (order?.orderNumber) {
        navigate(`/orders/${encodeURIComponent(order.orderNumber)}`, { replace: true })
        return
      }

      navigate('/orders', { replace: true })
    },
    onError: (error) => {
      showError(getOrderApiErrorMessage(error, 'Could not place order. Please review your details and try again.'))
    },
  })

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-primary">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted">Add products before proceeding to checkout.</p>
        <Link
          to="/shop"
          className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Continue Shopping
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Checkout</h1>
        <p className="mt-1 text-sm text-muted">Confirm your delivery details and place your order.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <form
          onSubmit={handleSubmit((values) => placeOrderMutation.mutate(values))}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Full Name</span>
              <input
                type="text"
                {...register('fullName')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                placeholder="Your full name"
              />
              {errors.fullName ? <span className="mt-1 block text-xs text-error">{errors.fullName.message}</span> : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
              <input
                type="tel"
                {...register('phone')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                placeholder="01XXXXXXXXX"
              />
              {errors.phone ? <span className="mt-1 block text-xs text-error">{errors.phone.message}</span> : null}
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Address Line</span>
            <input
              type="text"
              {...register('addressLine')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              placeholder="Hall, building, street, or landmark"
            />
            {errors.addressLine ? <span className="mt-1 block text-xs text-error">{errors.addressLine.message}</span> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Area / City</span>
            <input
              type="text"
              {...register('areaCity')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              placeholder="Area, city"
            />
            {errors.areaCity ? <span className="mt-1 block text-xs text-error">{errors.areaCity.message}</span> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Delivery Notes (Optional)</span>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              placeholder="Preferred delivery time, directions, etc."
            />
            {errors.notes ? <span className="mt-1 block text-xs text-error">{errors.notes.message}</span> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Payment Method</span>
            <select
              {...register('paymentMethod')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="cod">Cash on Delivery (COD)</option>
              <option value="card" disabled>
                Card Payment (Coming Soon)
              </option>
              <option value="mobile" disabled>
                Mobile Banking (Coming Soon)
              </option>
            </select>
            {errors.paymentMethod ? (
              <span className="mt-1 block text-xs text-error">{errors.paymentMethod.message}</span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={placeOrderMutation.isPending}
            className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {placeOrderMutation.isPending ? 'Placing Order...' : 'Place Order'}
          </button>
        </form>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Order Summary</h2>
          <p className="mt-1 text-xs text-muted">{totalItems} item(s)</p>

          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs text-muted">
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </p>
                </div>
                <p className="whitespace-nowrap font-semibold text-slate-800">{formatPrice(item.subtotal)}</p>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-slate-200" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between text-muted">
              <span>Subtotal</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-primary">
              <span>Total</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default CheckoutPage
