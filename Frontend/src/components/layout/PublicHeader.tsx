import { NavLink, Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { label: 'Accueil', to: '/' },
  { label: 'Véhicules', to: '/vehicles' },
  { label: 'Fonctionnement', to: '/#fonctionnement' },
  { label: 'FAQ', to: '/#faq' },
  { label: 'Assistance', to: '/#assistance' },
]

const linkStyles = 'text-sm font-medium transition-colors'

export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="text-xl font-semibold tracking-tight text-[#1F2937]">
          <span className="text-[#2563EB]">Auto</span>Rental
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Navigation principale">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${linkStyles} ${isActive ? 'text-[#2563EB]' : 'text-[#1F2937] hover:text-[#2563EB]'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/login"
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            Connexion
          </Link>
          <Link
            to="/register"
            className="rounded-2xl bg-[#F97316] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#EA580C]"
          >
            Créer un compte
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 p-2 text-[#1F2937] md:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label="Ouvrir le menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Navigation mobile">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded-2xl px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-blue-50 text-[#2563EB]' : 'text-[#1F2937]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2">
            <Link to="/login" className="rounded-2xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-[#1F2937]" onClick={() => setMobileOpen(false)}>
              Connexion
            </Link>
            <Link to="/register" className="rounded-2xl bg-[#F97316] px-3 py-2 text-center text-sm font-medium text-white" onClick={() => setMobileOpen(false)}>
              Créer un compte
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  )
}
