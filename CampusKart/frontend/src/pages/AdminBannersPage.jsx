import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  createAdminBanner,
  deleteAdminBanner,
  fetchAdminBanners,
  getAdminApiErrorMessage,
  reorderAdminBanners,
  updateAdminBanner,
} from "../api/admin";
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

function defaultFormState() {
  return {
    title: "",
    link: "",
    position: 0,
    is_active: true,
    image_file: null,
  };
}

function SortableBannerRow({
  banner,
  onEdit,
  onDelete,
  onToggleActive,
  isBusy,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(banner.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-slate-200 p-3 ${isDragging ? "bg-slate-100" : "bg-white"}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          ::
        </button>

        <img
          src={banner.image_url}
          alt={banner.title}
          loading="lazy"
          className="h-16 w-24 rounded border border-slate-200 object-cover"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                {banner.title}
              </p>
              <p className="text-xs text-muted">Position: {banner.position}</p>
              <p className="text-xs text-muted">
                Updated: {formatDate(banner.updated_at)}
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(banner.is_active)}
                onChange={() => onToggleActive(banner)}
                disabled={isBusy}
              />
              Active
            </label>
          </div>

          {banner.link ? (
            <a
              href={banner.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-xs text-accent hover:underline"
            >
              {banner.link}
            </a>
          ) : (
            <p className="mt-1 text-xs text-muted">No link provided</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEdit(banner)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(banner.id)}
              disabled={isBusy}
              className="rounded-md border border-error px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AdminBannersPage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const objectUrlRef = useRef(null);

  const [localOrderedIds, setLocalOrderedIds] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [formState, setFormState] = useState(defaultFormState);

  const bannersQuery = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => fetchAdminBanners({ page: 1 }),
    staleTime: 60 * 1000,
  });

  const banners = useMemo(
    () => bannersQuery.data?.results || [],
    [bannersQuery.data],
  );

  const orderedBanners = useMemo(() => {
    if (!localOrderedIds || localOrderedIds.length === 0) {
      return banners;
    }

    const bannerById = new Map(
      banners.map((banner) => [String(banner.id), banner]),
    );

    const arranged = localOrderedIds
      .map((bannerId) => bannerById.get(String(bannerId)))
      .filter(Boolean);

    const arrangedIds = new Set(arranged.map((banner) => String(banner.id)));
    const remaining = banners.filter(
      (banner) => !arrangedIds.has(String(banner.id)),
    );

    return [...arranged, ...remaining];
  }, [banners, localOrderedIds]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      if (editingBanner) {
        return updateAdminBanner(editingBanner.id, payload);
      }
      return createAdminBanner(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      showSuccess(editingBanner ? "Banner updated." : "Banner created.");
      closeModal();
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not save banner."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (bannerId) => deleteAdminBanner(bannerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      showSuccess("Banner deleted.");
      if (editingBanner) {
        closeModal();
      }
    },
    onError: (error) => {
      showError(getAdminApiErrorMessage(error, "Could not delete banner."));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (items) => reorderAdminBanners(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const activeToggleMutation = useMutation({
    mutationFn: ({ bannerId, nextActive }) =>
      updateAdminBanner(bannerId, { is_active: nextActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const isBusy =
    saveMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending ||
    activeToggleMutation.isPending;

  const updateBannerCache = (nextBanners) => {
    queryClient.setQueryData(["admin-banners"], (previous) => {
      if (!previous) {
        return previous;
      }

      if (Array.isArray(previous)) {
        return nextBanners;
      }

      return {
        ...previous,
        results: nextBanners,
      };
    });
  };

  const updatePreviewFromFile = (file, fallback = "") => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!file) {
      setImagePreviewUrl(fallback);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setImagePreviewUrl(objectUrl);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBanner(null);
    setFormState(defaultFormState());
    updatePreviewFromFile(null, "");
  };

  const openCreateModal = () => {
    setEditingBanner(null);
    setFormState(defaultFormState());
    updatePreviewFromFile(null, "");
    setIsModalOpen(true);
  };

  const openEditModal = (banner) => {
    setEditingBanner(banner);
    setFormState({
      title: banner.title || "",
      link: banner.link || "",
      position: Number(banner.position || 0),
      is_active: Boolean(banner.is_active),
      image_file: null,
    });
    updatePreviewFromFile(null, banner.image_url || "");
    setIsModalOpen(true);
  };

  const handleDelete = (bannerId) => {
    if (!window.confirm("Delete this banner?")) {
      return;
    }
    deleteMutation.mutate(bannerId);
  };

  const handleToggleActive = (banner) => {
    const previous = orderedBanners;
    const previousOrderedIds = localOrderedIds;
    const nextActive = !banner.is_active;
    const next = orderedBanners.map((item) =>
      item.id === banner.id ? { ...item, is_active: nextActive } : item,
    );

    setLocalOrderedIds(orderedBanners.map((item) => String(item.id)));
    updateBannerCache(next);

    activeToggleMutation.mutate(
      { bannerId: banner.id, nextActive },
      {
        onError: (error) => {
          setLocalOrderedIds(previousOrderedIds);
          updateBannerCache(previous);
          showError(
            getAdminApiErrorMessage(error, "Could not update active state."),
          );
        },
      },
    );
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = orderedBanners.findIndex(
      (item) => String(item.id) === String(active.id),
    );
    const newIndex = orderedBanners.findIndex(
      (item) => String(item.id) === String(over.id),
    );

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const previous = orderedBanners;
    const previousOrderedIds = localOrderedIds;
    const next = arrayMove(orderedBanners, oldIndex, newIndex).map(
      (item, index) => ({
        ...item,
        position: index,
      }),
    );

    setLocalOrderedIds(next.map((item) => String(item.id)));
    updateBannerCache(next);

    reorderMutation.mutate(
      next.map((item) => item.id),
      {
        onError: (error) => {
          setLocalOrderedIds(previousOrderedIds);
          updateBannerCache(previous);
          showError(
            getAdminApiErrorMessage(error, "Could not reorder banners."),
          );
        },
        onSuccess: () => {
          setLocalOrderedIds(null);
          showSuccess("Banner order saved.");
        },
      },
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!editingBanner && !formState.image_file) {
      showError("Please upload a banner image.");
      return;
    }

    const payload = {
      title: formState.title.trim(),
      link: formState.link.trim(),
      position: Number(formState.position || 0),
      is_active: Boolean(formState.is_active),
    };

    if (formState.image_file) {
      payload.image_file = formState.image_file;
    }

    saveMutation.mutate(payload);
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">Banner Manager</h1>
            <p className="mt-1 text-sm text-muted">
              Drag to reorder banners. Changes save automatically after drop.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Add Banner
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {bannersQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`banner-row-skeleton-${index}`}
                className="h-24 animate-pulse rounded-lg bg-slate-200"
              />
            ))}
          </div>
        ) : null}

        {bannersQuery.isError ? (
          <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getAdminApiErrorMessage(
              bannersQuery.error,
              "Could not load banners.",
            )}
          </p>
        ) : null}

        {!bannersQuery.isLoading &&
        !bannersQuery.isError &&
        orderedBanners.length === 0 ? (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-muted">
            No banners yet. Add one to get started.
          </p>
        ) : null}

        {!bannersQuery.isLoading &&
        !bannersQuery.isError &&
        orderedBanners.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedBanners.map((item) => String(item.id))}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {orderedBanners.map((banner) => (
                  <SortableBannerRow
                    key={banner.id}
                    banner={banner}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    onToggleActive={handleToggleActive}
                    isBusy={isBusy}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : null}
      </div>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 p-4"
          onClick={() => {
            if (!isBusy) {
              closeModal();
            }
          }}
          role="presentation"
        >
          <div
            className="mx-auto mt-10 w-full max-w-xl rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingBanner ? "Edit Banner" : "Add Banner"}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-primary">
                {editingBanner ? "Edit Banner" : "Add Banner"}
              </h2>

              <button
                type="button"
                onClick={closeModal}
                disabled={isBusy}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Title
                </span>
                <input
                  type="text"
                  required
                  value={formState.title}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Link URL
                </span>
                <input
                  type="url"
                  value={formState.link}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      link: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  placeholder="https://example.com/deal"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Position
                </span>
                <input
                  type="number"
                  min={0}
                  value={formState.position}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      position: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formState.is_active}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                />
                Active banner
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Banner Image
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setFormState((current) => ({
                      ...current,
                      image_file: file,
                    }));
                    updatePreviewFromFile(file, editingBanner?.image_url || "");
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt="Banner preview"
                  loading="lazy"
                  className="h-40 w-full rounded-md border border-slate-200 object-cover"
                />
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isBusy}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
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
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AdminBannersPage;
