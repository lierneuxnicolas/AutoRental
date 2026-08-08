import { Outlet } from 'react-router-dom'

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <span className="text-2xl font-bold text-blue-700">AutoRental</span>

          <nav className="flex gap-6 text-sm font-medium text-slate-700">
            <a href="/">Accueil</a>
            <a href="/vehicles">Véhicules</a>
            <a href="/login">Connexion</a>
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}