import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm text-muted sm:flex-row sm:px-6 lg:px-8">
        <p>Copyright {new Date().getFullYear()} CampusKart. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link to="/shop" className="hover:text-accent">Shop</Link>
          <Link to="/profile" className="hover:text-accent">Profile</Link>
          <Link to="/notifications" className="hover:text-accent">Notifications</Link>
        </div>
      </div>
    </footer>
  )
}

export default Footer