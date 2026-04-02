import apiClient from './client'

function buildQueryString(params) {
  const query = new URLSearchParams()

  if (params.category) {
    query.set('category', params.category)
  }

  if (Array.isArray(params.tags)) {
    params.tags.forEach((tag) => {
      if (tag) {
        query.append('tag', tag)
      }
    })
  }

  if (params.min_price !== '') {
    query.set('min_price', String(params.min_price))
  }

  if (params.max_price !== '') {
    query.set('max_price', String(params.max_price))
  }

  if (params.search) {
    query.set('search', params.search)
  }

  if (params.vendor) {
    query.set('vendor', String(params.vendor))
  }

  if (params.status) {
    query.set('status', params.status)
  }

  if (params.ordering) {
    query.set('ordering', params.ordering)
  }

  query.set('page', String(params.page || 1))

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export async function fetchProducts(filters) {
  const queryString = buildQueryString(filters)
  const response = await apiClient.get(`/products/${queryString}`)
  return response.data
}

export async function fetchProductBySlug(slug) {
  const response = await apiClient.get(`/products/${slug}/`)
  return response.data
}

export async function fetchCategories() {
  const response = await apiClient.get('/products/categories/')
  return response.data
}

export async function fetchProductTags() {
  const response = await apiClient.get('/products/tags/')
  return response.data
}

export async function createProduct(payload) {
  const response = await apiClient.post('/products/', payload)
  return response.data
}

export async function updateProduct(slug, payload) {
  const response = await apiClient.patch(`/products/${slug}/`, payload)
  return response.data
}

export async function deleteProduct(slug) {
  await apiClient.delete(`/products/${slug}/`)
}
