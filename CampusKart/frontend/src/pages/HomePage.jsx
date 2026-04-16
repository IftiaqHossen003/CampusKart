import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { A11y, Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import { fetchPublicBanners } from "../api/banners";
import { fetchCategories, fetchProducts } from "../api/products";
import { fetchVendorSpotlight } from "../api/vendors";
import ProductCard from "../components/ui/ProductCard";

import "swiper/css";
import "swiper/css/pagination";

const SECTION_STALE_TIME = 5 * 60 * 1000;

function HeroSkeleton() {
  return (
    <div className="h-56 animate-pulse rounded-xl bg-slate-200 sm:h-72 lg:h-80" />
  );
}

function CategorySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={`category-skeleton-${index}`}
          className="h-24 animate-pulse rounded-xl bg-slate-200"
        />
      ))}
    </div>
  );
}

function ProductRowSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`top-product-skeleton-${index}`}
          className="h-[320px] min-w-[260px] animate-pulse rounded-xl bg-slate-200"
        />
      ))}
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={`new-product-skeleton-${index}`}
          className="h-[320px] animate-pulse rounded-xl bg-slate-200"
        />
      ))}
    </div>
  );
}

function VendorSpotlightSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`vendor-skeleton-${index}`}
          className="h-48 animate-pulse rounded-xl bg-slate-200"
        />
      ))}
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();

  const bannersQuery = useQuery({
    queryKey: ["homepage-banners"],
    queryFn: fetchPublicBanners,
    staleTime: SECTION_STALE_TIME,
  });

  const categoriesQuery = useQuery({
    queryKey: ["homepage-categories"],
    queryFn: fetchCategories,
    staleTime: SECTION_STALE_TIME,
  });

  const topProductsQuery = useQuery({
    queryKey: ["homepage-top-products"],
    queryFn: () => fetchProducts({ page: 1, ordering: "-total_sold" }),
    staleTime: SECTION_STALE_TIME,
  });

  const newArrivalsQuery = useQuery({
    queryKey: ["homepage-new-arrivals"],
    queryFn: () => fetchProducts({ page: 1, ordering: "-created_at" }),
    staleTime: SECTION_STALE_TIME,
  });

  const vendorSpotlightQuery = useQuery({
    queryKey: ["homepage-vendor-spotlight"],
    queryFn: () => fetchVendorSpotlight({ limit: 3 }),
    staleTime: SECTION_STALE_TIME,
  });

  const banners = bannersQuery.data || [];
  const categoriesData = categoriesQuery.data;
  const categories = Array.isArray(categoriesData)
    ? categoriesData
    : Array.isArray(categoriesData?.results)
      ? categoriesData.results
      : [];
  const topProducts = (topProductsQuery.data?.results || []).slice(0, 10);
  const newArrivals = (newArrivalsQuery.data?.results || []).slice(0, 8);
  const vendorSpotlight = vendorSpotlightQuery.data || [];

  const featuredCategories = useMemo(() => {
    const flattened = [];
    categories.forEach((category) => {
      flattened.push(category);
      if (Array.isArray(category.children)) {
        flattened.push(...category.children);
      }
    });

    const unique = [];
    const seen = new Set();
    flattened.forEach((category) => {
      if (!category?.id || seen.has(category.id)) {
        return;
      }
      seen.add(category.id);
      unique.push(category);
    });

    return unique.slice(0, 8);
  }, [categories]);

  return (
    <section className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        {bannersQuery.isLoading ? <HeroSkeleton /> : null}

        {!bannersQuery.isLoading && banners.length > 0 ? (
          <Swiper
            modules={[Autoplay, Pagination, A11y]}
            pagination={{ clickable: true }}
            autoplay={{ delay: 4500, disableOnInteraction: false }}
            loop={banners.length > 1}
            className="rounded-xl"
          >
            {banners.map((banner) => (
              <SwiperSlide key={banner.id}>
                {banner.link ? (
                  <a
                    href={banner.link}
                    className="block"
                    aria-label={banner.title || "Homepage banner"}
                  >
                    <img
                      src={banner.image_url}
                      alt={banner.title || "CampusKart banner"}
                      loading="lazy"
                      className="h-56 w-full rounded-xl object-cover sm:h-72 lg:h-80"
                    />
                  </a>
                ) : (
                  <img
                    src={banner.image_url}
                    alt={banner.title || "CampusKart banner"}
                    loading="lazy"
                    className="h-56 w-full rounded-xl object-cover sm:h-72 lg:h-80"
                  />
                )}
              </SwiperSlide>
            ))}
          </Swiper>
        ) : null}

        {!bannersQuery.isLoading && banners.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent text-white sm:h-72 lg:h-80">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                CampusKart
              </p>
              <h1 className="mt-2 text-3xl font-bold">
                Shop smarter on campus
              </h1>
              <p className="mt-3 text-sm text-white/90">
                Find trusted vendors, daily deals, and student favorites.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primary">
            Featured Categories
          </h2>
          <Link
            to="/shop"
            className="text-sm font-semibold text-accent hover:underline"
          >
            Browse all
          </Link>
        </div>

        {categoriesQuery.isLoading ? <CategorySkeleton /> : null}

        {!categoriesQuery.isLoading && featuredCategories.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featuredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/shop?category=${category.id}&page=1`)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white"
              >
                {category.icon_url ? (
                  <img
                    src={category.icon_url}
                    alt={category.name}
                    loading="lazy"
                    className="mb-2 h-10 w-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-xl text-primary">
                    #
                  </div>
                )}
                <p className="line-clamp-2 text-sm font-semibold text-slate-800">
                  {category.name}
                </p>
              </button>
            ))}
          </div>
        ) : null}

        {!categoriesQuery.isLoading && featuredCategories.length === 0 ? (
          <p className="text-sm text-muted">
            No categories available right now.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primary">Top Products</h2>
          <Link
            to="/shop?sort=popular&page=1"
            className="text-sm font-semibold text-accent hover:underline"
          >
            View all
          </Link>
        </div>

        {topProductsQuery.isLoading ? <ProductRowSkeleton /> : null}

        {!topProductsQuery.isLoading && topProducts.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {topProducts.map((product) => (
              <div
                key={product.id}
                className="min-w-[260px] max-w-[300px] flex-1"
              >
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        ) : null}

        {!topProductsQuery.isLoading && topProducts.length === 0 ? (
          <p className="text-sm text-muted">
            Top products are unavailable right now.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primary">New Arrivals</h2>
          <Link
            to="/shop?sort=newest&page=1"
            className="text-sm font-semibold text-accent hover:underline"
          >
            See all
          </Link>
        </div>

        {newArrivalsQuery.isLoading ? <ProductGridSkeleton /> : null}

        {!newArrivalsQuery.isLoading && newArrivals.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}

        {!newArrivalsQuery.isLoading && newArrivals.length === 0 ? (
          <p className="text-sm text-muted">
            No new arrivals available right now.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primary">Vendor Spotlight</h2>
          <Link
            to="/shop"
            className="text-sm font-semibold text-accent hover:underline"
          >
            Shop by vendor
          </Link>
        </div>

        {vendorSpotlightQuery.isLoading ? <VendorSpotlightSkeleton /> : null}

        {!vendorSpotlightQuery.isLoading && vendorSpotlight.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vendorSpotlight.map((vendor) => (
              <button
                key={vendor.id}
                type="button"
                onClick={() => navigate(`/shop?vendor=${vendor.id}&page=1`)}
                className="overflow-hidden rounded-xl border border-slate-200 text-left transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <img
                  src={
                    vendor.banner_url ||
                    vendor.logo_url ||
                    "https://placehold.co/800x320/e2e8f0/334155?text=Campus+Vendor"
                  }
                  alt={vendor.shop_name}
                  loading="lazy"
                  className="h-32 w-full object-cover"
                />
                <div className="space-y-1 p-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    {vendor.shop_name}
                  </h3>
                  <p className="line-clamp-2 text-sm text-slate-600">
                    {vendor.description || "Trusted campus vendor"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {!vendorSpotlightQuery.isLoading && vendorSpotlight.length === 0 ? (
          <p className="text-sm text-muted">
            No spotlight vendors available yet.
          </p>
        ) : null}
      </section>
    </section>
  );
}

export default HomePage;
