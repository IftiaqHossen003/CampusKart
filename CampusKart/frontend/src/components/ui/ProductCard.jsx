import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import { useWishlist } from "../../hooks/useWishlist";
import { useCartStore } from "../../store/cartStore";
import OptimizedProductImage from "./OptimizedProductImage";

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

function buildStarRow(avgRating) {
  const filled = Math.round(toNumber(avgRating));
  return Array.from({ length: 5 }, (_, index) => index < filled);
}

function getApiErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || fallbackMessage;
}

function ProductCard({
  product,
  cartButtonLabel = "Add to Cart",
  onAddToCartSuccess,
}) {
  const { showError, showSuccess } = useToast();
  const addItem = useCartStore((state) => state.addItem);
  const { isWishlisted, toggleProductWishlist, isTogglingWishlist } =
    useWishlist();

  const price = toNumber(product.price);
  const discountPrice = product.discount_price
    ? toNumber(product.discount_price)
    : null;
  const hasDiscount = discountPrice !== null && discountPrice < price;
  const discountPercent = hasDiscount
    ? Math.round(((price - discountPrice) / Math.max(price, 1)) * 100)
    : 0;
  const hasStockInfo = product.stock !== null && product.stock !== undefined;
  const isOutOfStock = hasStockInfo && toNumber(product.stock) <= 0;
  const imageUrl =
    product.images?.find((image) => image.is_primary)?.image_url ||
    product.images?.[0]?.image_url ||
    "https://placehold.co/800x600/1C1C1C/D9D9D9?text=CampusKart";

  const addToCartMutation = useMutation({
    mutationFn: () => addItem({ product, quantity: 1 }),
    onSuccess: () => {
      showSuccess(`${product.name} added to cart.`);
      if (typeof onAddToCartSuccess === "function") {
        onAddToCartSuccess(product);
      }
    },
    onError: (error) => {
      showError(
        getApiErrorMessage(error, "Could not add this product to cart."),
      );
    },
  });

  const productIsWishlisted = isWishlisted(product.id);

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-[var(--ck-surface)] shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition duration-300 hover:-translate-y-1 hover:border-white/20">
      <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
        <button
          type="button"
          onClick={() => toggleProductWishlist(product)}
          title={
            productIsWishlisted ? "Remove from wishlist" : "Add to wishlist"
          }
          aria-label={
            productIsWishlisted ? "Remove from wishlist" : "Add to wishlist"
          }
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white shadow-sm transition hover:scale-105 hover:border-[var(--ck-accent)] hover:text-[var(--ck-accent)]"
          disabled={isTogglingWishlist}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4C8.24 4 9.91 4.81 11 6.09 12.09 4.81 13.76 4 15.5 4A4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"
              fill={productIsWishlisted ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.75"
              className={
                productIsWishlisted
                  ? "text-[var(--ck-accent)]"
                  : "text-[#d9d9d9]"
              }
            />
          </svg>
        </button>

        <OptimizedProductImage
          src={imageUrl}
          alt={product.name}
          width={640}
          height={480}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
        />

        {hasDiscount ? (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--ck-danger)] px-2.5 py-1 text-xs font-semibold text-white">
            {discountPercent}% OFF
          </span>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <Link
            to={`/shop/products/${product.slug}`}
            className="line-clamp-2 text-sm font-semibold text-white transition hover:text-[var(--ck-accent)]"
          >
            {product.name}
          </Link>
          <p className="mt-1 text-xs text-[#d9d9d9]">
            by {product.vendor_name || "Campus Vendor"}
          </p>
        </div>

        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <p className="text-base font-bold text-white">
              {formatPrice(hasDiscount ? discountPrice : price)}
            </p>
            {hasDiscount ? (
              <p className="text-xs text-[#a7a7a7] line-through">
                {formatPrice(price)}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className="flex items-center gap-1"
          aria-label={`Rating ${product.avg_rating || 0} out of 5`}
        >
          {buildStarRow(product.avg_rating).map((isFilled, index) => (
            <svg
              key={`${product.id}-star-${index}`}
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${isFilled ? "text-[var(--ck-accent)]" : "text-white/30"}`}
            >
              <path
                fill="currentColor"
                d="m12 17.27 5.15 3.11-1.37-5.86 4.55-3.94-6-.51L12 4.5 9.67 10.07l-6 .51 4.55 3.94-1.37 5.86z"
              />
            </svg>
          ))}
          <span className="ml-1 text-xs text-[#d9d9d9]">
            ({toNumber(product.avg_rating).toFixed(1)})
          </span>
        </div>

        <button
          type="button"
          disabled={isOutOfStock || addToCartMutation.isPending}
          onClick={() => addToCartMutation.mutate()}
          className="w-full rounded-xl bg-[var(--ck-accent)] px-3 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-[#7f7f7f] disabled:text-[#2b2b2b]"
        >
          {isOutOfStock
            ? "Out of Stock"
            : addToCartMutation.isPending
              ? "Adding..."
              : cartButtonLabel}
        </button>
      </div>
    </article>
  );
}

export default ProductCard;
