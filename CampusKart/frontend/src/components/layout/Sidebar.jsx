import { NavLink } from "react-router-dom";
import { useUIStore } from "../../store/uiStore";

const adminNavItems = [
  { key: "dashboard", label: "Dashboard" },
  { key: "vendors", label: "Vendors" },
  { key: "products", label: "Products" },
  { key: "banners", label: "Banners" },
  { key: "orders", label: "Orders" },
  { key: "payouts", label: "Payouts" },
  { key: "settings", label: "Settings" },
];

const vendorNavItems = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders" },
  { key: "analytics", label: "Analytics" },
  { key: "payouts", label: "Payouts" },
  { key: "settings", label: "Settings" },
];

function Sidebar({ role }) {
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const closeSidebar = useUIStore((state) => state.closeSidebar);
  const base = role === "admin" ? "/admin" : "/vendor";
  const navItems = role === "admin" ? adminNavItems : vendorNavItems;

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[var(--ck-surface-deep)] p-4 lg:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
          {role === "admin" ? "Admin Panel" : "Vendor Panel"}
        </p>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={`${base}/${item.key}`}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-[var(--ck-accent)] text-[#111111]" : "text-slate-600 hover:bg-white/10 hover:text-white"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {isSidebarOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/30 lg:hidden"
          onClick={closeSidebar}
        >
          <aside
            className="h-full w-72 border-r border-white/10 bg-[var(--ck-surface-deep)] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                {role === "admin" ? "Admin Panel" : "Vendor Panel"}
              </p>
              <button
                type="button"
                onClick={closeSidebar}
                className="rounded border border-white/20 px-2 py-1 text-xs text-slate-600 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={`${base}/${item.key}`}
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-[var(--ck-accent)] text-[#111111]" : "text-slate-600 hover:bg-white/10 hover:text-white"}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}

export default Sidebar;


