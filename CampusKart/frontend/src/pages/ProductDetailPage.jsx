import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { fetchProductBySlug, fetchProducts } from '../api/products'
import { fetchReviewsByProduct } from '../api/reviews'
import ProductCard from '../components/ui/ProductCard'
import { useToast } from '../hooks/useToast'

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

function buildStarRow(rating) {
  const filled = Math.round(toNumber(rating))
  return Array.from({ length: 5 }, (_, index) => index < filled)
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-52 animate-pulse rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="aspect-[4/3] animate-pulse rounded-xl bg-slate-200" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`thumb-skeleton-${index}`} className="aspect-square animate-pulse rounded bg-slate-200" />
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-1/4 animate-pulse rounded bg-slate-200" />
          <div className="h-20 w-full animate-pulse rounded bg-slate-200" />
          <div className="h-11 w-full animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    </div>
  )
}

function ProductDetailPage() {
  const { slug } = useParams()
  const { showToast } = useToast()
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)

  const productQuery = useQuery({
    queryKey: ['product-detail', slug],
    queryFn: () => fetchProductBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  })

  const product = productQuery.data

  const reviewsQuery = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: () => fetchReviewsByProduct(product.id),
    enabled: Boolean(product?.id),
    staleTime: 5 * 60 * 1000,
  })

  const relatedQuery = useQuery({
    queryKey: ['related-products', product?.category],
    queryFn: () =>
      fetchProducts({
        category: product.category,
        page: 1,
        ordering: '-total_sold',
      }),
    enabled: Boolean(product?.category),
    staleTime: 5 * 60 * 1000,
  })

  const images = useMemo(() => {
    if (!product) {
      return []
    }
    return product.images?.length
      ? product.images
      : [
          {
            id: 'fallback',
            image_url: 'https://placehold.co/1200x900/e2e8f0/334155?text=CampusKart',
          },
        ]
  }, [product])

  const selectedImage = images[selectedImageIndex]?.image_url || images[0]?.image_url
  const reviews = reviewsQuery.data || []
  const relatedProducts = (relatedQuery.data?.results || []).filter((item) => item.id !== product?.id).slice(0, 3)

  if (productQuery.isLoading) {
    return <DetailSkeleton />
  }

  if (productQuery.isError || !product) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">Product Not Found</h1>
        <p className="mt-2 text-sm text-muted">
          This item may have been removed or is temporarily unavailable.
        </p>
        <Link
          to="/shop"
          className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Back to Shop
        </Link>
      </div>
    )
  }

  const price = toNumber(product.price)
  const discountPrice = product.discount_price ? toNumber(product.discount_price) : null
  const hasDiscount = discountPrice !== null && discountPrice < price
  const discountPercent = hasDiscount ? Math.round(((price - discountPrice) / price) * 100) : 0

  return (
    <section className="space-y-8">
      <nav className="text-sm text-muted">
        <Link to="/shop" className="hover:text-accent">
          Shop
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img
              src={selectedImage}
              alt={product.name}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {images.map((image, index) => (
              <button
                key={image.id || index}
                type="button"
                onClick={() => setSelectedImageIndex(index)}
                className={`overflow-hidden rounded-md border ${
                  index === selectedImageIndex ? 'border-accent ring-1 ring-accent' : 'border-slate-200'
                }`}
              >
                <img
                  src={image.image_url}
                  alt={`${product.name} ${index + 1}`}
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-primary">{product.name}</h1>
            <p className="text-sm text-muted">Sold by {product.vendor_name || 'Campus Vendor'}</p>
            <div className="flex items-center gap-1 text-warning" aria-label={`Rating ${product.avg_rating || 0} out of 5`}>
              {buildStarRow(product.avg_rating).map((isFilled, index) => (
                <span key={`detail-star-${index}`} className={isFilled ? 'opacity-100' : 'opacity-25'}>
                  ★
                </span>
              ))}
              <span className="ml-1 text-xs text-muted">
                {toNumber(product.avg_rating).toFixed(1)} ({reviews.length} reviews)
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-primary">
                {formatPrice(hasDiscount ? discountPrice : price)}
              </p>
              {hasDiscount ? (
                <span className="rounded-full bg-error px-2 py-0.5 text-xs font-semibold text-white">
                  {discountPercent}% OFF
                </span>
              ) : null}
            </div>
            {hasDiscount ? <p className="mt-1 text-sm text-muted line-through">{formatPrice(price)}</p> : null}
          </div>

          <p className="text-sm leading-6 text-slate-700">{product.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              SKU: {product.sku || 'N/A'}
            </span>
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                product.stock > 0 ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
              }`}
            >
              {product.stock > 0 ? `In Stock (${product.stock})` : 'Out of Stock'}
            </span>
            {product.tags?.map((tag) => (
              <span key={tag.id} className="rounded-full border border-accent/30 px-2 py-1 text-xs text-accent">
                #{tag.tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700" htmlFor="quantity">
              Quantity
            </label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={Math.max(1, product.stock || 1)}
              value={quantity}
              onChange={(event) => {
                const next = Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, product.stock || 1)))
                setQuantity(next)
              }}
              className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <button
            type="button"
            disabled={product.stock <= 0}
            onClick={() =>
              showToast(
                `Added ${quantity} x ${product.name} to cart (cart flow will be finalized in M2-7).`,
                'success',
              )
            }
            className="w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Add to Cart
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-primary">Customer Reviews</h2>

        {reviewsQuery.isLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`review-skeleton-${index}`} className="rounded-lg border border-slate-200 p-3">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : null}

        {!reviewsQuery.isLoading && reviews.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No reviews yet for this product.</p>
        ) : null}

        {!reviewsQuery.isLoading && reviews.length > 0 ? (
          <div className="mt-4 space-y-3">
            {reviews.slice(0, 5).map((review) => (
              <article key={review.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">{review.title || 'Review'}</h3>
                  <div className="flex items-center gap-1 text-warning">
                    {buildStarRow(review.rating).map((isFilled, index) => (
                      <span key={`${review.id}-rating-${index}`} className={isFilled ? 'opacity-100' : 'opacity-25'}>
                        ★
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted">by {review.reviewer_username || 'Campus User'}</p>
                <p className="mt-2 text-sm text-slate-700">{review.body || 'No additional comment provided.'}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-primary">Related Products</h2>

        {relatedQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`related-skeleton-${index}`}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="aspect-[4/3] animate-pulse bg-slate-200" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!relatedQuery.isLoading && relatedProducts.length === 0 ? (
          <p className="text-sm text-muted">No related products found right now.</p>
        ) : null}

        {!relatedQuery.isLoading && relatedProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}

export default ProductDetailPage
