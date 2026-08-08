import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'

export default function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex">
        <aside className="min-h-screen w-64 bg-slate-900 p-6 text-white">
          <h2 className="text-xl font-bold">AutoRental</h2>
          <p className="mt-2 text-sm text-slate-300">Espace administrateur</p>

          <div className="mt-8 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Connecté</p>
              <p className="mt-2 text-sm font-medium text-white">{user ? `${user.first_name} ${user.last_name}`.trim() || user.email : 'Utilisateur'}</p>
              <p className="text-sm text-slate-300">{user?.email}</p>
            </div>

            <Button type="button" variant="secondary" className="w-full" onClick={() => void logout()}>
              Déconnexion
            </Button>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}