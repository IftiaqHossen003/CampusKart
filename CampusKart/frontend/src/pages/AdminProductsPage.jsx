import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  approveAdminProduct,
  exportAdminProductsCsv,
  fetchAdminProducts,
  getAdminApiErrorMessage,
  rejectAdminProduct,
} from "../api/admin";
import Pagination from "../components/ui/Pagination";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "../hooks/useToast";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatPrice(value) {
  const number = Number(value);
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isNaN(number) ? 0 : number);
}

function statusChipClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") {
    return "bg-success/15 text-success";
  }
  if (normalized === "rejected") {
    return "bg-error/15 text-error";
  }
  return "bg-warning/15 text-warning";
}

function resolveProductImage(product) {
  const primary = (product.images || []).find(
    (image) => image.is_primary,
  )?.image_url;
  return (
    primary ||
    product.images?.[0]?.image_url ||
    "https://placehold.co/400x300/e2e8f0/334155?text=CampusKart"
  );
}

function AdminProductsPage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const status = searchParams.get("status") || "all";
  const initialSearch = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const rejectReasonRef = useRef(null);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  useEffect(() => {
    setSearchInput(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const normalizedSearch = debouncedSearch.trim();
    const currentSearch = searchParams.get("search") || "";

    if (normalizedSearch === currentSearch) {
      return;
    }

    if (normalizedSearch) {
      next.set("search", normalizedSearch);
    } else {
      next.delete("search");
    }

    next.set("page", "1");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next);
    }
  }, [debouncedSearch, searchParams, setSearchParams]);

  const productsQuery = useQuery({
    queryKey: ["admin-products", page, status, debouncedSearch],
    queryFn: () =>
      fetchAdminProducts({
        page,
        status: status === "all" ? "" : status,
        search: debouncedSearch.trim(),
        ordering: "-created_at",
      }),
    staleTime: 60 * 1000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ slug }) =>
      approveAdminProduct(slug, { reason: "Approved by admin" }),
    onSuccess: () => {
      showSuccess("Product approved.");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard", "stats"] });
      setSelectedProduct(null);
      setRejectReason("");
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not approve product."));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ slug, reason }) => rejectAdminProduct(slug, { reason }),
    onSuccess: () => {
      showSuccess("Product rejected.");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard", "stats"] });
      setSelectedProduct(null);
      setRejectReason("");
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not reject product."));
    },
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      exportAdminProductsCsv({
        status: status === "all" ? "" : status,
        search: debouncedSearch.trim(),
        ordering: "-created_at",
      }),
    onSuccess: () => {
      showSuccess("CSV export downloaded.");
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not export products."));
    },
  });

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }

    const onKeyDown = (event) => {
      if (
        event.key === "Escape" &&
        !approveMutation.isPending &&
        !rejectMutation.isPending
      ) {
        setSelectedProduct(null);
        setRejectReason("");
      }
    };

    const focusTimer = window.setTimeout(() => {
      rejectReasonRef.current?.focus();
    }, 0);

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedProduct, approveMutation.isPending, rejectMutation.isPending]);

  const products = productsQuery.data?.results || [];
  const totalPages = productsQuery.data?.totalPages || 1;
  const totalCount = productsQuery.data?.count || 0;

  const handlePageChange = (nextPage) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  };

  const handleStatusChange = (nextStatus) => {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === "all") {
      next.delete("status");
    } else {
      next.set("status", nextStatus);
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  const handleExportCsv = () => {
    exportMutation.mutate();
  };

  const closeModal = () => {
    if (approveMutation.isPending || rejectMutation.isPending) {
      return;
    }
    setSelectedProduct(null);
    setRejectReason("");
  };

  const handleApprove = () => {
    if (!selectedProduct?.slug) {
      return;
    }

    approveMutation.mutate({ slug: selectedProduct.slug });
  };

  const handleReject = () => {
    if (!selectedProduct?.slug) {
      return;
    }

    const reason = rejectReason.trim();
    if (!reason) {
      showError("Please provide a rejection reason.");
      return;
    }

    rejectMutation.mutate({ slug: selectedProduct.slug, reason });
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-white">
          Product Approval Queue
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Moderate pending products and maintain catalog quality.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search product, vendor, or category"
            className="w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
          />

          <select
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="rounded-md border border-white/20 bg-[var(--ck-surface)] px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportMutation.isPending}
            className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-slate-400 hover:bg-white/5"
          >
            {exportMutation.isPending ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-400">
          {totalCount} product{totalCount === 1 ? "" : "s"} found.
        </p>
      </div>

      {productsQuery.isLoading ? (
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`admin-products-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-white/5"
              />
            ))}
          </div>
        </div>
      ) : productsQuery.isError ? (
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-8 text-center">
          <h2 className="text-xl font-semibold text-white">
            Could not load products
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {getAdminApiErrorMessage(
              productsQuery.error,
              "Please try again in a moment.",
            )}
          </p>
          <button
            type="button"
            onClick={() => productsQuery.refetch()}
            className="mt-5 rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)]"
          >
            Retry
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[var(--ck-surface)] p-8 text-center">
          <h2 className="text-lg font-semibold text-white">
            No products in this view
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Adjust filters or search to find products.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-[var(--ck-surface)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-[var(--ck-surface-deep)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Vendor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[var(--ck-surface)]">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="cursor-pointer hover:bg-[var(--ck-surface-deep)]"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <td className="px-4 py-3 text-sm text-white">
                      <div className="flex items-center gap-3">
                        <img
                          src={resolveProductImage(product)}
                          alt={product.name}
                          className="h-11 w-11 rounded-md border border-white/10 object-cover"
                          loading="lazy"
                        />
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {product.vendor_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {product.category_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatPrice(product.discount_price || product.price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDate(product.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass(product.status)}`}
                      >
                        {product.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-white/10 md:hidden">
            {products.map((product) => (
              <article
                key={product.id}
                className="cursor-pointer space-y-2 p-4"
                onClick={() => setSelectedProduct(product)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={resolveProductImage(product)}
                      alt={product.name}
                      className="h-12 w-12 rounded-md border border-white/10 object-cover"
                      loading="lazy"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {product.vendor_name || "-"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass(product.status)}`}
                  >
                    {product.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Category: {product.category_name || "-"}
                </p>
                <p className="text-xs text-slate-400">
                  Submitted: {formatDate(product.created_at)}
                </p>
              </article>
            ))}
          </div>

          <div className="p-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      )}

      {selectedProduct ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-4"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="mx-auto mt-8 w-full max-w-xl rounded-xl bg-[var(--ck-surface)] p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Product moderation details"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">
                {selectedProduct.name}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-white/20 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
              <img
                src={resolveProductImage(selectedProduct)}
                alt={selectedProduct.name}
                className="h-28 w-28 rounded-lg border border-white/10 object-cover"
              />

              <div className="space-y-2 text-sm text-slate-400">
                <p>
                  <span className="font-semibold text-white">Vendor:</span>{" "}
                  {selectedProduct.vendor_name || "-"}
                </p>
                <p>
                  <span className="font-semibold text-white">
                    Category:
                  </span>{" "}
                  {selectedProduct.category_name || "-"}
                </p>
                <p>
                  <span className="font-semibold text-white">Price:</span>{" "}
                  {formatPrice(
                    selectedProduct.discount_price || selectedProduct.price,
                  )}
                </p>
                <p>
                  <span className="font-semibold text-white">Status:</span>{" "}
                  {selectedProduct.status}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              {selectedProduct.description ||
                "No product description provided."}
            </p>

            <label
              className="mt-4 block text-sm font-semibold text-white"
              htmlFor="product-reject-reason"
            >
              Rejection Reason
            </label>
            <textarea
              id="product-reject-reason"
              ref={rejectReasonRef}
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Required when rejecting this product"
              className="mt-2 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="rounded-md border border-error px-4 py-2 text-sm font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AdminProductsPage;




