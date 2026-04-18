import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  approveAdminVendor,
  exportAdminVendorsCsv,
  fetchAdminVendors,
  getAdminApiErrorMessage,
  suspendAdminVendor,
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

function statusChipClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") {
    return "bg-success/15 text-success";
  }
  if (normalized === "suspended") {
    return "bg-error/15 text-error";
  }
  return "bg-warning/15 text-warning";
}

function deriveOwnerName(vendor) {
  const explicit = vendor.owner_name || vendor.user_full_name;
  if (explicit) {
    return explicit;
  }

  const email = vendor.user_email || vendor.contact_email || "";
  if (!email.includes("@")) {
    return email || "-";
  }

  return email.split("@")[0];
}

const vendorStatusTabs = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "suspended", label: "Suspended" },
];

function AdminVendorsPage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const status = searchParams.get("status") || "all";
  const initialSearch = searchParams.get("search") || "";

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [moderationReason, setModerationReason] = useState("");
  const moderationReasonRef = useRef(null);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch.trim()) {
      next.set("search", debouncedSearch.trim());
    } else {
      next.delete("search");
    }

    if (page !== 1) {
      next.set("page", "1");
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next);
    }
  }, [debouncedSearch, page, searchParams, setSearchParams]);

  const vendorsQuery = useQuery({
    queryKey: ["admin-vendors", page, status, debouncedSearch],
    queryFn: () =>
      fetchAdminVendors({
        page,
        status: status === "all" ? "" : status,
        search: debouncedSearch.trim(),
      }),
    staleTime: 60 * 1000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ vendorId, reason }) =>
      approveAdminVendor(vendorId, {
        reason: reason || "Approved by admin",
      }),
    onSuccess: () => {
      showSuccess("Vendor approved successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-vendors"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard", "stats"] });
      setSelectedVendor(null);
      setModerationReason("");
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not approve vendor."));
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ vendorId, reason }) =>
      suspendAdminVendor(vendorId, {
        reason: reason || "Suspended by admin",
      }),
    onSuccess: () => {
      showSuccess("Vendor suspended successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-vendors"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard", "stats"] });
      setSelectedVendor(null);
      setModerationReason("");
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not suspend vendor."));
    },
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      exportAdminVendorsCsv({
        status: status === "all" ? "" : status,
        search: debouncedSearch.trim(),
      }),
    onSuccess: () => {
      showSuccess("CSV export downloaded.");
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not export vendors."));
    },
  });

  useEffect(() => {
    if (!selectedVendor) {
      return;
    }

    const onKeyDown = (event) => {
      if (
        event.key === "Escape" &&
        !approveMutation.isPending &&
        !suspendMutation.isPending
      ) {
        setSelectedVendor(null);
        setModerationReason("");
      }
    };

    const focusTimer = window.setTimeout(() => {
      moderationReasonRef.current?.focus();
    }, 0);

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedVendor, approveMutation.isPending, suspendMutation.isPending]);

  const vendors = vendorsQuery.data?.results || [];
  const totalPages = vendorsQuery.data?.totalPages || 1;
  const totalCount = vendorsQuery.data?.count || 0;

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
    if (approveMutation.isPending || suspendMutation.isPending) {
      return;
    }
    setSelectedVendor(null);
    setModerationReason("");
  };

  const handleApprove = () => {
    if (!selectedVendor) {
      return;
    }

    approveMutation.mutate({
      vendorId: selectedVendor.id,
      reason: moderationReason.trim(),
    });
  };

  const handleSuspend = () => {
    if (!selectedVendor) {
      return;
    }

    suspendMutation.mutate({
      vendorId: selectedVendor.id,
      reason: moderationReason.trim(),
    });
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">
          Vendor Approval Queue
        </h1>
        <p className="mt-1 text-sm text-muted">
          Review vendor registrations and moderation status.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search shop, owner, or email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportMutation.isPending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {exportMutation.isPending ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {vendorStatusTabs.map((tab) => {
            const isActive = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleStatusChange(tab.value)}
                aria-pressed={isActive}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  isActive
                    ? "bg-primary text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-muted">
          {totalCount} vendor{totalCount === 1 ? "" : "s"} found.
        </p>
      </div>

      {vendorsQuery.isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`admin-vendors-skeleton-${index}`}
                className="h-12 animate-pulse rounded bg-slate-100"
              />
            ))}
          </div>
        </div>
      ) : vendorsQuery.isError ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-primary">
            Could not load vendors
          </h2>
          <p className="mt-2 text-sm text-muted">
            {getAdminApiErrorMessage(
              vendorsQuery.error,
              "Please try again in a moment.",
            )}
          </p>
          <button
            type="button"
            onClick={() => vendorsQuery.refetch()}
            className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Retry
          </button>
        </div>
      ) : vendors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-primary">
            No vendors in this view
          </h2>
          <p className="mt-2 text-sm text-muted">
            Adjust filters or search to find vendors.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Shop Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Registered
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedVendor(vendor)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {vendor.shop_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {deriveOwnerName(vendor)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {vendor.user_email || vendor.contact_email || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {formatDate(vendor.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass(vendor.status)}`}
                      >
                        {vendor.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {vendors.map((vendor) => (
              <article
                key={vendor.id}
                className="cursor-pointer space-y-2 p-4"
                onClick={() => setSelectedVendor(vendor)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {vendor.shop_name}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass(vendor.status)}`}
                  >
                    {vendor.status}
                  </span>
                </div>
                <p className="text-sm text-slate-700">
                  Owner: {deriveOwnerName(vendor)}
                </p>
                <p className="text-xs text-muted">
                  {vendor.user_email || vendor.contact_email || "-"}
                </p>
                <p className="text-xs text-muted">
                  Registered: {formatDate(vendor.created_at)}
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

      {selectedVendor ? (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 p-4"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="mx-auto mt-8 w-full max-w-xl rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Vendor moderation details"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-primary">
                  {selectedVendor.shop_name}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {selectedVendor.user_email || "No owner email"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-semibold text-slate-800">Owner:</span>{" "}
                <span className="text-slate-700">
                  {deriveOwnerName(selectedVendor)}
                </span>
              </p>
              <p>
                <span className="font-semibold text-slate-800">Status:</span>{" "}
                <span className="text-slate-700">{selectedVendor.status}</span>
              </p>
              <p>
                <span className="font-semibold text-slate-800">Phone:</span>{" "}
                <span className="text-slate-700">
                  {selectedVendor.contact_phone || "-"}
                </span>
              </p>
              <p>
                <span className="font-semibold text-slate-800">
                  Registered:
                </span>{" "}
                <span className="text-slate-700">
                  {formatDate(selectedVendor.created_at)}
                </span>
              </p>
            </div>

            <p className="mt-4 text-sm text-slate-700">
              {selectedVendor.description || "No description provided."}
            </p>

            <label
              className="mt-4 block text-sm font-semibold text-slate-800"
              htmlFor="vendor-moderation-reason"
            >
              Moderation Note
            </label>
            <textarea
              id="vendor-moderation-reason"
              ref={moderationReasonRef}
              rows={3}
              value={moderationReason}
              onChange={(event) => setModerationReason(event.target.value)}
              placeholder="Optional reason shown in admin audit logs"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleSuspend}
                disabled={
                  approveMutation.isPending || suspendMutation.isPending
                }
                className="rounded-md border border-error px-4 py-2 text-sm font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Suspend
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={
                  approveMutation.isPending || suspendMutation.isPending
                }
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
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

export default AdminVendorsPage;
