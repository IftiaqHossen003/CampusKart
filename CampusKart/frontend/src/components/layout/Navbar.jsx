import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
} from "../../api/notifications";
import { useCartStore } from "../../store/cartStore";

function Navbar({ user, onLogout, onToggleSidebar, showSidebarToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationMenuRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const totalItems = useCartStore((state) => state.totalItems);
  const showCart = !user || user.role === "student";
  const profilePath = user ? "/profile" : "/login";

  const notificationsEnabled = Boolean(user);

  const notificationsQuery = useQuery({
    queryKey: ["notifications-latest"],
    queryFn: () => fetchNotifications({ page: 1 }),
    enabled: notificationsEnabled,
    staleTime: 15 * 1000,
    refetchInterval: notificationsEnabled ? 30 * 1000 : false,
    refetchOnWindowFocus: true,
  });

  const unreadCountQuery = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: fetchUnreadNotificationCount,
    enabled: notificationsEnabled,
    staleTime: 10 * 1000,
    refetchInterval: notificationsEnabled ? 30 * 1000 : false,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications-latest"] });
      const previous = queryClient.getQueryData(["notifications-latest"]);

      queryClient.setQueryData(["notifications-latest"], (cached) => {
        if (!cached || !Array.isArray(cached.results)) {
          return cached;
        }

        return {
          ...cached,
          results: cached.results.map((item) => {
            if (item.id !== id) {
              return item;
            }
            return { ...item, is_read: true };
          }),
        };
      });

      queryClient.setQueryData(["notifications-unread-count"], (count) => {
        if (typeof count !== "number") {
          return count;
        }
        return Math.max(0, count - 1);
      });

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notifications-latest"], context.previous);
      }
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-latest"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    },
  });

  useEffect(() => {
    if (!notificationOpen) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (!notificationMenuRef.current?.contains(event.target)) {
        setNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [notificationOpen]);

  const latestNotifications = useMemo(() => {
    if (!Array.isArray(notificationsQuery.data?.results)) {
      return [];
    }
    return notificationsQuery.data.results.slice(0, 10);
  }, [notificationsQuery.data]);

  const unreadCount =
    typeof unreadCountQuery.data === "number" ? unreadCountQuery.data : 0;

  useEffect(() => {
    if (location.pathname !== "/shop") {
      return;
    }

    const params = new URLSearchParams(location.search);
    setSearchInput(params.get("search") || "");
  }, [location.pathname, location.search]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    const normalizedSearch = searchInput.trim();
    const next = new URLSearchParams();
    next.set("page", "1");

    if (normalizedSearch) {
      next.set("search", normalizedSearch);
    }

    navigate(`/shop?${next.toString()}`);
    setMobileOpen(false);
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read && !markReadMutation.isPending) {
      markReadMutation.mutate(notification.id);
    }

    setNotificationOpen(false);

    if (notification.link) {
      navigate(notification.link);
      return;
    }

    navigate("/notifications");
  };

  const links = useMemo(() => {
    if (!user) {
      return [
        { label: "Shop", to: "/shop" },
        { label: "Login", to: "/login" },
        { label: "Register", to: "/register" },
      ];
    }

    if (user.role === "student") {
      return [
        { label: "Shop", to: "/shop" },
        { label: "Orders", to: "/orders" },
        { label: "Chat", to: "/chat" },
        { label: "Wishlist", to: "/wishlist" },
      ];
    }

    if (user.role === "vendor") {
      return [
        { label: "Dashboard", to: "/vendor/dashboard" },
        { label: "Products", to: "/vendor/products" },
        { label: "Orders", to: "/vendor/orders" },
        { label: "Chat", to: "/chat" },
      ];
    }

    return [
      { label: "Dashboard", to: "/admin/dashboard" },
      { label: "Vendors", to: "/admin/vendors" },
      { label: "Products", to: "/admin/products" },
    ];
  }, [user]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-primary text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={
            showSidebarToggle ? onToggleSidebar : () => setMobileOpen((v) => !v)
          }
          className="rounded-md border border-white/30 px-2 py-1 text-sm md:hidden"
          aria-label="Toggle navigation"
        >
          Menu
        </button>

        <Link to="/" className="shrink-0 text-lg font-semibold tracking-wide">
          CampusKart
        </Link>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <form className="w-full max-w-md" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search products, shops, categories"
              className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm placeholder:text-slate-200 focus:border-accent focus:outline-none"
            />
          </form>
        </div>

        <nav className="hidden items-center gap-3 text-sm md:flex">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-2 py-1 ${isActive ? "bg-white/20" : "hover:bg-white/10"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {showCart ? (
            <Link
              to="/cart"
              className="relative rounded-md border border-white/30 px-2 py-1 text-xs"
            >
              Cart
              {totalItems > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              ) : null}
            </Link>
          ) : null}

          {user ? (
            <div className="relative" ref={notificationMenuRef}>
              <button
                type="button"
                onClick={() => setNotificationOpen((value) => !value)}
                className="relative rounded-md border border-white/30 px-2 py-1 text-xs hover:bg-white/10"
                aria-label="Open notifications"
                title="Notifications"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22ZM19 17H5l1.8-2.4c.35-.46.54-1.03.54-1.61V10a4.66 4.66 0 0 1 3.66-4.58V5a1 1 0 1 1 2 0v.42A4.66 4.66 0 0 1 16.66 10v2.99c0 .58.19 1.15.54 1.61L19 17Z"
                    fill="currentColor"
                  />
                </svg>

                {unreadCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>

              {notificationOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-800 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <p className="text-sm font-semibold text-primary">
                      Notifications
                    </p>
                    {unreadCount > 0 ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {unreadCount} unread
                      </span>
                    ) : null}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notificationsQuery.isLoading ? (
                      <p className="px-3 py-4 text-xs text-muted">
                        Loading notifications...
                      </p>
                    ) : null}

                    {!notificationsQuery.isLoading &&
                    latestNotifications.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted">
                        No notifications yet.
                      </p>
                    ) : null}

                    {!notificationsQuery.isLoading &&
                    latestNotifications.length > 0
                      ? latestNotifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() =>
                              handleNotificationClick(notification)
                            }
                            className="w-full border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-slate-900">
                                  {notification.title}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-slate-700">
                                  {notification.message}
                                </p>
                              </div>

                              {!notification.is_read ? (
                                <span
                                  className="mt-1 inline-flex h-2 w-2 rounded-full bg-accent"
                                  aria-hidden="true"
                                />
                              ) : null}
                            </div>
                          </button>
                        ))
                      : null}
                  </div>

                  <Link
                    to="/notifications"
                    onClick={() => setNotificationOpen(false)}
                    className="block border-t border-slate-200 px-3 py-2 text-center text-xs font-semibold text-accent hover:bg-slate-50"
                  >
                    See all notifications
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          <Link
            to={profilePath}
            aria-label="Open profile"
            className="rounded-full border border-white/40 bg-white/10 px-2 py-1 text-xs font-semibold transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {user?.full_name?.charAt(0)?.toUpperCase() || "G"}
          </Link>
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold"
            >
              Logout
            </button>
          ) : null}
        </div>
      </div>

      {!showSidebarToggle && mobileOpen ? (
        <div className="border-t border-white/20 px-4 pb-3 md:hidden">
          <form className="mb-3 mt-3" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search products, shops, categories"
              className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm placeholder:text-slate-200 focus:border-accent focus:outline-none"
            />
          </form>
          <nav className="flex flex-col gap-1 text-sm">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded px-2 py-2 ${isActive ? "bg-white/20" : "hover:bg-white/10"}`
                }
              >
                {item.label}
              </NavLink>
            ))}

            {user ? (
              <NavLink
                to="/notifications"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded px-2 py-2 ${isActive ? "bg-white/20" : "hover:bg-white/10"}`
                }
              >
                Notifications
              </NavLink>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export default Navbar;
