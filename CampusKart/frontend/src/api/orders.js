import apiClient from "./client";

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "undefined" || normalized === "null") {
      return false;
    }
  }

  return true;
}

function asString(value, fallback = "") {
  if (!hasValue(value)) {
    return fallback;
  }

  return String(value);
}

function pickFirst(...values) {
  return values.find((value) => hasValue(value));
}

function normalizeStatus(status) {
  return asString(status, "pending").trim().toLowerCase();
}

function normalizePaymentMethod(method) {
  return asString(method, "cod").trim().toLowerCase();
}

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  if (hasValue(params.page)) {
    query.set("page", String(params.page));
  }

  if (hasValue(params.pageSize)) {
    query.set("page_size", String(params.pageSize));
  }

  if (hasValue(params.status)) {
    query.set("status", String(params.status).toLowerCase());
  }

  if (hasValue(params.search)) {
    query.set("search", String(params.search));
  }

  if (hasValue(params.ordering)) {
    query.set("ordering", String(params.ordering));
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

function appendQueryParam(queryString, key, value) {
  const query = new URLSearchParams(queryString.replace(/^\?/, ""));
  query.set(key, value);
  const next = query.toString();
  return next ? `?${next}` : "";
}

function extractArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.order_items)) {
    return payload.order_items;
  }

  if (Array.isArray(payload?.orders)) {
    return payload.orders;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results;
  }

  if (Array.isArray(payload?.data?.orders)) {
    return payload.data.orders;
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }

  return [];
}

function resolveImageUrl(product, item) {
  const primaryImage = product?.images?.find(
    (image) => image.is_primary,
  )?.image_url;

  return (
    primaryImage ||
    product?.images?.[0]?.image_url ||
    item?.thumbnail ||
    item?.thumbnail_url ||
    item?.image_url ||
    product?.thumbnail ||
    product?.thumbnail_url ||
    product?.image_url ||
    "https://placehold.co/600x450/e2e8f0/334155?text=CampusKart"
  );
}

function extractOrderItems(order) {
  const directCandidates = [
    order?.items,
    order?.order_items,
    order?.line_items,
    order?.orderItems,
  ];

  for (const candidate of directCandidates) {
    const list = extractArray(candidate);
    if (list.length > 0) {
      return list;
    }
  }

  return [];
}

function normalizeOrderItem(item, index = 0) {
  const product =
    item?.product && typeof item.product === "object" ? item.product : null;
  const rawProductId = pickFirst(
    item?.product_id,
    product?.id,
    typeof item?.product === "string" || typeof item?.product === "number"
      ? item.product
      : null,
  );

  const quantity = Math.max(
    1,
    Math.floor(toNumber(pickFirst(item?.quantity, item?.qty, item?.count, 1))),
  );
  const unitPrice = toNumber(
    pickFirst(
      item?.unit_price,
      item?.price,
      item?.unitPrice,
      item?.product_price,
      product?.discount_price,
      product?.price,
      0,
    ),
  );

  return {
    id: pickFirst(item?.id, `order-item-${index}`),
    productId: hasValue(rawProductId) ? rawProductId : null,
    productSlug: asString(pickFirst(item?.product_slug, product?.slug), ""),
    name: asString(
      pickFirst(item?.product_name, item?.name, product?.name),
      "Product",
    ),
    imageUrl: resolveImageUrl(product, item),
    quantity,
    unitPrice,
    stock: toNumber(pickFirst(item?.stock, product?.stock, 0)),
    subtotal: toNumber(
      pickFirst(
        item?.subtotal,
        item?.line_total,
        item?.total,
        unitPrice * quantity,
      ),
    ),
  };
}

