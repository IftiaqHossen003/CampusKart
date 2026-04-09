import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import { useUIStore } from '../../store/uiStore'
import Footer from './Footer'
import Navbar from './Navbar'
import PageWrapper from './PageWrapper'
import Sidebar from './Sidebar'

function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const logout = useAuthStore((state) => state.logout)
  const initializeCart = useCartStore((state) => state.initializeCart)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)

  const inVendorArea = location.pathname.startsWith('/vendor')
  const inAdminArea = location.pathname.startsWith('/admin')
  const sidebarRole = inAdminArea ? 'admin' : inVendorArea ? 'vendor' : null
  const showSidebar = Boolean(user && (sidebarRole === 'admin' || sidebarRole === 'vendor'))

  useEffect(() => {
    initializeCart({ forceServerRefresh: Boolean(token) }).catch(() => {
      // Cart endpoints may not be ready during frontend-only development.
    })
  }, [token, initializeCart])

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout/', { refresh: refreshToken })
      }
    } catch {
      // Clear local auth state even if backend token was already invalid.
    } finally {
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onToggleSidebar={toggleSidebar}
        showSidebarToggle={showSidebar}
      />

      <main className="flex flex-1">
        {showSidebar ? <Sidebar role={sidebarRole} /> : null}
        <PageWrapper className="flex-1">
          <Outlet />
        </PageWrapper>
      </main>

      <Footer />
    </div>
  )
}

export default MainLayout