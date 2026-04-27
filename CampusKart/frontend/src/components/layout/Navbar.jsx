import { useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useCartStore } from '../../store/cartStore'

function Navbar({ user, onLogout, onToggleSidebar, showSidebarToggle }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const totalItems = useCartStore((state) => state.totalItems)

  const links = useMemo(() => {
    if (!user) {
      return [
        { label: 'Shop', to: '/shop' },
        { label: 'Login', to: '/login' },
        { label: 'Register', to: '/register' },
      ]
    }

    if (user.role === 'student') {
      return [
        { label: 'Shop', to: '/shop' },
        { label: 'Orders', to: '/orders' },
        { label: 'Wishlist', to: '/wishlist' },
      ]
    }

    if (user.role === 'vendor') {
      return [
        { label: 'Dashboard', to: '/vendor/dashboard' },
        { label: 'Products', to: '/vendor/products' },
        { label: 'Orders', to: '/vendor/orders' },
      ]
    }

    return [
      { label: 'Dashboard', to: '/admin/dashboard' },
      { label: 'Vendors', to: '/admin/vendors' },
      { label: 'Products', to: '/admin/products' },
    ]
  }, [user])

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-primary text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={showSidebarToggle ? onToggleSidebar : () => setMobileOpen((v) => !v)}
          className="rounded-md border border-white/30 px-2 py-1 text-sm md:hidden"
          aria-label="Toggle navigation"
        >
          Menu
        </button>

        <Link to="/" className="shrink-0 text-lg font-semibold tracking-wide">
          CampusKart
        </Link>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="w-full max-w-md">
            <input
              type="search"
              placeholder="Search products, shops, categories"
              className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm placeholder:text-slate-200 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <nav className="hidden items-center gap-3 text-sm md:flex">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-2 py-1 ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link to="/cart" className="relative rounded-md border border-white/30 px-2 py-1 text-xs">
            Cart
            {totalItems > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            ) : null}
          </Link>
          <Link to="/notifications" className="rounded-md border border-white/30 px-2 py-1 text-xs">
            Alerts
          </Link>
          <div className="rounded-full border border-white/40 bg-white/10 px-2 py-1 text-xs font-semibold">
            {user?.full_name?.charAt(0)?.toUpperCase() || 'G'}
          </div>
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
          <div className="mb-3 mt-3">
            <input
              type="search"
              placeholder="Search products, shops, categories"
              className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm placeholder:text-slate-200 focus:border-accent focus:outline-none"
            />
          </div>
          <nav className="flex flex-col gap-1 text-sm">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded px-2 py-2 ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  )
}

export default Navbar