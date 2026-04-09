import apiClient from './client'

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
  if (!product) {
    return 'https://placehold.co/600x450/e2e8f0/334155?text=CampusKart'
  }

  const primaryImage = product.images?.find((image) => image.is_primary)?.image_url
  return (
    primaryImage ||
    product.images?.[0]?.image_url ||
    product.thumbnail ||
    product.thumbnail_url ||
    product.image_url ||
    'https://placehold.co/600x450/e2e8f0/334155?text=CampusKart'
  )
}

function pickUnitPrice(product, item) {
  const candidate =
    item?.unit_price ??
    item?.price ??
    product?.discount_price ??
    product?.price ??
    item?.product_price ??
    0

  return toNumber(candidate)
}

function normalizeCartItem(item, index = 0) {
  const product = item?.product || null
  const productId = item?.product_id ?? product?.id ?? null
  const quantity = toPositiveInteger(item?.quantity)
  const unitPrice = pickUnitPrice(product, item)

  return {
    id: item?.id ?? `cart-item-${productId || index}`,
    cartItemId: item?.id ?? null,
    productId,
    productSlug: product?.slug ?? item?.product_slug ?? '',
    name: product?.name ?? item?.product_name ?? 'Product',
    imageUrl: resolveImageUrl(product),
    quantity,
    unitPrice,
    stock: toNumber(product?.stock),
    subtotal: toNumber(item?.subtotal ?? unitPrice * quantity),
  }
}

function extractItemList(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
  }

  if (Array.isArray(payload?.items?.results)) {
    return payload.items.results
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
  }

  return []
}

export function normalizeCart(payload) {
  const items = extractItemList(payload).map((item, index) => normalizeCartItem(item, index))
  const computedTotalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const computedTotalPrice = items.reduce((sum, item) => sum + item.subtotal, 0)

  const totalItems = toPositiveInteger(payload?.total_items ?? payload?.totalItems ?? computedTotalItems, 0)
  const totalPrice = toNumber(payload?.total_price ?? payload?.totalPrice ?? computedTotalPrice)

  return {
    id: payload?.id ?? null,
    items,
    totalItems,
    totalPrice,
  }
}

export async function fetchCart() {
  const response = await apiClient.get('/cart/')
  return normalizeCart(response.data)
}

export async function replaceCart(items) {
  const response = await apiClient.post('/cart/', { items })
  return normalizeCart(response.data)
}

export async function addCartItem({ productId, quantity = 1 }) {
  const response = await apiClient.post('/cart/items/', {
    product_id: productId,
    quantity: toPositiveInteger(quantity),
  })

  return normalizeCart(response.data)
}

export async function updateCartItemQuantity(itemId, quantity) {
  const response = await apiClient.patch(`/cart/items/${itemId}/`, {
    quantity: toPositiveInteger(quantity),
  })

  return normalizeCart(response.data)
}

export async function removeCartItem(itemId) {
  const response = await apiClient.delete(`/cart/items/${itemId}/`)

  if (response?.data) {
    return normalizeCart(response.data)
  }

  return null
}

export async function clearServerCart() {
  const response = await apiClient.post('/cart/clear/')

  if (response?.data) {
    return normalizeCart(response.data)
  }

  return {
    id: null,
    items: [],
    totalItems: 0,
    totalPrice: 0,
  }
}
