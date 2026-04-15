import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminAuditLogs,
  fetchAdminCategories,
  getAdminApiErrorMessage,
  updateAdminCategory,
} from "../api/admin";

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

function defaultCategoryForm() {
  return {
    name: "",
    slug: "",
    icon_url: "",
    is_active: true,
  };
}

function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState(defaultCategoryForm);
  const [auditResourceFilter, setAuditResourceFilter] = useState("");

  const categoriesQuery = useQuery({
    queryKey: ["admin-settings", "categories"],
    queryFn: () => fetchAdminCategories({ page: 1 }),
    staleTime: 60 * 1000,
  });

  const auditLogsQuery = useQuery({
    queryKey: ["admin-settings", "audit-logs", auditResourceFilter],
    queryFn: () =>
      fetchAdminAuditLogs({
        page: 1,
        resource_type: auditResourceFilter,
      }),
    staleTime: 30 * 1000,
  });

  const saveCategoryMutation = useMutation({
    mutationFn: (payload) => {
      if (editingCategory) {
        return updateAdminCategory(editingCategory.id, payload);
      }

      return createAdminCategory(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-settings", "categories"],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin-settings", "audit-logs"],
      });
      resetCategoryForm();
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId) => deleteAdminCategory(categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-settings", "categories"],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin-settings", "audit-logs"],
      });
      if (editingCategory) {
        resetCategoryForm();
      }
    },
  });

  const categories = useMemo(
    () => categoriesQuery.data?.results || [],
    [categoriesQuery.data],
  );

  const auditLogs = useMemo(
    () => auditLogsQuery.data?.results || [],
    [auditLogsQuery.data],
  );

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryForm(defaultCategoryForm());
  };

  const handleCategorySubmit = (event) => {
    event.preventDefault();

    const payload = {
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim(),
      icon_url: categoryForm.icon_url.trim(),
      is_active: Boolean(categoryForm.is_active),
      parent: null,
    };

    if (!payload.slug) {
      delete payload.slug;
    }

    if (!payload.icon_url) {
      delete payload.icon_url;
    }

    saveCategoryMutation.mutate(payload);
  };

  const handleDeleteCategory = (categoryId) => {
    if (!window.confirm("Delete this category?")) {
      return;
    }

    deleteCategoryMutation.mutate(categoryId);
  };

  const startEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name || "",
      slug: category.slug || "",
      icon_url: category.icon_url || "",
      is_active: Boolean(category.is_active),
    });
  };

  const isCategoryBusy =
    saveCategoryMutation.isPending || deleteCategoryMutation.isPending;

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Admin Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage catalog taxonomy and audit operations from one place.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Categories</h2>
            <span className="text-xs text-muted">
              {categories.length} total
            </span>
          </div>

          {categoriesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`category-skeleton-${index}`}
                  className="h-12 animate-pulse rounded bg-slate-100"
                />
              ))}
            </div>
          ) : categoriesQuery.isError ? (
            <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {getAdminApiErrorMessage(
                categoriesQuery.error,
                "Could not load categories.",
              )}
            </p>
          ) : categories.length === 0 ? (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
              No categories found.
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <article
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {category.name}
                    </p>
                    <p className="text-xs text-muted">/{category.slug}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        category.is_active
                          ? "bg-success/15 text-success"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {category.is_active ? "Active" : "Inactive"}
                    </span>

                    <button
                      type="button"
                      onClick={() => startEditCategory(category)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category.id)}
                      disabled={isCategoryBusy}
                      className="rounded-md border border-error px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">
            {editingCategory ? "Edit Category" : "Create Category"}
          </h2>

          <form className="mt-4 space-y-3" onSubmit={handleCategorySubmit}>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Name
              </span>
              <input
                type="text"
                required
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Slug (optional)
              </span>
              <input
                type="text"
                value={categoryForm.slug}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Icon URL (optional)
              </span>
              <input
                type="url"
                value={categoryForm.icon_url}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    icon_url: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={categoryForm.is_active}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              Active category
            </label>

            {saveCategoryMutation.isError || deleteCategoryMutation.isError ? (
              <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
                {getAdminApiErrorMessage(
                  saveCategoryMutation.error || deleteCategoryMutation.error,
                  "Could not save category changes.",
                )}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {editingCategory ? (
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  disabled={isCategoryBusy}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              ) : null}

              <button
                type="submit"
                disabled={isCategoryBusy}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveCategoryMutation.isPending
                  ? "Saving..."
                  : editingCategory
                    ? "Update Category"
                    : "Create Category"}
              </button>
            </div>
          </form>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">
            Recent Admin Audit Logs
          </h2>

          <select
            value={auditResourceFilter}
            onChange={(event) => setAuditResourceFilter(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">All resources</option>
            <option value="banner">Banner</option>
            <option value="category">Category</option>
            <option value="vendor_profile">Vendor Profile</option>
            <option value="product">Product</option>
          </select>
        </div>

        {auditLogsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`audit-skeleton-${index}`}
                className="h-11 animate-pulse rounded bg-slate-100"
              />
            ))}
          </div>
        ) : auditLogsQuery.isError ? (
          <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getAdminApiErrorMessage(
              auditLogsQuery.error,
              "Could not load audit logs.",
            )}
          </p>
        ) : auditLogs.length === 0 ? (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
            No audit logs found for this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Action
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Resource
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Actor
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    When
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {auditLogs.slice(0, 10).map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2 text-sm text-slate-800">
                      {log.action}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {log.resource_type}
                      {log.resource_id ? ` #${log.resource_id}` : ""}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {log.actor_email || "System"}
                    </td>
                    <td className="px-3 py-2 text-sm text-muted">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}

export default AdminSettingsPage;
