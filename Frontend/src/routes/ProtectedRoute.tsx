import { Navigate, Outlet } from 'react-router-dom'
import LoadingSpinner from '../components/feedback/LoadingSpinner'
import { useAuth } from '../hooks/useAuth'

interface ProtectedRouteProps {
  allowedRoles?: string[]
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" aria-label="Vérification de l’authentification" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role?.toUpperCase() ?? '')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#DC2626]">403</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Accès refusé</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Votre compte ne dispose pas des autorisations nécessaires pour afficher cette page.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
