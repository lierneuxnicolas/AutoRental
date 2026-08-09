import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface MenuItem {
  label: string
  to: string
}

interface RoleConfig {
  sessionLabel: string
  menuItems: MenuItem[]
}

interface UserSessionMenuProps {
  isMobile?: boolean
  onAction?: () => void
}

const roleConfigs: Record<string, RoleConfig> = {
  CLIENT: {
    sessionLabel: 'client',
    menuItems: [
      { label: 'Mon espace', to: '/client' },
      { label: 'Mes réservations', to: '/client/reservations' },
      { label: 'Mon profil', to: '/client/profile' },
      { label: 'Mes documents', to: '/client/documents' },
      { label: 'Mes factures', to: '/client/invoices' },
    ],
  },
  GESTIONNAIRE_COMPTABLE: {
    sessionLabel: 'gestionnaire',
    menuItems: [
      { label: 'Tableau de bord', to: '/manager' },
      { label: 'Gestion des véhicules', to: '/manager/vehicles' },
      { label: 'Réservations', to: '/manager/reservations' },
      { label: 'Documents à valider', to: '/manager/documents' },
      { label: 'Paiements', to: '/manager/payments' },
    ],
  },
  ADMINISTRATEUR: {
    sessionLabel: 'administrateur',
    menuItems: [
      { label: 'Tableau de bord', to: '/admin' },
      { label: 'Utilisateurs', to: '/admin/users' },
      { label: 'Rôles', to: '/admin/roles' },
      { label: 'Paramètres', to: '/admin/settings' },
      { label: 'Statistiques', to: '/admin/statistics' },
    ],
  },
  MECANICIEN: {
    sessionLabel: 'mécanicien',
    menuItems: [
      { label: 'Tableau de bord', to: '/mechanic' },
      { label: 'Véhicules à réparer', to: '/mechanic/vehicles' },
      { label: 'Interventions', to: '/mechanic/interventions' },
      { label: 'Historique', to: '/mechanic/history' },
    ],
  },
  NETTOYEUR: {
    sessionLabel: 'nettoyage',
    menuItems: [
      { label: 'Tableau de bord', to: '/cleaning' },
      { label: 'Véhicules à nettoyer', to: '/cleaning/vehicles' },
      { label: 'Historique', to: '/cleaning/history' },
    ],
  },
}

export default function UserSessionMenu({ isMobile = false, onAction }: UserSessionMenuProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const role = (user?.role ?? '').toUpperCase()
  const roleConfig = roleConfigs[role]

  const firstName = useMemo(() => {
    const trimmed = user?.first_name?.trim()

    if (trimmed) {
      return trimmed
    }

    return user?.email ?? 'Utilisateur'
  }, [user?.email, user?.first_name])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null

      if (!target || !containerRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (!user || !roleConfig) {
    return null
  }

  const closeMenu = () => {
    setOpen(false)
    onAction?.()
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      await logout()
      closeMenu()
      navigate('/')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const wrapperClassName = isMobile ? 'relative w-full overflow-visible' : 'relative overflow-visible'
  const triggerClassName = isMobile
    ? 'inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 text-left text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]'
    : 'inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]'
  const menuClassName = isMobile
    ? 'absolute left-0 right-0 z-[1100] mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg'
    : 'absolute right-0 z-[1100] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg'

  return (
    <div ref={containerRef} className={wrapperClassName}>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>{`👤 Session ${roleConfig.sessionLabel} : ${firstName}`}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className={menuClassName} role="menu" aria-label="Menu de session utilisateur">
          <div className="flex flex-col">
            {roleConfig.menuItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                role="menuitem"
                onClick={closeMenu}
                className="rounded-xl px-3 py-2 text-sm text-[#1F2937] transition hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="rounded-xl px-3 py-2 text-left text-sm font-medium text-[#DC2626] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoggingOut ? 'Déconnexion...' : 'Déconnexion'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
