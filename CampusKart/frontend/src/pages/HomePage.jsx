import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { fetchPublicBanners } from "../api/banners";
import { fetchCategories, fetchProducts } from "../api/products";
import ProductCard from "../components/ui/ProductCard";

const SECTION_STALE_TIME = 5 * 60 * 1000;
const TOP_PRODUCTS_PAGE_SIZE = 12;
const NEW_ARRIVALS_PAGE_SIZE = 8;
const HERO_ROTATION_INTERVAL = 5000;
const NEW_ARRIVALS_ROTATION_INTERVAL = 3500;

function supportsCloudinaryTransforms(url) {
  return (
    typeof url === "string" &&
    url.includes("res.cloudinary.com") &&
    url.includes("/upload/")
  );
}

function cloudinaryImage(url, width, height) {
  if (!supportsCloudinaryTransforms(url)) {
    return url;
  }

  const [prefix, suffix] = url.split("/upload/");
  return `${prefix}/upload/f_auto,q_auto,c_fill,w_${width},h_${height}/${suffix}`;
}

function CategorySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`category-skeleton-${index}`}
          className="h-40 animate-pulse rounded-2xl bg-black/40"
        />
      ))}
    </div>
  );
}

function ProductGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`product-skeleton-${index}`}
          className="h-[320px] animate-pulse rounded-2xl bg-black/40"
        />
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  ctaTo,
  ctaLabel,
  dark = false,
  ctaClassName = "",
  showArrow = false,
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2
          className={`text-3xl font-extrabold tracking-tight ${dark ? "text-white" : "text-[#151515]"}`}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            className={`mt-1 text-sm ${dark ? "text-[#d9d9d9]" : "text-[#313131]"}`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {ctaTo && ctaLabel ? (
        <Link
          to={ctaTo}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${dark ? "text-[var(--ck-accent)] hover:bg-white/10" : "text-[#1e1e1e] hover:bg-black/10"} ${ctaClassName}`}
        >
          <span>{ctaLabel}</span>
          {showArrow ? (
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
              <path
                fill="currentColor"
                d="M11.3 4.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 1 1-1.4-1.4L13.59 10H4a1 1 0 1 1 0-2h9.59L11.3 5.7a1 1 0 0 1 0-1.4Z"
              />
            </svg>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [newArrivalStartIndex, setNewArrivalStartIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(() => {
    if (typeof window === "undefined") {
      return 4;
    }

    if (window.innerWidth >= 1280) {
      return 4;
    }

    if (window.innerWidth >= 640) {
      return 2;
    }

    return 1;
  });

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
    queryFn: () =>
      fetchProducts({
        page: 1,
        pageSize: TOP_PRODUCTS_PAGE_SIZE,
        ordering: "-total_sold",
      }),
    staleTime: SECTION_STALE_TIME,
  });

  const newArrivalsQuery = useQuery({
    queryKey: ["homepage-new-arrivals"],
    queryFn: () =>
      fetchProducts({
        page: 1,
        pageSize: NEW_ARRIVALS_PAGE_SIZE,
        ordering: "-created_at",
      }),
    staleTime: SECTION_STALE_TIME,
  });

  const banners = bannersQuery.data || [];
  const categories = useMemo(() => {
    const categoriesData = categoriesQuery.data;
    if (Array.isArray(categoriesData)) {
      return categoriesData;
    }
    if (Array.isArray(categoriesData?.results)) {
      return categoriesData.results;
    }
    return [];
  }, [categoriesQuery.data]);
  const topProducts = topProductsQuery.data?.results || [];
  const newArrivals = newArrivalsQuery.data?.results || [];

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

    return unique.slice(0, 4);
  }, [categories]);

  const flashDeals = useMemo(() => {
    const catalog = [...newArrivals, ...topProducts];
    const discounted = catalog.filter((product) => {
      const price = Number(product.price || 0);
      const discountPrice = Number(product.discount_price || 0);
      return discountPrice > 0 && discountPrice < price;
    });

    const dedupeById = (items) => {
      const unique = [];
      const seen = new Set();

      items.forEach((product) => {
        const key = product?.id;
        if (key == null || seen.has(key)) {
          return;
        }
        seen.add(key);
        unique.push(product);
      });

      return unique;
    };

    if (discounted.length >= 4) {
      return dedupeById(discounted).slice(0, 4);
    }

    return dedupeById(catalog).slice(0, 4);
  }, [newArrivals, topProducts]);

  const activeBanner = banners[activeBannerIndex] || null;
  const heroImage = activeBanner?.image_url
    ? cloudinaryImage(activeBanner.image_url, 1600, 900)
    : null;
  const maxNewArrivalStart = Math.max(0, newArrivals.length - cardsPerView);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1280) {
        setCardsPerView(4);
        return;
      }

      if (window.innerWidth >= 640) {
        setCardsPerView(2);
        return;
      }

      setCardsPerView(1);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (banners.length <= 1) {
      setActiveBannerIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % banners.length);
    }, HERO_ROTATION_INTERVAL);

    return () => window.clearInterval(intervalId);
  }, [banners.length]);

  useEffect(() => {
    if (newArrivals.length <= cardsPerView) {
      setNewArrivalStartIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setNewArrivalStartIndex((current) => {
        if (current >= maxNewArrivalStart) {
          return 0;
        }

        return current + 1;
      });
    }, NEW_ARRIVALS_ROTATION_INTERVAL);

    return () => window.clearInterval(intervalId);
  }, [cardsPerView, maxNewArrivalStart, newArrivals.length]);

  useEffect(() => {
    if (newArrivalStartIndex > maxNewArrivalStart) {
      setNewArrivalStartIndex(maxNewArrivalStart);
    }
  }, [maxNewArrivalStart, newArrivalStartIndex]);

  return (
    <>
      <section className="relative min-h-screen overflow-hidden bg-[#0a0a0a] flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0f0f0f] to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(200,255,47,0.08),transparent_60%)]" />

        <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-4xl space-y-8">
            <div className="inline-flex rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#d9d9d9]">
              Campus Lifestyle Marketplace
            </div>

            <h1 className="text-7xl sm:text-7xl lg:text-[8rem] font-extrabold leading-[1.02] text-white">
              Campus
              <span className="text-[var(--ck-accent)]">Kart</span>
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-[#d9d9d9] max-w-2xl mx-auto">
              Everything students need, from textbooks and gadgets to fashion
              and dorm essentials, delivered with deals that actually matter.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link
                to="/shop"
                className="rounded-xl bg-[var(--ck-accent)] px-8 py-4 text-base font-bold text-[#111111] transition hover:bg-[var(--ck-accent-hover)] hover:scale-105 duration-300"
              >
                Shop Now
              </Link>
              <Link
                to="/shop?sort=popular"
                className="rounded-xl border-2 border-white/30 bg-transparent px-8 py-4 text-base font-semibold text-white transition hover:bg-white/10 hover:border-white/60 duration-300"
              >
                Explore Categories
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Section */}
      <section className="mt-10 space-y-0 overflow-hidden rounded-[20px] border border-white/10 bg-[var(--ck-surface-deep)] shadow-[0_20px_45px_rgba(0,0,0,0.25)]">
        {/* Banners Section */}
        <section className="relative min-h-[260px] overflow-hidden bg-[var(--ck-surface-deep)] sm:min-h-[320px] lg:min-h-[380px]">
          {heroImage ? (
            <img
              src={heroImage}
              alt="CampusKart banner"
              className="absolute inset-0 h-full w-full object-cover opacity-30"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(200,255,47,0.10),transparent_55%)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/35" />

          <div className="relative z-10 grid grid-cols-1 items-center gap-6 px-5 py-10 sm:px-8 lg:grid-cols-2 lg:px-10">
            <div className="hidden justify-self-end lg:block">
              <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: 15 }).map((_, index) => (
                  <span
                    key={`hero-dot-${index}`}
                    className="h-1.5 w-1.5 rounded-full bg-[var(--ck-accent)]/85"
                  />
                ))}
              </div>
            </div>
          </div>

          {banners.length > 1 ? (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              {banners.map((banner, index) => (
                <button
                  key={banner.id || `banner-${index}`}
                  type="button"
                  onClick={() => setActiveBannerIndex(index)}
                  className={`h-2.5 rounded-full transition ${
                    index === activeBannerIndex
                      ? "w-7 bg-[var(--ck-accent)]"
                      : "w-2.5 bg-white/55 hover:bg-white/80"
                  }`}
                  aria-label={`Show banner ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="bg-[var(--ck-bg)] px-5 py-10 sm:px-8 lg:px-10">
          <SectionHeader
            title="Shop by Category"
            subtitle="Find campus essentials faster."
            ctaTo="/shop"
            ctaLabel="View All"
          />

          {categoriesQuery.isLoading ? <CategorySkeleton /> : null}

          {!categoriesQuery.isLoading && featuredCategories.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {featuredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => navigate(`/shop?category=${category.id}`)}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--ck-surface)] text-left"
                >
                  <img
                    src={
                      cloudinaryImage(category.icon_url, 640, 480) ||
                      "https://placehold.co/640x480/2A2A2A/D9D9D9?text=CampusKart"
                    }
                    alt={category.name}
                    loading="lazy"
                    decoding="async"
                    className="h-36 w-full object-cover opacity-85 transition duration-300 group-hover:scale-105 group-hover:opacity-95 sm:h-44"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="line-clamp-2 text-base font-semibold text-white">
                      {category.name}
                    </p>
                    <p className="text-xs text-[#d9d9d9]">Explore now</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!categoriesQuery.isLoading && featuredCategories.length === 0 ? (
            <p className="text-sm text-[#313131]">
              No categories are available right now.
            </p>
          ) : null}
        </section>

        <section className="bg-[var(--ck-surface)] px-5 py-10 sm:px-8 lg:px-10">
          <SectionHeader
            title="New Arrivals"
            subtitle="Fresh picks just for you."
            ctaTo="/shop?sort=newest"
            ctaLabel="View All"
            dark
          />

          {newArrivalsQuery.isLoading ? <ProductGridSkeleton /> : null}

          {!newArrivalsQuery.isLoading && newArrivals.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-hidden">
                <div
                  className="-mx-2 flex transition-transform duration-500 ease-out"
                  style={{
                    transform: `translateX(-${newArrivalStartIndex * (100 / cardsPerView)}%)`,
                  }}
                >
                  {newArrivals.map((product) => (
                    <div
                      key={product.id}
                      className="shrink-0 px-2"
                      style={{ width: `${100 / cardsPerView}%` }}
                    >
                      <ProductCard product={product} />
                    </div>
                  ))}
                </div>
              </div>

              {newArrivals.length > cardsPerView ? (
                <div className="flex justify-center gap-2">
                  {Array.from({ length: maxNewArrivalStart + 1 }).map(
                    (_, index) => (
                      <button
                        key={`new-arrival-dot-${index}`}
                        type="button"
                        onClick={() => setNewArrivalStartIndex(index)}
                        className={`h-2.5 rounded-full transition ${
                          index === newArrivalStartIndex
                            ? "w-7 bg-[var(--ck-accent)]"
                            : "w-2.5 bg-white/45 hover:bg-white/75"
                        }`}
                        aria-label={`Go to new arrivals slide ${index + 1}`}
                      />
                    ),
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {!newArrivalsQuery.isLoading && newArrivals.length === 0 ? (
            <p className="text-sm text-[#d9d9d9]">
              No new arrivals available right now.
            </p>
          ) : null}
        </section>

        <section className="bg-[var(--ck-bg)] px-5 py-10 sm:px-8 lg:px-10">
          <SectionHeader
            title="Best Sellers"
            subtitle="Student favorites across campus."
            ctaTo="/shop?sort=popular"
            ctaLabel="View All"
            ctaClassName="text-[#b7f51e] hover:text-[#b7f51e]"
          />

          {topProductsQuery.isLoading ? <ProductGridSkeleton /> : null}

          {!topProductsQuery.isLoading && topProducts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {topProducts.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : null}

          {!topProductsQuery.isLoading && topProducts.length === 0 ? (
            <p className="text-sm text-[#313131]">
              Best sellers are unavailable right now.
            </p>
          ) : null}
        </section>

        <section className="bg-[var(--ck-accent)] px-5 py-10 sm:px-8 lg:px-10">
          <SectionHeader
            title="⚡Flash Deals"
            subtitle="Limited-time offers with student-friendly prices."
            ctaTo="/shop?discounted=true"
            ctaLabel="View All"
            ctaClassName="rounded-xl bg-[#101010] px-5 py-2 text-[#b7f51e] hover:bg-black hover:text-[#b7f51e]"
            showArrow
          />

          {topProductsQuery.isLoading || newArrivalsQuery.isLoading ? (
            <ProductGridSkeleton />
          ) : null}

          {!topProductsQuery.isLoading &&
          !newArrivalsQuery.isLoading &&
          flashDeals.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {flashDeals.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : null}

          {!topProductsQuery.isLoading &&
          !newArrivalsQuery.isLoading &&
          flashDeals.length === 0 ? (
            <p className="text-sm text-[#1f1f1f]">
              No flash deals are live yet.
            </p>
          ) : null}
        </section>

        <section className="bg-[var(--ck-surface-deep)] px-5 py-10 sm:px-8 lg:px-10">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                title: "Free Shipping",
                description: "On orders over BDT 3,500",
              },
              {
                title: "Easy Returns",
                description: "30-day return policy",
              },
              {
                title: "Secure Payment",
                description: "100% secure transactions",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-black/30 p-5"
              >
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ck-accent)]/20 text-[var(--ck-accent)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--ck-accent)]" />
                </div>
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-[#d9d9d9]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[var(--ck-bg)] px-5 py-10 sm:px-8 lg:px-10">
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-[#181818]">
            What Students Say
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                quote:
                  "CampusKart made shopping for dorm gear so easy. Fast shipping and great prices.",
                author: "Sarah M.",
              },
              {
                quote:
                  "I found quality textbooks here for half the campus bookstore price. Highly recommended.",
                author: "James L.",
              },
              {
                quote:
                  "I love the variety and student-friendly deals. My go-to for everything campus.",
                author: "Emily R.",
              },
            ].map((testimonial) => (
              <article
                key={testimonial.author}
                className="rounded-2xl border border-white/15 bg-[var(--ck-surface)] p-5"
              >
                <p className="text-sm text-[#d9d9d9]">{testimonial.quote}</p>
                <p className="mt-3 text-sm font-semibold text-white">
                  {testimonial.author}
                </p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}

export default HomePage;
