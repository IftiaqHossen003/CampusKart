import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return children
}

export default ProtectedRoute