function normalizeAddress(addressSource, order) {
  if (typeof addressSource === "string") {
    return {
      fullName: asString(pickFirst(order?.customer_name, order?.full_name), ""),
      phone: asString(pickFirst(order?.phone, order?.phone_number), ""),
      addressLine: addressSource,
      areaCity: "",
      notes: asString(pickFirst(order?.notes, order?.delivery_notes), ""),
      display: addressSource,
    };
  }

  const source = addressSource || {};
  const fullName = asString(
    pickFirst(
      source?.full_name,
      source?.fullName,
      source?.name,
      order?.customer_name,
      order?.full_name,
    ),
    "",
  );
  const phone = asString(
    pickFirst(
      source?.phone,
      source?.phone_number,
      order?.phone,
      order?.phone_number,
    ),
    "",
  );
  const addressLine = asString(
    pickFirst(
      source?.address_line,
      source?.line1,
      source?.address,
      order?.address_line,
      order?.address,
    ),
    "",
  );
  const areaCity = asString(
    pickFirst(
      source?.area_city,
      source?.city,
      source?.area,
      source?.district,
      order?.area_city,
      order?.city,
    ),
    "",
  );
  const notes = asString(
    pickFirst(
      source?.notes,
      source?.delivery_notes,
      order?.notes,
      order?.delivery_notes,
    ),
    "",
  );

  const display = [fullName, phone, addressLine, areaCity]
    .filter(Boolean)
    .join(", ");

  return {
    fullName,
    phone,
    addressLine,
    areaCity,
    notes,
    display,
  };
}

function normalizeOrder(rawOrder, index = 0) {
  const order = rawOrder || {};
  const items = extractOrderItems(order).map((item, itemIndex) =>
    normalizeOrderItem(item, itemIndex),
  );
  const backendOrderId = pickFirst(order?.id, order?.order_id, order?.pk, null);

  const computedItemCount = items.reduce(
    (sum, item) => sum + toNumber(item.quantity),
    0,
  );
  const computedSubtotal = items.reduce(
    (sum, item) => sum + toNumber(item.subtotal),
    0,
  );

  const itemCountCandidate = toNumber(
    pickFirst(
      order?.item_count,
      order?.items_count,
      order?.total_items,
      order?.total_quantity,
      computedItemCount,
    ),
  );

  const subtotal = toNumber(
    pickFirst(
      order?.subtotal,
      order?.sub_total,
      order?.items_total,
      order?.item_total,
      computedSubtotal,
    ),
  );

  const total = toNumber(
    pickFirst(
      order?.total,
      order?.total_amount,
      order?.grand_total,
      order?.grandTotal,
      order?.amount,
      order?.amount_due,
      subtotal,
    ),
  );

  const orderNumber = asString(
    pickFirst(
      order?.order_number,
      order?.orderNumber,
      order?.number,
      order?.order_no,
      order?.id,
      `order-${index + 1}`,
    ),
    "",
  );

  return {
    id: pickFirst(backendOrderId, orderNumber),
    statusUpdateId: backendOrderId,
    orderNumber,
    status: normalizeStatus(
      pickFirst(order?.status, order?.order_status, order?.state),
    ),
    paymentMethod: normalizePaymentMethod(
      pickFirst(
        order?.payment_method,
        order?.paymentMethod,
        order?.payment_type,
        order?.method,
      ),
    ),
    placedAt: pickFirst(
      order?.created_at,
      order?.placed_at,
      order?.order_date,
      order?.date,
      order?.createdAt,
      null,
    ),
    itemCount: itemCountCandidate > 0 ? itemCountCandidate : computedItemCount,
    subtotal,
    total,
    customerName: asString(
      pickFirst(
        order?.customer_name,
        order?.student_name,
        order?.full_name,
        order?.buyer_name,
        order?.buyer_full_name,
        order?.user?.full_name,
        order?.user?.name,
        order?.buyer?.full_name,
        order?.buyer_email,
        order?.buyer?.email,
      ),
      "",
    ),
    customerEmail: asString(
      pickFirst(order?.buyer_email, order?.buyer?.email, order?.user?.email),
      "",
    ),
    deliveryAddress: normalizeAddress(
      pickFirst(
        order?.delivery_address,
        order?.shipping_address,
        order?.address,
        order?.deliveryAddress,
      ),
      order,
    ),
    items,
    raw: order,
  };
}

function extractOrderObject(payload) {
  if (!payload || Array.isArray(payload)) {
    return payload;
  }

  if (
    payload.order &&
    typeof payload.order === "object" &&
    !Array.isArray(payload.order)
  ) {
    return payload.order;
  }

  if (
    payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    if (payload.data.order && typeof payload.data.order === "object") {
      return payload.data.order;
    }

    return payload.data;
  }

  return payload;
}

