import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  createProduct,
  deleteProduct,
  fetchCategories,
  fetchProducts,
  updateProduct,
} from '../api/products'
import { fetchMyVendorProfile } from '../api/vendors'
import Pagination from '../components/ui/Pagination'
import ProductGridSkeleton from '../components/ui/ProductGridSkeleton'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useToast } from '../hooks/useToast'

const productSchema = z
  .object({
    name: z.string().min(3, 'Product name must be at least 3 characters.'),
    category: z.coerce.number().int().positive('Please select a category.'),
    description: z.string().min(20, 'Description must be at least 20 characters.'),
    price: z.coerce.number().positive('Price must be greater than zero.'),
    discount_price: z.union([z.literal(''), z.coerce.number().positive('Discount price must be positive.')]),
    stock: z.coerce.number().int().nonnegative('Stock cannot be negative.'),
    sku: z.string().max(100, 'SKU must be 100 characters or less.').optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    if (values.discount_price !== '' && Number(values.discount_price) >= Number(values.price)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Discount price must be lower than regular price.',
        path: ['discount_price'],
      })
    }
  })

const defaultValues = {
  name: '',
  category: '',
  description: '',
  price: '',
  discount_price: '',
  stock: 0,
  sku: '',
}

function toPayload(values) {
  return {
    ...values,
    discount_price: values.discount_price === '' ? null : Number(values.discount_price),
    price: Number(values.price),
    stock: Number(values.stock),
  }
}

function formatPrice(value) {
  const number = Number(value || 0)
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(number)
}

function VendorProductsPage() {
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useToast()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const debouncedSearch = useDebouncedValue(searchInput, 400)

  const form = useForm({
    resolver: zodResolver(productSchema),
    defaultValues,
  })

  const vendorQuery = useQuery({
    queryKey: ['vendor-profile', 'me'],
    queryFn: fetchMyVendorProfile,
    staleTime: 5 * 60 * 1000,
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  })

  const vendorProductsFilters = useMemo(() => {
    const filters = {
      page,
      ordering: '-created_at',
      search: debouncedSearch.trim(),
      vendor: vendorQuery.data?.id,
    }

    if (statusFilter !== 'all') {
      filters.status = statusFilter
    }

    return filters
  }, [page, debouncedSearch, statusFilter, vendorQuery.data?.id])

  const productsQuery = useQuery({
    queryKey: ['vendor-products', vendorProductsFilters],
    queryFn: () => fetchProducts(vendorProductsFilters),
    enabled: Boolean(vendorQuery.data?.id),
    staleTime: 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      showSuccess('Product created and sent for approval.')
      setIsFormOpen(false)
      form.reset(defaultValues)
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] })
    },
    onError: (error) => {
      showError(error?.response?.data?.detail || 'Could not create product.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ slug, payload }) => updateProduct(slug, payload),
    onSuccess: () => {
      showSuccess('Product updated successfully.')
      setEditingProduct(null)
      setIsFormOpen(false)
      form.reset(defaultValues)
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] })
    },
    onError: (error) => {
      showError(error?.response?.data?.detail || 'Could not update product.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      showSuccess('Product deleted successfully.')
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] })
    },
    onError: (error) => {
      showError(error?.response?.data?.detail || 'Could not delete product.')
    },
  })

  const products = productsQuery.data?.results || []
  const totalCount = productsQuery.data?.count || 0
  const pageSize = products.length > 0 ? products.length : 20
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const categoryOptions = useMemo(() => {
    const categories = categoriesQuery.data || []
    return categories.flatMap((category) => [
      { id: category.id, name: category.name },
      ...(category.children || []).map((child) => ({ id: child.id, name: `${category.name} / ${child.name}` })),
    ])
  }, [categoriesQuery.data])

  const openCreateForm = () => {
    setEditingProduct(null)
    form.reset(defaultValues)
    setIsFormOpen(true)
  }

  const openEditForm = (product) => {
    setEditingProduct(product)
    form.reset({
      name: product.name || '',
      category: product.category || '',
      description: product.description || '',
      price: product.price || '',
      discount_price: product.discount_price || '',
      stock: product.stock || 0,
      sku: product.sku || '',
    })
    setIsFormOpen(true)
  }

  const closeForm = () => {
    if (createMutation.isPending || updateMutation.isPending) {
      return
    }
    setIsFormOpen(false)
    setEditingProduct(null)
    form.reset(defaultValues)
  }

  const onSubmit = (values) => {
    const payload = toPayload(values)

    if (editingProduct?.slug) {
      updateMutation.mutate({ slug: editingProduct.slug, payload })
      return
    }

    createMutation.mutate(payload)
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">Vendor Product Management</h1>
            <p className="mt-1 text-sm text-muted">Manage your catalog, pricing, and approval status.</p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Add New Product
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value)
              setPage(1)
            }}
            placeholder="Search your products"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <p className="self-center text-sm text-muted">{totalCount} products</p>
        </div>
      </div>

      {productsQuery.isLoading ? <ProductGridSkeleton /> : null}

      {!productsQuery.isLoading && products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-primary">No Products Yet</h2>
          <p className="mt-2 text-sm text-muted">Add your first product to start selling on CampusKart.</p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Create Product
          </button>
        </div>
      ) : null}

      {!productsQuery.isLoading && products.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted">{product.category_name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          product.status === 'approved'
                            ? 'bg-success/15 text-success'
                            : product.status === 'rejected'
                              ? 'bg-error/15 text-error'
                              : 'bg-warning/15 text-warning'
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {formatPrice(product.discount_price || product.price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{product.stock}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(product)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete ${product.name}? This cannot be undone.`)) {
                              deleteMutation.mutate(product.slug)
                            }
                          }}
                          className="rounded border border-error/40 px-2.5 py-1 text-xs font-medium text-error hover:bg-error/10"
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
                  Product Name
                </label>
                <input
                  id="name"
                  type="text"
                  {...form.register('name')}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                {form.formState.errors.name ? (
                  <p className="mt-1 text-xs text-error">{form.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="category">
                  Category
                </label>
                <select
                  id="category"
                  {...form.register('category')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.category ? (
                  <p className="mt-1 text-xs text-error">{form.formState.errors.category.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  {...form.register('description')}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                {form.formState.errors.description ? (
                  <p className="mt-1 text-xs text-error">{form.formState.errors.description.message}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="price">
                    Price
                  </label>
                  <input
                    id="price"
                    type="number"
                    step="0.01"
                    {...form.register('price')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  {form.formState.errors.price ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.price.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="discount_price">
                    Discount Price
                  </label>
                  <input
                    id="discount_price"
                    type="number"
                    step="0.01"
                    {...form.register('discount_price')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  {form.formState.errors.discount_price ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.discount_price.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="stock">
                    Stock
                  </label>
                  <input
                    id="stock"
                    type="number"
                    {...form.register('stock')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  {form.formState.errors.stock ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.stock.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sku">
                    SKU (optional)
                  </label>
                  <input
                    id="sku"
                    type="text"
                    {...form.register('sku')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  {form.formState.errors.sku ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.sku.message}</p>
                  ) : null}
                </div>
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </span>
                ) : editingProduct ? (
                  'Update Product'
                ) : (
                  'Create Product'
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default VendorProductsPage
