import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications";
import Pagination from "../components/ui/Pagination";
import { useToast } from "../hooks/useToast";

function formatDate(value) {
  if (!value) {
    return "N/A";
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

function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPage = Math.max(1, Number(searchParams.get("page") || 1));
  const currentFilter = searchParams.get("filter") || "all";

  const resolvedFilter =
    currentFilter === "unread"
      ? false
      : currentFilter === "read"
        ? true
        : undefined;

  const notificationsQuery = useQuery({
    queryKey: ["notifications-page", currentPage, currentFilter],
    queryFn: () =>
      fetchNotifications({ page: currentPage, isRead: resolvedFilter }),
    staleTime: 15 * 1000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => markNotificationRead(id),
    onError: (error) => {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.non_field_errors?.[0] ||
        "Could not mark notification as read.";
      showError(detail);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-latest"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
      queryClient.setQueryData(["notifications-unread-count"], (count) => {
        if (typeof count !== "number") {
          return count;
        }
        return Math.max(0, count - 1);
      });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onError: (error) => {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.non_field_errors?.[0] ||
        "Could not mark notifications as read.";
      showError(detail);
    },
    onSuccess: () => {
      showSuccess("All notifications marked as read.");
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-latest"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
      queryClient.setQueryData(["notifications-unread-count"], 0);
    },
  });

  const handleFilterChange = (filter) => {
    const next = new URLSearchParams(searchParams);
    next.set("filter", filter);
    next.set("page", "1");
    setSearchParams(next);
  };

  const handlePageChange = (page) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    setSearchParams(next);
  };

  const openNotification = (notification) => {
    if (!notification.is_read && !markReadMutation.isPending) {
      markReadMutation.mutate(notification.id);
    }

    if (notification.link) {
      navigate(notification.link);
    }
  };

  const results = notificationsQuery.data?.results || [];
  const totalPages = notificationsQuery.data?.totalPages || 1;

  if (notificationsQuery.isLoading) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-primary">Notifications</h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`notification-skeleton-${index}`}
                className="h-16 animate-pulse rounded bg-slate-200"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (notificationsQuery.isError) {
    const detail =
      notificationsQuery.error?.response?.data?.detail ||
      "Could not load notifications right now.";

    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-primary">
          Could not load notifications
        </h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
        <button
          type="button"
          onClick={() => notificationsQuery.refetch()}
          className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">Notifications</h1>
            <p className="mt-1 text-sm text-muted">
              Stay on top of order, payment, and system updates.
            </p>
          </div>

          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markAllMutation.isPending ? "Updating..." : "Mark all as read"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleFilterChange("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              currentFilter === "all"
                ? "bg-primary text-white"
                : "border border-slate-300 text-slate-700"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange("unread")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              currentFilter === "unread"
                ? "bg-primary text-white"
                : "border border-slate-300 text-slate-700"
            }`}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange("read")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              currentFilter === "read"
                ? "bg-primary text-white"
                : "border border-slate-300 text-slate-700"
            }`}
          >
            Read
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-primary">
            No notifications found
          </h2>
          <p className="mt-2 text-sm text-muted">
            Try a different filter or come back later.
          </p>
          <Link
            to="/shop"
            className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {results.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className="w-full px-4 py-4 text-left transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {notification.title}
                    </p>
                    <p className="text-sm text-slate-700">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(notification.created_at)}
                    </p>
                  </div>

                  {!notification.is_read ? (
                    <span
                      className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              </button>
            ))}
          </div>

          <div className="p-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default NotificationsPage;