function normalizeOrdersList(payload, fallbackPage = 1) {
  const orders = extractArray(payload).map((order, index) =>
    normalizeOrder(order, index),
  );
  const countCandidate = toNumber(
    pickFirst(
      payload?.count,
      payload?.total_count,
      payload?.total,
      payload?.pagination?.count,
      orders.length,
    ),
  );

  const count = countCandidate > 0 ? countCandidate : orders.length;
  const page = Math.max(
    1,
    Math.floor(
      toNumber(pickFirst(payload?.page, payload?.current_page, fallbackPage)),
    ),
  );
  const pageSize = Math.max(
    1,
    Math.floor(
      toNumber(
        pickFirst(
          payload?.page_size,
          payload?.per_page,
          payload?.limit,
          orders.length || 10,
        ),
      ),
    ),
  );

  return {
    results: orders,
    count,
    next: payload?.next ?? payload?.pagination?.next ?? null,
    previous: payload?.previous ?? payload?.pagination?.previous ?? null,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
  };
}

async function getWithFallback(urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      return await apiClient.get(url);
    } catch (error) {
      lastError = error;
      if (error?.response?.status === 404) {
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("No valid endpoint found for order request.");
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, value]) => hasValue(value)),
  );
}

function buildDeliveryAddressText(parts = []) {
  const text = parts
    .map((part) => asString(part).trim())
    .filter(Boolean)
    .join(", ");

  return text;
}

