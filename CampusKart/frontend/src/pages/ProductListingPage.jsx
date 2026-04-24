import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
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
const PRODUCTS_PAGE_SIZE = 20;
const RECENT_SEARCHES_KEY = "campuskart_recent_shop_searches_v1";
const MAX_RECENT_SEARCHES = 6;

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

function readRecentSearches() {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function writeRecentSearches(values) {
  try {
    if (!values.length) {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY);
      return;
    }

    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(values));
  } catch {
    // Ignore localStorage write errors.
  }
}

function ProductListingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchDropdownRef = useRef(null);

  const category = searchParams.get("category") || "";
  const vendor = searchParams.get("vendor") || "";
  const selectedTags = searchParams.getAll("tag").filter(Boolean);
  const minPrice = searchParams.get("min_price") || "";
  const maxPrice = searchParams.get("max_price") || "";
  const pageParam = Number(searchParams.get("page"));
  const currentPage =
    Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const currentSort = parseCurrentSort(searchParams.get("sort") || "newest");
  const searchTerm = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(() => searchTerm);
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const debouncedSearchInput = useDebouncedValue(searchInput, 300);
  const normalizedSuggestionTerm = debouncedSearchInput.trim().toLowerCase();

  const pushRecentSearch = useCallback((term) => {
    const normalized = String(term || "").trim();
    if (!normalized) {
      return;
    }

    setRecentSearches((current) => {
      const nextValues = [
        normalized,
        ...current.filter(
          (item) => item.toLowerCase() !== normalized.toLowerCase(),
        ),
      ].slice(0, MAX_RECENT_SEARCHES);
      writeRecentSearches(nextValues);
      return nextValues;
    });
  }, []);

  const updateParams = useCallback(
    (updater, { resetPage = true } = {}) => {
      const next = new URLSearchParams(searchParams);
      updater(next);
      if (resetPage) {
        next.set("page", "1");
      } else if (!next.get("page")) {
        next.set("page", "1");
      }

      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next);
      }
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const normalized = debouncedSearchInput.trim();
    if (normalized === searchTerm) {
      return;
    }

    updateParams((next) => {
      if (normalized) {
        next.set("search", normalized);
      } else {
        next.delete("search");
      }
    });
  }, [debouncedSearchInput, searchTerm, updateParams]);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  const productFilters = useMemo(
    () => ({
      category,
      tags: selectedTags,
      min_price: minPrice,
      max_price: maxPrice,
      page: currentPage,
      page_size: PRODUCTS_PAGE_SIZE,
      vendor,
      ordering: sortToOrdering(currentSort),
      search: searchTerm,
    }),
    [
      category,
      selectedTags,
      minPrice,
      maxPrice,
      currentPage,
      vendor,
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

  const suggestionsProductsQuery = useQuery({
    queryKey: ["shop-search-suggestions", normalizedSuggestionTerm],
    queryFn: () =>
      fetchProducts({
        search: normalizedSuggestionTerm,
        ordering: "-total_sold",
        page: 1,
        page_size: 5,
      }),
    enabled: normalizedSuggestionTerm.length >= 2,
    staleTime: 60 * 1000,
  });

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

  const products = productsQuery.data?.results || [];
  const totalCount = Number(productsQuery.data?.count || 0);
  const apiPageSize = Number(
    productsQuery.data?.page_size || productsQuery.data?.pageSize,
  );
  const resolvedPageSize =
    Number.isFinite(apiPageSize) && apiPageSize > 0
      ? Math.floor(apiPageSize)
      : PRODUCTS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalCount / resolvedPageSize));

  const productSuggestions = useMemo(() => {
    if (!normalizedSuggestionTerm) {
      return [];
    }

    const raw = suggestionsProductsQuery.data?.results || [];
    return raw.slice(0, 5).map((product) => ({
      type: "product",
      label: product.name,
      description: product.vendor_name || "Campus Vendor",
      slug: product.slug,
      searchTerm: product.name,
    }));
  }, [normalizedSuggestionTerm, suggestionsProductsQuery.data]);

  const categorySuggestions = useMemo(() => {
    if (!normalizedSuggestionTerm) {
      return [];
    }

    const flattened = [];
    categories.forEach((rootCategory) => {
      flattened.push(rootCategory);
      if (Array.isArray(rootCategory.children)) {
        flattened.push(...rootCategory.children);
      }
    });

    return flattened
      .filter((item) =>
        String(item?.name || "").toLowerCase().includes(normalizedSuggestionTerm),
      )
      .slice(0, 5)
      .map((item) => ({
        type: "category",
        label: item.name,
        description: "Filter by category",
        categoryId: item.id,
      }));
  }, [categories, normalizedSuggestionTerm]);

  const recentSuggestions = useMemo(() => {
    if (!recentSearches.length) {
      return [];
    }

    if (!normalizedSuggestionTerm) {
      return recentSearches.slice(0, 4).map((term) => ({
        type: "recent",
        label: term,
        description: "Recent search",
      }));
    }

    return recentSearches
      .filter((term) => term.toLowerCase().includes(normalizedSuggestionTerm))
      .slice(0, 4)
      .map((term) => ({
        type: "recent",
        label: term,
        description: "Recent search",
      }));
  }, [recentSearches, normalizedSuggestionTerm]);

  const suggestionGroups = useMemo(() => {
    let nextIndex = 0;
    const groups = [];

    if (productSuggestions.length > 0) {
      groups.push({
        title: "Products",
        items: productSuggestions.map((item) => ({
          ...item,
          index: nextIndex++,
        })),
      });
    }

    if (categorySuggestions.length > 0) {
      groups.push({
        title: "Categories",
        items: categorySuggestions.map((item) => ({
          ...item,
          index: nextIndex++,
        })),
      });
    }

    if (recentSuggestions.length > 0) {
      groups.push({
        title: "Recent Searches",
        items: recentSuggestions.map((item) => ({
          ...item,
          index: nextIndex++,
        })),
      });
    }

    return groups;
  }, [productSuggestions, categorySuggestions, recentSuggestions]);

  const flatSuggestions = useMemo(
    () => suggestionGroups.flatMap((group) => group.items),
    [suggestionGroups],
  );

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!searchDropdownRef.current?.contains(event.target)) {
        setIsSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleCategorySelect = (categoryId) => {
    updateParams((next) => {
      if (categoryId) {
        next.set("category", String(categoryId));
      } else {
        next.delete("category");
      }
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
    });
  };

  const handleSortChange = (value) => {
    updateParams((next) => {
      next.set("sort", value);
    });
  };

  const handleResetFilters = () => {
    const next = new URLSearchParams();
    next.set("page", "1");
    setSearchInput("");
    setSearchParams(next);
  };

  const handlePageChange = (page) => {
    const normalizedPage = Math.max(
      1,
      Math.min(totalPages, Math.floor(Number(page) || 1)),
    );

    if (normalizedPage === currentPage) {
      return;
    }

    updateParams(
      (next) => {
        next.set("page", String(normalizedPage));
      },
      { resetPage: false },
    );
  };

  useEffect(() => {
    if (productsQuery.isLoading || productsQuery.isError) {
      return;
    }

    if (currentPage <= totalPages) {
      return;
    }

    updateParams(
      (next) => {
        next.set("page", String(totalPages));
      },
      { resetPage: false },
    );
  }, [
    currentPage,
    productsQuery.isError,
    productsQuery.isLoading,
    totalPages,
    updateParams,
  ]);

  const applySearchValue = useCallback(
    (value, { saveToRecent = true } = {}) => {
      const normalized = String(value || "").trim();
      setSearchInput(value);

      updateParams((next) => {
        if (normalized) {
          next.set("search", normalized);
        } else {
          next.delete("search");
        }
      });

      if (normalized && saveToRecent) {
        pushRecentSearch(normalized);
      }
    },
    [updateParams, pushRecentSearch],
  );

  const handleSuggestionSelect = useCallback(
    (suggestion) => {
      if (!suggestion) {
        return;
      }

      if (suggestion.type === "product" && suggestion.slug) {
        if (suggestion.searchTerm) {
          pushRecentSearch(suggestion.searchTerm);
        }
        navigate(`/shop/products/${suggestion.slug}`);
        setIsSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
        return;
      }

      if (suggestion.type === "category" && suggestion.categoryId) {
        updateParams((next) => {
          next.set("category", String(suggestion.categoryId));
          next.delete("search");
        });
        setSearchInput("");
      } else {
        applySearchValue(suggestion.label, {
          saveToRecent: suggestion.type !== "recent",
        });
      }

      setIsSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    },
    [navigate, pushRecentSearch, updateParams, applySearchValue],
  );

  const boundedActiveSuggestionIndex =
    activeSuggestionIndex >= 0 && activeSuggestionIndex < flatSuggestions.length
      ? activeSuggestionIndex
      : -1;

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      setIsSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      if (isSuggestionsOpen && boundedActiveSuggestionIndex >= 0) {
        event.preventDefault();
        handleSuggestionSelect(flatSuggestions[boundedActiveSuggestionIndex]);
        return;
      }

      event.preventDefault();
      applySearchValue(searchInput);
      setIsSuggestionsOpen(false);
      return;
    }

    if (!flatSuggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveSuggestionIndex((current) => {
        if (current < 0 || current >= flatSuggestions.length) {
          return 0;
        }
        return (current + 1) % flatSuggestions.length;
      });
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveSuggestionIndex((current) => {
        if (current < 0 || current >= flatSuggestions.length) {
          return flatSuggestions.length - 1;
        }
        return (current - 1 + flatSuggestions.length) % flatSuggestions.length;
      });
    }
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

  const isInitialLoading = productsQuery.isLoading;
  const showEmptyState =
    !isInitialLoading && !productsQuery.isError && products.length === 0;

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">
          Shop Campus Essentials
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Discover verified products from trusted campus vendors.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border border-white/10 bg-[var(--ck-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Filters</h2>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-medium text-[var(--ck-accent)] hover:underline"
            >
              Reset
            </button>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-sm font-semibold text-white">
              Category
            </p>
            <div className="space-y-1 text-sm">
              <button
                type="button"
                onClick={() => handleCategorySelect("")}
                className={`block w-full rounded px-2 py-1 text-left ${
                  !category
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5"
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
                        ? "bg-white/10 text-white"
                        : "text-slate-300 hover:bg-white/5"
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
                          ? "bg-[var(--ck-accent)]/10 text-[var(--ck-accent)]"
                          : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-sm font-semibold text-white">
              Price Range
            </p>
            <div className="space-y-3">
              <div>
                <label
                  className="mb-1 block text-xs text-slate-400"
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
                  className="w-full accent-[var(--ck-accent)]"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs text-slate-400"
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
                  className="w-full accent-[var(--ck-accent)]"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-sm font-semibold text-white">Tags</p>
            <div className="space-y-2">
              {tagsQuery.isLoading ? (
                <p className="text-xs text-slate-400">Loading tags...</p>
              ) : null}
              {!tagsQuery.isLoading && tagOptions.length > 0
                ? tagOptions.map((tagOption) => (
                    <label
                      key={tagOption.tag}
                      className="flex items-center gap-2 text-sm text-slate-400"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tagOption.tag)}
                        onChange={() => handleTagToggle(tagOption.tag)}
                        className="h-4 w-4 rounded border-white/20 text-[var(--ck-accent)] focus:ring-1 focus:ring-[var(--ck-accent)]"
                      />
                      <span>{tagOption.tag}</span>
                      <span className="text-xs text-slate-400">
                        ({tagOption.count})
                      </span>
                    </label>
                  ))
                : null}
              {!tagsQuery.isLoading && tagOptions.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No global tags available yet.
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="relative" ref={searchDropdownRef}>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                    if (!isSuggestionsOpen && flatSuggestions.length > 0) {
                      setIsSuggestionsOpen(true);
                      setActiveSuggestionIndex(0);
                    }
                  }}
                  onFocus={() => {
                    if (flatSuggestions.length > 0) {
                      setIsSuggestionsOpen(true);
                      setActiveSuggestionIndex((current) =>
                        current >= 0 && current < flatSuggestions.length
                          ? current
                          : 0,
                      );
                    }
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search products by name, description, or tags"
                  role="combobox"
                  aria-expanded={isSuggestionsOpen && flatSuggestions.length > 0}
                  aria-controls="shop-search-suggestions"
                  aria-activedescendant={
                    boundedActiveSuggestionIndex >= 0
                      ? `shop-search-suggestion-${boundedActiveSuggestionIndex}`
                      : undefined
                  }
                  className="w-full rounded-md border border-white/20 bg-white px-3 py-2 text-sm text-black placeholder:text-slate-500 focus:border-[var(--ck-accent)] focus:outline-none"
                />

                {isSuggestionsOpen && flatSuggestions.length > 0 ? (
                  <div
                    id="shop-search-suggestions"
                    role="listbox"
                    className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-md border border-white/10 bg-[var(--ck-surface)] py-1 shadow-lg"
                  >
                    {suggestionGroups.map((group) => (
                      <div key={group.title} className="py-1">
                        <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          {group.title}
                        </p>

                        {group.items.map((item) => {
                          const isActive = item.index === activeSuggestionIndex;
                          return (
                            <button
                              key={`${item.type}-${item.index}-${item.label}`}
                              id={`shop-search-suggestion-${item.index}`}
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onMouseEnter={() =>
                                setActiveSuggestionIndex(item.index)
                              }
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleSuggestionSelect(item)}
                              className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm ${
                                isActive
                                  ? "bg-white/10 text-white"
                                  : "hover:bg-[var(--ck-surface-deep)]"
                              }`}
                            >
                              <span className="line-clamp-1 font-medium">
                                {item.label}
                              </span>
                              <span className="shrink-0 text-xs text-slate-400">
                                {item.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <p className="text-sm text-slate-400">
                {isInitialLoading
                  ? "Loading results..."
                  : `${totalCount} result${totalCount === 1 ? "" : "s"}`}
              </p>

              <label
                className="flex items-center gap-2 text-sm text-slate-400"
                htmlFor="sort-by"
              >
                <span>Sort</span>
                <select
                  id="sort-by"
                  value={currentSort}
                  onChange={(event) => handleSortChange(event.target.value)}
                  className="rounded-md border border-white/20 bg-[var(--ck-surface)] px-2 py-1.5 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
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

          {isInitialLoading ? <ProductGridSkeleton /> : null}

          {productsQuery.isError && !isInitialLoading ? (
            <div className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              Could not load products. Please refresh or try again shortly.
            </div>
          ) : null}

          {showEmptyState ? (
            <EmptyState
              title="No Products Found"
              message="Try broadening your filters or reset to explore all products available in CampusKart."
              actionLabel="Clear Filters"
              onAction={handleResetFilters}
            />
          ) : null}

          {!isInitialLoading && products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              <Pagination
                currentPage={Math.min(currentPage, totalPages)}
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


