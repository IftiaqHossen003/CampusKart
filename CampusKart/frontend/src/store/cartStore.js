import { create } from 'zustand'
import {
  addCartItem,
  clearServerCart,
  fetchCart,
  removeCartItem,
  updateCartItemQuantity,
} from '../api/cart'
import { useAuthStore } from './authStore'

const GUEST_CART_STORAGE_KEY = 'campuskart_guest_cart_v1'

function toNumber(value) {
  const number = Number(value)
  return Number.isNaN(number) ? 0 : number
}

function toPositiveInteger(value, fallback = 1) {
  const number = Math.floor(toNumber(value))
  if (number <= 0) {
    return fallback
  }
  return number
}

function resolveImageUrl(product) {
  const primaryImage = product?.images?.find((image) => image.is_primary)?.image_url
  return (
    primaryImage ||
    product?.images?.[0]?.image_url ||
    product?.thumbnail ||
    product?.thumbnail_url ||
    product?.image_url ||
    'https://placehold.co/600x450/e2e8f0/334155?text=CampusKart'
  )
}

function computeTotals(items) {
  const totalItems = items.reduce((sum, item) => sum + toPositiveInteger(item.quantity, 0), 0)
  const totalPrice = items.reduce((sum, item) => {
    const subtotal =
      item.subtotal !== null && item.subtotal !== undefined
        ? toNumber(item.subtotal)
        : toNumber(item.unitPrice) * toPositiveInteger(item.quantity, 0)

    return sum + subtotal
  }, 0)

  return { totalItems, totalPrice }
}

function normalizeGuestItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return []
  }

  return rawItems
    .map((item, index) => {
      const quantity = toPositiveInteger(item?.quantity, 0)
      const productId = item?.productId

      if (!productId || quantity <= 0) {
        return null
      }

      const unitPrice = toNumber(item?.unitPrice)
      return {
        id: item?.id || `guest-${productId}-${index}`,
        cartItemId: null,
        productId,
        productSlug: item?.productSlug || '',
        name: item?.name || 'Product',
        imageUrl: item?.imageUrl || 'https://placehold.co/600x450/e2e8f0/334155?text=CampusKart',
        quantity,
        unitPrice,
        stock: item?.stock !== null && item?.stock !== undefined ? toNumber(item.stock) : 0,
        subtotal: toNumber(item?.subtotal ?? unitPrice * quantity),
      }
    })
    .filter(Boolean)
}

function readGuestCartFromStorage() {
  try {
    const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return normalizeGuestItems(parsed)
  } catch {
    return []
  }
}

