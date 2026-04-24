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
  uploadProductImage,
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

function getApiErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || fallbackMessage
}

function VendorProductsPage() {
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useToast()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
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
    mutationFn: async ({ payload, imageFile }) => {
      const product = await createProduct(payload)
      let imageUploadError = null

      if (imageFile) {
        if (product?.id) {
          try {
            await uploadProductImage(product.id, imageFile)
          } catch (error) {
            imageUploadError = error
          }
        } else {
          imageUploadError = new Error('Product ID missing from create response.')
        }
      }

      return {
        imageUploadError,
        hasImageUploadRequest: Boolean(imageFile),
      }
    },
    onSuccess: ({ imageUploadError, hasImageUploadRequest }) => {
      if (hasImageUploadRequest && !imageUploadError) {
        showSuccess('Product created and image upload queued.')
      } else {
        showSuccess('Product created and sent for approval.')
      }

      if (imageUploadError) {
        showError(getApiErrorMessage(imageUploadError, 'Product was created, but image upload failed.'))
      }

      setIsFormOpen(false)
      form.reset(defaultValues)
      setSelectedImageFile(null)
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] })
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, 'Could not create product.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ slug, payload, imageFile, productId }) => {
      await updateProduct(slug, payload)
      let imageUploadError = null

      if (imageFile) {
        if (productId) {
          try {
            await uploadProductImage(productId, imageFile)
          } catch (error) {
            imageUploadError = error
          }
        } else {
          imageUploadError = new Error('Product ID missing for image upload.')
        }
      }

      return {
        imageUploadError,
        hasImageUploadRequest: Boolean(imageFile),
      }
    },
    onSuccess: ({ imageUploadError, hasImageUploadRequest }) => {
      if (hasImageUploadRequest && !imageUploadError) {
        showSuccess('Product updated and image upload queued.')
      } else {
        showSuccess('Product updated successfully.')
      }

      if (imageUploadError) {
        showError(getApiErrorMessage(imageUploadError, 'Product was updated, but image upload failed.'))
      }

      setEditingProduct(null)
      setIsFormOpen(false)
      form.reset(defaultValues)
      setSelectedImageFile(null)
      queryClient.invalidateQueries({ queryKey: ['vendor-products'] })
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, 'Could not update product.'))
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
  const vendorStatus = vendorQuery.data?.status
  const isVendorApproved = vendorStatus === 'approved'

  const categoryOptions = useMemo(() => {
    const categoriesData = categoriesQuery.data
    const categories = Array.isArray(categoriesData)
      ? categoriesData
      : Array.isArray(categoriesData?.results)
        ? categoriesData.results
        : []

    return categories.flatMap((category) => [
      { id: category.id, name: category.name },
      ...(category.children || []).map((child) => ({ id: child.id, name: `${category.name} / ${child.name}` })),
    ])
  }, [categoriesQuery.data])

  const openCreateForm = () => {
    if (!isVendorApproved) {
      showError('Your vendor account is not yet approved. Please wait for admin approval.')
      return
    }

    setEditingProduct(null)
    form.reset(defaultValues)
    setSelectedImageFile(null)
    setIsFormOpen(true)
  }

  const openEditForm = (product) => {
    if (!isVendorApproved) {
      showError('Your vendor account is not yet approved. Please wait for admin approval.')
      return
    }

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
    setSelectedImageFile(null)
    setIsFormOpen(true)
  }

  const closeForm = () => {
    if (createMutation.isPending || updateMutation.isPending) {
      return
    }
    setIsFormOpen(false)
    setEditingProduct(null)
    setSelectedImageFile(null)
    form.reset(defaultValues)
  }

  const onSubmit = (values) => {
    if (!isVendorApproved) {
      showError('Your vendor account is not yet approved. Please wait for admin approval.')
      return
    }

    const payload = toPayload(values)

    if (editingProduct?.slug) {
      updateMutation.mutate({
        slug: editingProduct.slug,
        payload,
        imageFile: selectedImageFile,
        productId: editingProduct.id,
      })
      return
    }

    createMutation.mutate({ payload, imageFile: selectedImageFile })
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Vendor Product Management</h1>
            <p className="mt-1 text-sm text-slate-400">Manage your catalog, pricing, and approval status.</p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            disabled={!isVendorApproved}
            className="rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-white/20"
          >
            Add New Product
          </button>
        </div>

        {vendorQuery.isSuccess && !isVendorApproved ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your vendor account is currently <span className="font-semibold">{vendorStatus}</span>. Product creation is enabled after admin approval.
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value)
              setPage(1)
            }}
            placeholder="Search your products"
            className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
          />

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
            className="rounded-md border border-white/20 bg-[var(--ck-surface)] px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <p className="self-center text-sm text-slate-400">{totalCount} products</p>
        </div>
      </div>

      {productsQuery.isLoading ? <ProductGridSkeleton /> : null}

      {!productsQuery.isLoading && products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[var(--ck-surface)] p-8 text-center">
          <h2 className="text-lg font-semibold text-white">No Products Yet</h2>
          <p className="mt-2 text-sm text-slate-400">Add your first product to start selling on CampusKart.</p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-4 rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
          >
            Create Product
          </button>
        </div>
      ) : null}

      {!productsQuery.isLoading && products.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[var(--ck-surface)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-[var(--ck-surface-deep)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[var(--ck-surface)]">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-3 text-sm text-white">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-slate-400">{product.category_name}</p>
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
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatPrice(product.discount_price || product.price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{product.stock}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(product)}
                          disabled={!isVendorApproved}
                          className="rounded border border-white/20 px-2.5 py-1 text-xs font-medium text-slate-400 hover:bg-white/5"
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
                          disabled={!isVendorApproved || deleteMutation.isPending}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--ck-surface)] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded border border-white/20 px-2 py-1 text-xs text-slate-400"
              >
                Close
              </button>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="name">
                  Product Name
                </label>
                <input
                  id="name"
                  type="text"
                  {...form.register('name')}
                  className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
                {form.formState.errors.name ? (
                  <p className="mt-1 text-xs text-error">{form.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="category">
                  Category
                </label>
                <select
                  id="category"
                  {...form.register('category')}
                  className="w-full rounded-md border border-white/20 bg-[var(--ck-surface)] px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
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
                <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  {...form.register('description')}
                  className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
                {form.formState.errors.description ? (
                  <p className="mt-1 text-xs text-error">{form.formState.errors.description.message}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="price">
                    Price
                  </label>
                  <input
                    id="price"
                    type="number"
                    step="0.01"
                    {...form.register('price')}
                    className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                  />
                  {form.formState.errors.price ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.price.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="discount_price">
                    Discount Price
                  </label>
                  <input
                    id="discount_price"
                    type="number"
                    step="0.01"
                    {...form.register('discount_price')}
                    className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                  />
                  {form.formState.errors.discount_price ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.discount_price.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="stock">
                    Stock
                  </label>
                  <input
                    id="stock"
                    type="number"
                    {...form.register('stock')}
                    className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                  />
                  {form.formState.errors.stock ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.stock.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="sku">
                    SKU (optional)
                  </label>
                  <input
                    id="sku"
                    type="text"
                    {...form.register('sku')}
                    className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                  />
                  {form.formState.errors.sku ? (
                    <p className="mt-1 text-xs text-error">{form.formState.errors.sku.message}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400" htmlFor="product-image">
                  Product Image (optional)
                </label>
                <input
                  id="product-image"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    setSelectedImageFile(file)
                  }}
                  className="w-full rounded-md border border-white/20 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-white/5 file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-400 hover:file:bg-white/10 focus:border-[var(--ck-accent)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">Supported formats: JPG, PNG, WEBP (max 5MB).</p>
                {selectedImageFile ? (
                  <p className="mt-1 text-xs text-slate-400">Selected: {selectedImageFile.name}</p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
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




