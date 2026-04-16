import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchProductBySlug, fetchProducts } from "../api/products";
import {
  createProductReview,
  fetchProductReviewEligibility,
  fetchProductReviews,
} from "../api/reviews";
import ProductCard from "../components/ui/ProductCard";
import { useToast } from "../hooks/useToast";
import { useAuthStore } from "../store/authStore";
import { useCartStore } from "../store/cartStore";

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
  }).format(parsed);
}

function buildStarRow(rating) {
  const filled = Math.round(toNumber(rating));
  return Array.from({ length: 5 }, (_, index) => index < filled);
}

function getApiErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || fallbackMessage;
}

function getInitials(name) {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return "CU";
  }

  const pieces = normalized.split(/\s+/).filter(Boolean);
  if (pieces.length === 1) {
    return pieces[0].slice(0, 2).toUpperCase();
  }

  return `${pieces[0][0]}${pieces[1][0]}`.toUpperCase();
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
              <div
                key={`thumb-skeleton-${index}`}
                className="aspect-square animate-pulse rounded bg-slate-200"
              />
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
  );
}

function ProductDetailPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const addItem = useCartStore((state) => state.addItem);
  const user = useAuthStore((state) => state.user);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedRating, setSelectedRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState("");

  const isStudent = user?.role === "student";

  const productQuery = useQuery({
    queryKey: ["product-detail", slug],
    queryFn: () => fetchProductBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });

  const product = productQuery.data;

  const reviewsQuery = useInfiniteQuery({
    queryKey: ["product-reviews", product?.id],
    queryFn: ({ pageParam = 1 }) =>
      fetchProductReviews(product.id, { page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage || undefined,
    enabled: Boolean(product?.id),
    staleTime: 60 * 1000,
  });

  const reviewEligibilityQuery = useQuery({
    queryKey: ["product-review-eligibility", product?.id, user?.id],
    queryFn: () => fetchProductReviewEligibility(product.id),
    enabled: Boolean(product?.id) && isStudent,
    staleTime: 30 * 1000,
  });

  const relatedQuery = useQuery({
    queryKey: ["related-products", product?.category],
    queryFn: () =>
      fetchProducts({
        category: product.category,
        page: 1,
        ordering: "-total_sold",
      }),
    enabled: Boolean(product?.category),
    staleTime: 5 * 60 * 1000,
  });

  const images = useMemo(() => {
    if (!product) {
      return [];
    }
    return product.images?.length
      ? product.images
      : [
          {
            id: "fallback",
            image_url:
              "https://placehold.co/1200x900/e2e8f0/334155?text=CampusKart",
          },
        ];
  }, [product]);

  const selectedImage =
    images[selectedImageIndex]?.image_url || images[0]?.image_url;
  const reviews = (reviewsQuery.data?.pages || []).flatMap(
    (page) => page.results || [],
  );
  const firstReviewPage = reviewsQuery.data?.pages?.[0];
  const reviewStats = firstReviewPage?.stats || {
    average_rating: 0,
    total_reviews: 0,
    rating_counts: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
  };

  const relatedProducts = (relatedQuery.data?.results || [])
    .filter((item) => item.id !== product?.id)
    .slice(0, 3);
  const eligibleOrders = reviewEligibilityQuery.data?.eligible_orders || [];
  const canWriteReview = isStudent && eligibleOrders.length > 0;

  useEffect(() => {
    if (!isReviewModalOpen || selectedOrderId || eligibleOrders.length === 0) {
      return;
    }

    setSelectedOrderId(String(eligibleOrders[0].id));
  }, [eligibleOrders, isReviewModalOpen, selectedOrderId]);

  const addToCartMutation = useMutation({
    mutationFn: () => addItem({ product, quantity }),
    onSuccess: () => {
      showSuccess(`Added ${quantity} x ${product.name} to cart.`);
    },
    onError: (error) => {
      showError(
        getApiErrorMessage(error, "Could not add this product to cart."),
      );
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: () =>
      createProductReview(product.id, {
        order: Number(selectedOrderId),
        rating: selectedRating,
        comment: reviewComment.trim(),
      }),
    onSuccess: () => {
      setIsReviewModalOpen(false);
      setReviewComment("");
      setSelectedRating(5);
      setSelectedOrderId("");
      setReviewError("");
      showSuccess("Review submitted successfully.");
      queryClient.invalidateQueries({
        queryKey: ["product-reviews", product.id],
      });
      queryClient.invalidateQueries({ queryKey: ["product-detail", slug] });
      queryClient.invalidateQueries({
        queryKey: ["product-review-eligibility", product.id, user?.id],
      });
    },
    onError: (error) => {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.non_field_errors?.[0] ||
        error?.response?.data?.order?.[0] ||
        "Could not submit your review.";
      setReviewError(detail);
    },
  });

  const handleReviewSubmit = (event) => {
    event.preventDefault();
    setReviewError("");

    if (!selectedOrderId) {
      setReviewError("Please select an order before submitting your review.");
      return;
    }

    if (selectedRating < 1 || selectedRating > 5) {
      setReviewError("Please select a valid rating from 1 to 5 stars.");
      return;
    }

    submitReviewMutation.mutate();
  };

  if (productQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (productQuery.isError || !product) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">
          Product Not Found
        </h1>
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
    );
  }

  const price = toNumber(product.price);
  const discountPrice = product.discount_price
    ? toNumber(product.discount_price)
    : null;
  const hasDiscount = discountPrice !== null && discountPrice < price;
  const discountPercent = hasDiscount
    ? Math.round(((price - discountPrice) / price) * 100)
    : 0;

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
                  index === selectedImageIndex
                    ? "border-accent ring-1 ring-accent"
                    : "border-slate-200"
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
            <p className="text-sm text-muted">
              Sold by {product.vendor_name || "Campus Vendor"}
            </p>
            <div
              className="flex items-center gap-1 text-warning"
              aria-label={`Rating ${product.avg_rating || 0} out of 5`}
            >
              {buildStarRow(product.avg_rating).map((isFilled, index) => (
                <span
                  key={`detail-star-${index}`}
                  className={isFilled ? "opacity-100" : "opacity-25"}
                >
                  ★
                </span>
              ))}
              <span className="ml-1 text-xs text-muted">
                {toNumber(product.avg_rating).toFixed(1)} (
                {toNumber(reviewStats.total_reviews)} reviews)
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
            {hasDiscount ? (
              <p className="mt-1 text-sm text-muted line-through">
                {formatPrice(price)}
              </p>
            ) : null}
          </div>

          <p className="text-sm leading-6 text-slate-700">
            {product.description}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              SKU: {product.sku || "N/A"}
            </span>
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                product.stock > 0
                  ? "bg-success/15 text-success"
                  : "bg-error/15 text-error"
              }`}
            >
              {product.stock > 0
                ? `In Stock (${product.stock})`
                : "Out of Stock"}
            </span>
            {product.tags?.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border border-accent/30 px-2 py-1 text-xs text-accent"
              >
                #{tag.tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="quantity"
            >
              Quantity
            </label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={Math.max(1, product.stock || 1)}
              value={quantity}
              onChange={(event) => {
                const next = Math.max(
                  1,
                  Math.min(
                    Number(event.target.value) || 1,
                    Math.max(1, product.stock || 1),
                  ),
                );
                setQuantity(next);
              }}
              className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <button
            type="button"
            disabled={product.stock <= 0 || addToCartMutation.isPending}
            onClick={() => addToCartMutation.mutate()}
            className="w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {product.stock <= 0
              ? "Out of Stock"
              : addToCartMutation.isPending
                ? "Adding..."
                : "Add to Cart"}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-primary">
              Customer Reviews
            </h2>
            <p className="mt-1 text-xs text-muted">
              Verified purchase reviews from CampusKart buyers.
            </p>
          </div>

          {canWriteReview ? (
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-primary"
            >
              Write a Review
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-[180px_1fr]">
          <div>
            <p className="text-4xl font-bold text-primary">
              {toNumber(reviewStats.average_rating).toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-muted">Average rating</p>
            <p className="mt-2 text-xs text-slate-600">
              {toNumber(reviewStats.total_reviews)} total reviews
            </p>
          </div>

          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const starCount = toNumber(
                reviewStats.rating_counts?.[String(star)] || 0,
              );
              const totalReviews = Math.max(
                1,
                toNumber(reviewStats.total_reviews),
              );
              const width = `${Math.round((starCount / totalReviews) * 100)}%`;

              return (
                <div
                  key={`summary-star-${star}`}
                  className="grid grid-cols-[56px_1fr_32px] items-center gap-2 text-xs text-slate-700"
                >
                  <span>{star} stars</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-warning"
                      style={{ width }}
                    />
                  </div>
                  <span className="text-right">{starCount}</span>
                </div>
              );
            })}
          </div>
        </div>

        {reviewsQuery.isLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`review-skeleton-${index}`}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : null}

        {!reviewsQuery.isLoading && reviews.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No reviews yet for this product.
          </p>
        ) : null}

        {!reviewsQuery.isLoading && reviews.length > 0 ? (
          <div className="mt-4 space-y-3">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                      {getInitials(review.user_name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {review.user_name || "Campus User"}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(review.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-warning">
                    {buildStarRow(review.rating).map((isFilled, index) => (
                      <span
                        key={`${review.id}-rating-${index}`}
                        className={isFilled ? "opacity-100" : "opacity-25"}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">
                  {review.comment || "No additional comment provided."}
                </p>
              </article>
            ))}
          </div>
        ) : null}

        {reviewsQuery.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => reviewsQuery.fetchNextPage()}
              disabled={reviewsQuery.isFetchingNextPage}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reviewsQuery.isFetchingNextPage ? "Loading..." : "Load More"}
            </button>
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
          <p className="text-sm text-muted">
            No related products found right now.
          </p>
        ) : null}

        {!relatedQuery.isLoading && relatedProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {relatedProducts.map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        ) : null}
      </section>

      {isReviewModalOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 p-4"
          onClick={() => {
            if (!submitReviewMutation.isPending) {
              setIsReviewModalOpen(false);
              setReviewError("");
            }
          }}
          role="presentation"
        >
          <div
            className="mx-auto mt-10 w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Write a review"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-primary">
                Write a Review
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!submitReviewMutation.isPending) {
                    setIsReviewModalOpen(false);
                    setReviewError("");
                  }
                }}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="review-order"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Delivered Order
                </label>
                <select
                  id="review-order"
                  value={selectedOrderId}
                  onChange={(event) => setSelectedOrderId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {eligibleOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      #{order.order_number} - {formatDate(order.created_at)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">
                  Rating
                </p>
                <div className="flex items-center gap-1 text-2xl text-warning">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const value = index + 1;
                    const isFilled = selectedRating >= value;
                    return (
                      <button
                        key={`review-rate-${value}`}
                        type="button"
                        onClick={() => setSelectedRating(value)}
                        className={isFilled ? "opacity-100" : "opacity-30"}
                        aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="review-comment"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Comment
                </label>
                <textarea
                  id="review-comment"
                  rows={4}
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="Share your experience with this product"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>

              {reviewError ? (
                <p className="text-sm text-error">{reviewError}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitReviewMutation.isPending}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitReviewMutation.isPending
                  ? "Submitting..."
                  : "Submit Review"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ProductDetailPage;