function writeGuestCartToStorage(items) {
  try {
    if (!items.length) {
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Intentionally ignore localStorage write errors.
  }
}

function buildGuestCartItem(product, quantity) {
  const unitPrice = toNumber(product?.discount_price ?? product?.price)
  const safeQuantity = toPositiveInteger(quantity)

  return {
    id: `guest-${product.id}`,
    cartItemId: null,
    productId: product.id,
    productSlug: product.slug || '',
    name: product.name || 'Product',
    imageUrl: resolveImageUrl(product),
    quantity: safeQuantity,
    unitPrice,
    stock: toNumber(product.stock),
    subtotal: unitPrice * safeQuantity,
  }
}

function clampToStock(item, quantity) {
  if (toNumber(item.stock) <= 0) {
    return quantity
  }

  return Math.min(quantity, toNumber(item.stock))
}

function asCartState(items) {
  const normalizedItems = normalizeGuestItems(items)
  const { totalItems, totalPrice } = computeTotals(normalizedItems)

  return {
    items: normalizedItems,
    totalItems,
    totalPrice,
  }
}

function isAuthenticated() {
  return Boolean(useAuthStore.getState().token)
}

export const useCartStore = create((set, get) => ({
  items: [],
  totalItems: 0,
  totalPrice: 0,
  isLoading: false,

  loadGuestCart: () => {
    const guestItems = readGuestCartFromStorage()
    set(asCartState(guestItems))
    return guestItems
  },

  fetchServerCart: async () => {
    set({ isLoading: true })

    try {
      const cart = await fetchCart()
      set({ ...cart, isLoading: false })
      return cart
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  initializeCart: async ({ forceServerRefresh = false } = {}) => {
    if (isAuthenticated()) {
      if (forceServerRefresh) {
        return get().fetchServerCart()
      }

      if (!get().items.length) {
        return get().fetchServerCart()
      }

      return {
        items: get().items,
        totalItems: get().totalItems,
        totalPrice: get().totalPrice,
      }
    }

    const guestItems = get().loadGuestCart()
    return {
      items: guestItems,
      ...computeTotals(guestItems),
    }
  },

  addItem: async ({ product, quantity = 1 }) => {
    if (!product?.id) {
      throw new Error('Product ID is required to add an item to cart.')
    }

    const safeQuantity = toPositiveInteger(quantity)

    if (isAuthenticated()) {
      const cart = await addCartItem({ productId: product.id, quantity: safeQuantity })
      set(cart)
      return cart
    }

    const nextItems = (() => {
      const currentItems = get().items
      const existing = currentItems.find((item) => item.productId === product.id)

      if (!existing) {
        const newItem = buildGuestCartItem(product, safeQuantity)
        return [...currentItems, newItem]
      }

      return currentItems.map((item) => {
        if (item.productId !== product.id) {
          return item
        }

        const quantityWithIncrement = toPositiveInteger(item.quantity) + safeQuantity
        const clampedQuantity = clampToStock(item, quantityWithIncrement)

        return {
          ...item,
          quantity: clampedQuantity,
          subtotal: toNumber(item.unitPrice) * clampedQuantity,
        }
      })
    })()

    writeGuestCartToStorage(nextItems)
    const nextState = asCartState(nextItems)
    set(nextState)
    return nextState
  },

  updateItemQuantity: async ({ itemId, quantity }) => {
    const safeQuantity = toPositiveInteger(quantity)

    if (isAuthenticated()) {
      const cart = await updateCartItemQuantity(itemId, safeQuantity)
      set(cart)
      return cart
    }

    const nextItems = get().items.map((item) => {
      if (String(item.id) !== String(itemId)) {
        return item
      }

      const clampedQuantity = clampToStock(item, safeQuantity)
      return {
        ...item,
        quantity: clampedQuantity,
        subtotal: toNumber(item.unitPrice) * clampedQuantity,
      }
    })

    writeGuestCartToStorage(nextItems)
    const nextState = asCartState(nextItems)
    set(nextState)
    return nextState
  },

  removeItem: async (itemId) => {
    if (isAuthenticated()) {
      const cart = await removeCartItem(itemId)

      if (cart) {
        set(cart)
        return cart
      }

      await get().fetchServerCart()
      return {
        items: get().items,
        totalItems: get().totalItems,
        totalPrice: get().totalPrice,
      }
    }

    const nextItems = get().items.filter((item) => String(item.id) !== String(itemId))
    writeGuestCartToStorage(nextItems)
    const nextState = asCartState(nextItems)
    set(nextState)
    return nextState
  },

  clearCart: async () => {
    if (isAuthenticated()) {
      const cleared = await clearServerCart()
      set(cleared)
      return cleared
    }

    writeGuestCartToStorage([])
    set({ items: [], totalItems: 0, totalPrice: 0 })

    return {
      items: [],
      totalItems: 0,
      totalPrice: 0,
    }
  },

  mergeGuestCartOnLogin: async () => {
    if (!isAuthenticated()) {
      return {
        mergedCount: 0,
        failedCount: 0,
      }
    }

    const guestItems = readGuestCartFromStorage()

    if (!guestItems.length) {
      await get().fetchServerCart()
      return {
        mergedCount: 0,
        failedCount: 0,
      }
    }

    const failedItems = []
    let mergedCount = 0

    for (const item of guestItems) {
      try {
        await addCartItem({
          productId: item.productId,
          quantity: item.quantity,
        })
        mergedCount += 1
      } catch {
        failedItems.push(item)
      }
    }

    writeGuestCartToStorage(failedItems)

    if (failedItems.length === 0) {
      await get().fetchServerCart()
      return {
        mergedCount,
        failedCount: 0,
      }
    }

    try {
      await get().fetchServerCart()
    } catch {
      const fallbackItems = readGuestCartFromStorage()
      set(asCartState(fallbackItems))
    }

    return {
      mergedCount,
      failedCount: failedItems.length,
    }
  },
}))