function buildCreateOrderPayloadCandidates(payload = {}) {
  const source = payload || {};
  const deliveryAddressSource =
    source.deliveryAddress ||
    source.delivery_address ||
    source.shippingAddress ||
    source.shipping_address ||
    {};
  const requestId = pickFirst(source?.request_id, source?.requestId);

  const fullName = pickFirst(
    deliveryAddressSource?.full_name,
    deliveryAddressSource?.fullName,
    source?.full_name,
    source?.fullName,
  );
  const phone = pickFirst(
    deliveryAddressSource?.phone,
    deliveryAddressSource?.phone_number,
    source?.phone,
  );
  const addressLine = pickFirst(
    deliveryAddressSource?.address_line,
    deliveryAddressSource?.addressLine,
    deliveryAddressSource?.line1,
    source?.address_line,
    source?.addressLine,
  );
  const areaCity = pickFirst(
    deliveryAddressSource?.area_city,
    deliveryAddressSource?.areaCity,
    deliveryAddressSource?.city,
    source?.area_city,
    source?.areaCity,
    source?.city,
  );

  const notes = pickFirst(deliveryAddressSource?.notes, source?.notes, "");
  const paymentMethod = pickFirst(
    source?.payment_method,
    source?.paymentMethod,
    "cod",
  );
  const items = Array.isArray(source?.items) ? source.items : undefined;
  const deliveryAddressText = asString(
    pickFirst(
      source?.delivery_address,
      source?.deliveryAddressString,
      source?.address,
      source?.address_line,
      buildDeliveryAddressText([fullName, phone, addressLine, areaCity]),
    ),
    "",
  );

  const snakeAddress = compactObject({
    full_name: fullName,
    phone,
    address_line: addressLine,
    area_city: areaCity,
    notes,
  });

  const camelAddress = compactObject({
    fullName,
    phone,
    addressLine,
    areaCity,
    notes,
  });

  const candidates = [
    source,
    compactObject({
      delivery_address: deliveryAddressText,
      notes,
      payment_method: paymentMethod,
      request_id: requestId,
      requestId,
      ...(items ? { items } : {}),
    }),
    compactObject({
      payment_method: paymentMethod,
      notes,
      delivery_address: deliveryAddressText,
      request_id: requestId,
      requestId,
      ...(items ? { items } : {}),
    }),
    compactObject({
      payment_method: paymentMethod,
      notes,
      delivery_address: deliveryAddressText,
      request_id: requestId,
      requestId,
      ...snakeAddress,
      ...(items ? { items } : {}),
    }),
    compactObject({
      paymentMethod,
      notes,
      request_id: requestId,
      requestId,
      ...(Object.keys(camelAddress).length > 0
        ? { deliveryAddress: camelAddress }
        : {}),
      ...(items ? { items } : {}),
    }),
  ];

  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function shouldRetryWithAnotherPayload(statusCode, responseData) {
  if (statusCode !== 400 && statusCode !== 422) {
    return false;
  }

  if (
    !responseData ||
    typeof responseData !== "object" ||
    Array.isArray(responseData)
  ) {
    return false;
  }

  if (
    typeof responseData?.detail === "string" ||
    typeof responseData?.message === "string"
  ) {
    return false;
  }

  const payloadShapeKeys = new Set([
    "delivery_address",
    "deliveryAddress",
    "address_line",
    "addressLine",
    "full_name",
    "fullName",
    "phone",
    "payment_method",
    "paymentMethod",
  ]);

  return Object.keys(responseData).some((key) => payloadShapeKeys.has(key));
}

async function postWithPayloadFallback(url, payloadCandidates) {
  let lastError = null;

  for (const candidate of payloadCandidates) {
    try {
      return await apiClient.post(url, candidate);
    } catch (error) {
      lastError = error;
      const statusCode = error?.response?.status;
      const responseData = error?.response?.data;

      if (shouldRetryWithAnotherPayload(statusCode, responseData)) {
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Could not submit order request.");
}

export function getOrderApiErrorMessage(error, fallbackMessage) {
  const fallback = fallbackMessage || "Something went wrong. Please try again.";
  const data = error?.response?.data;

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (
    Array.isArray(data?.non_field_errors) &&
    data.non_field_errors.length > 0
  ) {
    return String(data.non_field_errors[0]);
  }

  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      if (typeof value === "string") {
        return value;
      }

      if (Array.isArray(value) && value.length > 0) {
        return String(value[0]);
      }
    }
  }

  return fallback;
}

export async function createOrder(payload) {
  const response = await postWithPayloadFallback(
    "/orders/",
    buildCreateOrderPayloadCandidates(payload),
  );
  return normalizeOrder(extractOrderObject(response.data));
}

export async function fetchStudentOrders(params = {}) {
  const queryString = buildQueryString(params);
  const response = await apiClient.get(`/orders/${queryString}`);
  return normalizeOrdersList(
    response.data,
    Math.max(1, toNumber(params.page) || 1),
  );
}

export async function fetchOrderDetail(orderNumberOrId) {
  if (!hasValue(orderNumberOrId)) {
    throw new Error("Order identifier is required.");
  }

  const encoded = encodeURIComponent(String(orderNumberOrId).trim());
  const detailEndpoints = [
    `/orders/${encoded}/`,
    `/orders/by-number/${encoded}/`,
    `/orders/detail/${encoded}/`,
  ];

  let lastError = null;

  for (const endpoint of detailEndpoints) {
    try {
      const response = await apiClient.get(endpoint);
      return normalizeOrder(extractOrderObject(response.data));
    } catch (error) {
      lastError = error;
      if (error?.response?.status === 404) {
        continue;
      }
      throw error;
    }
  }

  const listResponse = await apiClient.get(`/orders/?order_number=${encoded}`);
  const normalized = normalizeOrdersList(listResponse.data, 1);

  const matched =
    normalized.results.find(
      (order) => String(order.orderNumber) === String(orderNumberOrId),
    ) ||
    normalized.results.find(
      (order) => String(order.id) === String(orderNumberOrId),
    );

  if (matched) {
    return matched;
  }

  throw lastError || new Error("Order not found.");
}

export async function fetchVendorOrders(params = {}) {
  const queryString = buildQueryString(params);
  const fallbackScopeQuery = appendQueryParam(queryString, "scope", "vendor");

  const response = await getWithFallback([
    `/orders/${fallbackScopeQuery}`,
    `/orders/${queryString}`,
    `/orders/vendor/${queryString}`,
    `/vendor/orders/${queryString}`,
  ]);

  return normalizeOrdersList(
    response.data,
    Math.max(1, toNumber(params.page) || 1),
  );
}

export async function updateOrderStatus(orderId, status) {
  const response = await apiClient.patch(`/orders/${orderId}/status/`, {
    status: normalizeStatus(status),
  });

  return normalizeOrder(extractOrderObject(response.data));
}
