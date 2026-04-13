import apiClient from './client'

function hasValue(value) {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized || normalized === 'undefined' || normalized === 'null') {
      return false
    }
  }

  return true
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function pickFirst(...values) {
  return values.find((value) => hasValue(value))
}

function asString(value, fallback = '') {
  if (!hasValue(value)) {
    return fallback
  }

  return String(value)
}

function normalizePaymentStatus(value) {
  return asString(value, 'pending').trim().toLowerCase()
}

function normalizeGateway(value) {
  return asString(value, 'cod').trim().toLowerCase()
}

function normalizePayment(rawPayment) {
  const payment = rawPayment || {}

  return {
    id: pickFirst(payment?.id, payment?.payment_id, null),
    paymentId: asString(pickFirst(payment?.payment_id, payment?.id), ''),
    orderNumber: asString(payment?.order_number, ''),
    gateway: normalizeGateway(payment?.gateway),
    gatewayPaymentId: asString(payment?.gateway_payment_id, ''),
    amount: toNumber(payment?.amount),
    currency: asString(payment?.currency, 'BDT'),
    status: normalizePaymentStatus(payment?.status),
    idempotencyKey: asString(payment?.idempotency_key, ''),
    createdAt: pickFirst(payment?.created_at, payment?.createdAt, null),
    raw: payment,
  }
}

function normalizePayoutStatus(value) {
  return asString(value, 'pending').trim().toLowerCase()
}

function normalizePayout(rawPayout) {
  const payout = rawPayout || {}

  return {
    id: pickFirst(payout?.id, null),
    orderNumber: asString(payout?.order_number, ''),
    vendorName: asString(payout?.vendor_name, ''),
    grossAmount: toNumber(payout?.gross_amount),
    commissionAmount: toNumber(payout?.commission_amount),
    netAmount: toNumber(payout?.net_amount),
    status: normalizePayoutStatus(payout?.status),
    releaseAt: pickFirst(payout?.release_at, payout?.releaseAt, null),
    paidAt: pickFirst(payout?.paid_at, payout?.paidAt, null),
    payoutReference: asString(payout?.payout_reference, ''),
    createdAt: pickFirst(payout?.created_at, payout?.createdAt, null),
    raw: payout,
  }
}

function extractArray(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results
  }

  return []
}

function normalizePayoutList(payload, fallbackPage = 1) {
  const payouts = extractArray(payload).map((entry) => normalizePayout(entry))
  const countCandidate = toNumber(pickFirst(payload?.count, payload?.total, payouts.length))
  const count = countCandidate > 0 ? countCandidate : payouts.length
  const page = Math.max(1, Math.floor(toNumber(pickFirst(payload?.page, payload?.current_page, fallbackPage))))
  const pageSize = Math.max(1, Math.floor(toNumber(pickFirst(payload?.page_size, payload?.per_page, 20))))

  return {
    results: payouts,
    count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    next: payload?.next ?? null,
    previous: payload?.previous ?? null,
  }
}

export function getPaymentApiErrorMessage(error, fallbackMessage) {
  const fallback = fallbackMessage || 'Something went wrong. Please try again.'
  const data = error?.response?.data

  if (typeof data?.detail === 'string') {
    return data.detail
  }

  if (typeof data?.message === 'string') {
    return data.message
  }

  if (Array.isArray(data?.non_field_errors) && data.non_field_errors.length > 0) {
    return String(data.non_field_errors[0])
  }

  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (typeof value === 'string') {
        return value
      }

      if (Array.isArray(value) && value.length > 0) {
        return String(value[0])
      }
    }
  }

  return fallback
}

export async function initiatePayment({ orderId, gateway, idempotencyKey }) {
  const response = await apiClient.post('/payments/initiate/', {
    order_id: orderId,
    gateway: normalizeGateway(gateway),
    ...(hasValue(idempotencyKey) ? { idempotency_key: String(idempotencyKey) } : {}),
  })

  const payload = response.data || {}

  return {
    detail: asString(payload?.detail, ''),
    payment: payload?.payment ? normalizePayment(payload.payment) : null,
    transactionId: asString(payload?.transaction_id, ''),
    gatewayUrl: asString(payload?.gateway_url, ''),
    successUrl: asString(payload?.success_url, ''),
    failUrl: asString(payload?.fail_url, ''),
    cancelUrl: asString(payload?.cancel_url, ''),
    raw: payload,
  }
}

export async function fetchMyPayments() {
  const response = await apiClient.get('/payments/')
  return extractArray(response.data).map((entry) => normalizePayment(entry))
}

export async function fetchPayouts({ page } = {}) {
  const query = new URLSearchParams()
  if (hasValue(page)) {
    query.set('page', String(page))
  }

  const queryString = query.toString()
  const response = await apiClient.get(`/payments/payouts/${queryString ? `?${queryString}` : ''}`)
  return normalizePayoutList(response.data, Math.max(1, toNumber(page) || 1))
}

export async function markPayoutPaid(payoutId, payoutReference) {
  const payload = {}
  if (hasValue(payoutReference)) {
    payload.payout_reference = String(payoutReference).trim()
  }

  const response = await apiClient.patch(`/payments/payouts/${payoutId}/mark-paid/`, payload)
  return normalizePayout(response.data)
}
