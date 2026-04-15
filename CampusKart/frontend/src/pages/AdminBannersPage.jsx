import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminBanner,
  deleteAdminBanner,
  fetchAdminBanners,
  getAdminApiErrorMessage,
  updateAdminBanner,
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

function defaultFormState() {
  return {
    title: "",
    image_url: "",
    link: "",
    position: 0,
    is_active: true,
  };
}

function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [editingBanner, setEditingBanner] = useState(null);
  const [formState, setFormState] = useState(defaultFormState);

  const bannersQuery = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => fetchAdminBanners({ page: 1 }),
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      if (editingBanner) {
        return updateAdminBanner(editingBanner.id, payload);
      }

      return createAdminBanner(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (bannerId) => deleteAdminBanner(bannerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      if (editingBanner) {
        resetForm();
      }
    },
  });

  const banners = useMemo(() => bannersQuery.data?.results || [], [bannersQuery.data]);

  const isBusy = saveMutation.isPending || deleteMutation.isPending;

  const resetForm = () => {
    setEditingBanner(null);
    setFormState(defaultFormState());
  };

  const startEdit = (banner) => {
    setEditingBanner(banner);
    setFormState({
      title: banner.title || "",
      image_url: banner.image_url || "",
      link: banner.link || "",
      position: Number(banner.position || 0),
      is_active: Boolean(banner.is_active),
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const payload = {
      title: formState.title.trim(),
      image_url: formState.image_url.trim(),
      link: formState.link.trim(),
      position: Number(formState.position || 0),
      is_active: Boolean(formState.is_active),
    };

    saveMutation.mutate(payload);
  };

  const handleDelete = (bannerId) => {
    if (!window.confirm("Delete this banner?")) {
      return;
    }

    deleteMutation.mutate(bannerId);
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <h1 className="text-2xl font-bold text-primary">Admin Banners</h1>
        <p className="mt-1 text-sm text-muted">Create and reorder homepage promotional banners.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Existing Banners</h2>
            <span className="text-xs text-muted">{banners.length} total</span>
          </div>

          {bannersQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`banner-skeleton-${index}`} className="h-16 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : bannersQuery.isError ? (
            <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {getAdminApiErrorMessage(bannersQuery.error, "Could not load banners.")}
            </p>
          ) : banners.length === 0 ? (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
              No banners yet. Create one from the form.
            </p>
          ) : (
            <div className="space-y-3">
              {banners.map((banner) => (
                <article key={banner.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{banner.title}</p>
                      <p className="mt-1 text-xs text-muted">Position: {banner.position}</p>
                      <p className="text-xs text-muted">Updated: {formatDate(banner.updated_at)}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        banner.is_active
                          ? "bg-success/15 text-success"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {banner.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {banner.image_url ? (
                    <img
                      src={banner.image_url}
                      alt={banner.title}
                      className="mt-3 h-24 w-full rounded border border-slate-200 object-cover"
                      loading="lazy"
                    />
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(banner)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(banner.id)}
                      disabled={isBusy}
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
            {editingBanner ? "Edit Banner" : "Create Banner"}
          </h2>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Title</span>
              <input
                type="text"
                required
                value={formState.title}
                onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Image URL</span>
              <input
                type="url"
                required
                value={formState.image_url}
                onChange={(event) => setFormState((current) => ({ ...current, image_url: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Link (optional)</span>
              <input
                type="url"
                value={formState.link}
                onChange={(event) => setFormState((current) => ({ ...current, link: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Position</span>
              <input
                type="number"
                min={0}
                value={formState.position}
                onChange={(event) => setFormState((current) => ({ ...current, position: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formState.is_active}
                onChange={(event) => setFormState((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active banner
            </label>

            {(saveMutation.isError || deleteMutation.isError) ? (
              <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
                {getAdminApiErrorMessage(
                  saveMutation.error || deleteMutation.error,
                  "Could not save banner changes.",
                )}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {editingBanner ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isBusy}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              ) : null}

              <button
                type="submit"
                disabled={isBusy}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveMutation.isPending
                  ? "Saving..."
                  : editingBanner
                    ? "Update Banner"
                    : "Create Banner"}
              </button>
            </div>
          </form>
        </article>
      </div>
    </section>
  );
}

export default AdminBannersPage;
