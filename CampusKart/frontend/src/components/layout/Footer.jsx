import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[var(--ck-surface-deep)]">
      <div className="grid w-full gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-lg font-bold tracking-tight">
              <span className="text-white">Campus</span>
              <span className="text-[var(--ck-accent)]">Kart</span>
            </p>
            <p className="max-w-lg text-sm text-[#d9d9d9]">
              Your student marketplace for essentials, tech, fashion, and
              campus-ready deals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-[#d9d9d9] lg:justify-end">
            <Link to="/shop" className="transition hover:text-[var(--ck-accent)]">
              Shop
            </Link>
            <Link
              to="/wishlist"
              className="transition hover:text-[var(--ck-accent)]"
            >
              Wishlist
            </Link>
            <Link
              to="/orders"
              className="transition hover:text-[var(--ck-accent)]"
            >
              Orders
            </Link>
            <Link
              to="/notifications"
              className="transition hover:text-[var(--ck-accent)]"
            >
              Notifications
            </Link>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 text-xs text-[#a7a7a7]">
          Copyright {new Date().getFullYear()} CampusKart. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default Footer;
