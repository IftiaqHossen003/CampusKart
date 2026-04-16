import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";
import ProductCard from "../components/ui/ProductCard";
import { useWishlist } from "../hooks/useWishlist";

function WishlistPage() {
  const navigate = useNavigate();
  const { wishlistQuery, toggleProductWishlist } = useWishlist();

  const wishlistItems = useMemo(() => {
    if (!Array.isArray(wishlistQuery.data?.results)) {
      return [];
    }

    return wishlistQuery.data.results
      .map((item) => ({
        id: item.id,
        product: item.product,
      }))
      .filter((item) => Boolean(item.product?.id));
  }, [wishlistQuery.data]);

  if (wishlistQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">My Wishlist</h1>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`wishlist-skeleton-${index}`}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="aspect-[4/3] animate-pulse bg-slate-200" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
                <div className="h-10 w-full animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (wishlistQuery.isError) {
    const detail =
      wishlistQuery.error?.response?.data?.detail ||
      "Could not load your wishlist right now. Please try again.";

    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">
          Could not load wishlist
        </h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
        <button
          type="button"
          onClick={() => wishlistQuery.refetch()}
          className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Retry
        </button>
      </section>
    );
  }

  if (wishlistItems.length === 0) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">My Wishlist</h1>
          <p className="mt-1 text-sm text-muted">
            Save products here for quick access later.
          </p>
        </div>

        <EmptyState
          title="Your wishlist is empty"
          message="Bookmark products you love and move them to cart whenever you are ready."
          actionLabel="Browse Products"
          onAction={() => navigate("/shop")}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">My Wishlist</h1>
        <p className="mt-1 text-sm text-muted">
          {wishlistItems.length} product{wishlistItems.length === 1 ? "" : "s"}{" "}
          saved.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {wishlistItems.map(({ id, product }) => (
          <div key={id} className="space-y-2">
            <ProductCard
              product={product}
              cartButtonLabel="Move to Cart"
              onAddToCartSuccess={(movedProduct) => {
                if (movedProduct?.id) {
                  toggleProductWishlist(movedProduct);
                }
              }}
            />

            <button
              type="button"
              onClick={() => toggleProductWishlist(product)}
              className="inline-flex items-center gap-2 rounded-md border border-error/40 px-3 py-1.5 text-xs font-semibold text-error transition hover:bg-error/10"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4C8.24 4 9.91 4.81 11 6.09 12.09 4.81 13.76 4 15.5 4A4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              Remove from wishlist
            </button>
          </div>
        ))}
      </div>

      <div>
        <Link
          to="/shop"
          className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Continue browsing
        </Link>
      </div>
    </section>
  );
}

export default WishlistPage;
