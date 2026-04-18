import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  fetchCategories,
  fetchProducts,
  fetchProductTags,
} from "../api/products";
import EmptyState from "../components/ui/EmptyState";
import Pagination from "../components/ui/Pagination";
import ProductCard from "../components/ui/ProductCard";
import ProductGridSkeleton from "../components/ui/ProductGridSkeleton";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const PRICE_MIN = 0;
const PRICE_MAX = 5000;

const SORT_OPTIONS = [
  { label: "Newest", value: "newest", ordering: "-created_at" },
  { label: "Price: Low to High", value: "price", ordering: "price" },
  { label: "Rating: High to Low", value: "rating", ordering: "-avg_rating" },
  { label: "Popular", value: "popular", ordering: "-total_sold" },
];

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return min;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseCurrentSort(value) {
  const found = SORT_OPTIONS.find((option) => option.value === value);
  return found?.value || "newest";
}

function sortToOrdering(sort) {
  return (
    SORT_OPTIONS.find((option) => option.value === sort)?.ordering ||
    "-created_at"
  );
}

function ProductListingPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get("category") || "";
  const selectedTags = searchParams.getAll("tag").filter(Boolean);
  const minPrice = searchParams.get("min_price") || "";
  const maxPrice = searchParams.get("max_price") || "";
  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));
  const currentSort = parseCurrentSort(searchParams.get("sort") || "newest");
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(searchTerm);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  useEffect(() => {
    if (!searchParams.get("page")) {
      const next = new URLSearchParams(searchParams);
      next.set("page", "1");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const normalized = debouncedSearch.trim();
    if (normalized === searchTerm) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (normalized) {
      next.set("search", normalized);
    } else {
      next.delete("search");
    }
    next.set("page", "1");
    setSearchParams(next);
  }, [debouncedSearch, searchParams, searchTerm, setSearchParams]);

  const productFilters = useMemo(
    () => ({
      category,
      tags: selectedTags,
      min_price: minPrice,
      max_price: maxPrice,
      page: currentPage,
      ordering: sortToOrdering(currentSort),
      search: searchTerm,
    }),
    [
      category,
      selectedTags,
      minPrice,
      maxPrice,
      currentPage,
      currentSort,
      searchTerm,
    ],
  );

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  const productsQuery = useQuery({
    queryKey: ["products", productFilters],
    queryFn: () => fetchProducts(productFilters),
    staleTime: 5 * 60 * 1000,
  });

  const tagsQuery = useQuery({
    queryKey: ["product-tags"],
    queryFn: fetchProductTags,
    staleTime: 5 * 60 * 1000,
  });

  const categoriesData = categoriesQuery.data;
  const categories = Array.isArray(categoriesData)
    ? categoriesData
    : Array.isArray(categoriesData?.results)
      ? categoriesData.results
      : [];
  const products = productsQuery.data?.results || [];
  const totalCount = productsQuery.data?.count || 0;
  const pageSize = products.length > 0 ? products.length : 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const tagOptions = useMemo(() => {
    const tagsData = tagsQuery.data;
    if (Array.isArray(tagsData)) {
      return tagsData;
    }
    if (Array.isArray(tagsData?.results)) {
      return tagsData.results;
    }
    return [];
  }, [tagsQuery.data]);

  const updateParams = (updater) => {
    const next = new URLSearchParams(searchParams);
    updater(next);
    setSearchParams(next);
  };

  const handleCategorySelect = (categoryId) => {
    updateParams((next) => {
      if (categoryId) {
        next.set("category", String(categoryId));
      } else {
        next.delete("category");
      }
      next.set("page", "1");
    });
  };

  const handleTagToggle = (tag) => {
    updateParams((next) => {
      const current = next.getAll("tag");
      const exists = current.includes(tag);
      next.delete("tag");

      const nextTags = exists
        ? current.filter((item) => item !== tag)
        : [...current, tag];
      nextTags.forEach((item) => next.append("tag", item));
      next.set("page", "1");
    });
  };

  const handlePriceApply = (nextMin, nextMax) => {
    updateParams((next) => {
      if (nextMin === "") {
        next.delete("min_price");
      } else {
        next.set("min_price", String(nextMin));
      }

      if (nextMax === "") {
        next.delete("max_price");
      } else {
        next.set("max_price", String(nextMax));
      }

      next.set("page", "1");
    });
  };

  const handleSortChange = (value) => {
    updateParams((next) => {
      next.set("sort", value);
      next.set("page", "1");
    });
  };

  const handlePageChange = (page) => {
    updateParams((next) => {
      next.set("page", String(page));
    });
  };

  const handleResetFilters = () => {
    const next = new URLSearchParams();
    next.set("page", "1");
    setSearchInput("");
    setSearchParams(next);
  };

  const minSliderValue = clampNumber(
    minPrice || PRICE_MIN,
    PRICE_MIN,
    PRICE_MAX,
  );
  const maxSliderValue = clampNumber(
    maxPrice || PRICE_MAX,
    PRICE_MIN,
    PRICE_MAX,
  );
  const safeMinValue = Math.min(minSliderValue, maxSliderValue);
  const safeMaxValue = Math.max(minSliderValue, maxSliderValue);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">
          Shop Campus Essentials
        </h1>
        <p className="mt-1 text-sm text-muted">
          Discover verified products from trusted campus vendors.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-primary">Filters</h2>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-medium text-accent hover:underline"
            >
              Reset
            </button>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">
              Category
            </p>
            <div className="space-y-1 text-sm">
              <button
                type="button"
                onClick={() => handleCategorySelect("")}
                className={`block w-full rounded px-2 py-1 text-left ${
                  !category
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-slate-100"
                }`}
              >
                All Categories
              </button>

              {categories.map((rootCategory) => (
                <div key={rootCategory.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => handleCategorySelect(rootCategory.id)}
                    className={`block w-full rounded px-2 py-1 text-left font-medium ${
                      String(category) === String(rootCategory.id)
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    {rootCategory.name}
                  </button>

                  {rootCategory.children?.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => handleCategorySelect(child.id)}
                      className={`ml-3 block w-[calc(100%-12px)] rounded px-2 py-1 text-left text-xs ${
                        String(category) === String(child.id)
                          ? "bg-accent/10 text-accent"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">
              Price Range
            </p>
            <div className="space-y-3">
              <div>
                <label
                  className="mb-1 block text-xs text-muted"
                  htmlFor="min-price-range"
                >
                  Minimum: BDT {safeMinValue}
                </label>
                <input
                  id="min-price-range"
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  value={safeMinValue}
                  onChange={(event) => {
                    const nextMin = clampNumber(
                      event.target.value,
                      PRICE_MIN,
                      safeMaxValue,
                    );
                    handlePriceApply(nextMin, safeMaxValue);
                  }}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs text-muted"
                  htmlFor="max-price-range"
                >
                  Maximum: BDT {safeMaxValue}
                </label>
                <input
                  id="max-price-range"
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  value={safeMaxValue}
                  onChange={(event) => {
                    const nextMax = clampNumber(
                      event.target.value,
                      safeMinValue,
                      PRICE_MAX,
                    );
                    handlePriceApply(safeMinValue, nextMax);
                  }}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">Tags</p>
            <div className="space-y-2">
              {tagsQuery.isLoading ? (
                <p className="text-xs text-muted">Loading tags...</p>
              ) : null}
              {!tagsQuery.isLoading && tagOptions.length > 0
                ? tagOptions.map((tagOption) => (
                    <label
                      key={tagOption.tag}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tagOption.tag)}
                        onChange={() => handleTagToggle(tagOption.tag)}
                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                      />
                      <span>{tagOption.tag}</span>
                      <span className="text-xs text-muted">
                        ({tagOption.count})
                      </span>
                    </label>
                  ))
                : null}
              {!tagsQuery.isLoading && tagOptions.length === 0 ? (
                <p className="text-xs text-muted">
                  No global tags available yet.
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search products by name, description, or tags"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />

              <p className="text-sm text-muted">
                {productsQuery.isLoading
                  ? "Loading results..."
                  : `${totalCount} result${totalCount === 1 ? "" : "s"}`}
              </p>

              <label
                className="flex items-center gap-2 text-sm text-slate-700"
                htmlFor="sort-by"
              >
                <span>Sort</span>
                <select
                  id="sort-by"
                  value={currentSort}
                  onChange={(event) => handleSortChange(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {productsQuery.isLoading ? <ProductGridSkeleton /> : null}

          {!productsQuery.isLoading && products.length === 0 ? (
            <EmptyState
              title="No Products Found"
              message="Try broadening your filters or reset to explore all products available in CampusKart."
              actionLabel="Clear Filters"
              onAction={handleResetFilters}
            />
          ) : null}

          {!productsQuery.isLoading && products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default ProductListingPage;
