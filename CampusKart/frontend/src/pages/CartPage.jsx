import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import OptimizedProductImage from '../components/ui/OptimizedProductImage'
import { useToast } from '../hooks/useToast'
import { useCartStore } from '../store/cartStore'

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

function getApiErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || fallbackMessage
}

function CartPage() {
  const { showError } = useToast()
  const items = useCartStore((state) => state.items)
  const totalItems = useCartStore((state) => state.totalItems)
  const totalPrice = useCartStore((state) => state.totalPrice)
  const isLoading = useCartStore((state) => state.isLoading)
  const updateItemQuantity = useCartStore((state) => state.updateItemQuantity)
  const removeItem = useCartStore((state) => state.removeItem)

  const updateQuantityMutation = useMutation({
    mutationFn: ({ itemId, quantity }) => updateItemQuantity({ itemId, quantity }),
    onError: (error) => {
      showError(getApiErrorMessage(error, 'Could not update cart quantity.'))
    },
  })

  const removeItemMutation = useMutation({
    mutationFn: (itemId) => removeItem(itemId),
    onError: (error) => {
      showError(getApiErrorMessage(error, 'Could not remove item from cart.'))
    },
  })

  const increment = (item) => {
    const next = item.quantity + 1
    if (toNumber(item.stock) > 0 && next > toNumber(item.stock)) {
      return
    }

    updateQuantityMutation.mutate({
      itemId: item.id,
      quantity: next,
    })
  }

  const decrement = (item) => {
    if (item.quantity <= 1) {
      return
    }

    updateQuantityMutation.mutate({
      itemId: item.id,
      quantity: item.quantity - 1,
    })
  }

  if (isLoading) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-primary">Your Cart</h1>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`cart-skeleton-${index}`} className="grid grid-cols-[80px_1fr_120px] items-center gap-3">
              <div className="h-20 w-20 animate-pulse rounded bg-slate-200" />
              <div className="space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-primary">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted">Add products to your cart and come back to checkout.</p>
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
      <div>
        <h1 className="text-2xl font-bold text-primary">Your Cart</h1>
        <p className="mt-1 text-sm text-muted">{totalItems} item(s) ready for checkout</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[80px_1fr_130px_120px_90px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
            <span>Item</span>
            <span>Description</span>
            <span>Quantity</span>
            <span>Subtotal</span>
            <span className="text-right">Action</span>
          </div>

          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <article
                key={item.id}
                className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[80px_1fr_130px_120px_90px] md:items-center"
              >
                <Link to={item.productSlug ? `/shop/products/${item.productSlug}` : '/shop'} className="block">
                  <OptimizedProductImage
                    src={item.imageUrl}
                    alt={item.name}
                    width={160}
                    height={160}
                    className="h-20 w-20 rounded-md border border-slate-200"
                    imgClassName="h-full w-full object-cover"
                  />
                </Link>

                <div>
                  <Link
                    to={item.productSlug ? `/shop/products/${item.productSlug}` : '/shop'}
                    className="text-sm font-semibold text-slate-900 hover:text-accent"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted">Unit price: {formatPrice(item.unitPrice)}</p>
                  {toNumber(item.stock) > 0 ? (
                    <p className="mt-1 text-xs text-muted">Stock: {item.stock}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decrement(item)}
                    disabled={item.quantity <= 1 || updateQuantityMutation.isPending}
                    className="h-8 w-8 rounded border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Decrease quantity for ${item.name}`}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={toNumber(item.stock) > 0 ? toNumber(item.stock) : undefined}
                    value={item.quantity}
                    onChange={(event) => {
                      const rawValue = Number(event.target.value)
                      const next = Number.isNaN(rawValue) ? 1 : Math.max(1, Math.floor(rawValue))
                      updateQuantityMutation.mutate({
                        itemId: item.id,
                        quantity: next,
                      })
                    }}
                    className="h-8 w-14 rounded border border-slate-300 px-2 text-center text-sm"
                    aria-label={`Quantity for ${item.name}`}
                  />

                  <button
                    type="button"
                    onClick={() => increment(item)}
                    disabled={
                      updateQuantityMutation.isPending ||
                      (toNumber(item.stock) > 0 && item.quantity >= toNumber(item.stock))
                    }
                    className="h-8 w-8 rounded border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Increase quantity for ${item.name}`}
                  >
                    +
                  </button>
                </div>

                <p className="text-sm font-semibold text-slate-900">{formatPrice(item.subtotal)}</p>

                <div className="flex justify-start md:justify-end">
                  <button
                    type="button"
                    onClick={() => removeItemMutation.mutate(item.id)}
                    disabled={removeItemMutation.isPending}
                    className="rounded border border-error/50 px-2 py-1 text-xs font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Order Summary</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between text-muted">
              <span>Subtotal ({totalItems} items)</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Delivery</span>
              <span>Calculated at checkout</span>
            </div>
            <div className="my-3 border-t border-slate-200" />
            <div className="flex items-center justify-between text-base font-bold text-primary">
              <span>Order Total</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
          </div>

          <Link
            to="/checkout"
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary"
          >
            Proceed to Checkout
          </Link>
        </aside>
      </div>
    </section>
  )
}

export default CartPage
