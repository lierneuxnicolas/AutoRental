import { Outlet } from 'react-router-dom'

export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex">
        <aside className="min-h-screen w-64 bg-slate-900 p-6 text-white">
          <h2 className="text-xl font-bold">AutoRental</h2>
          <p className="mt-2 text-sm text-slate-300">Espace client</p>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}