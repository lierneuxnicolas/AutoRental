import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getUnreadNotificationCount } from '../../services/notificationService'

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
      { label: 'Interventions', to: '/manager/interventions' },
      { label: 'Paiements', to: '/manager/payments' },
    ],
  },
  ADMINISTRATEUR: {
    sessionLabel: 'administrateur',
    menuItems: [
      { label: 'Tableau de bord', to: '/admin' },
      { label: 'Utilisateurs', to: '/admin/users' },
      { label: 'Journaux système', to: '/admin/system-logs' },
      { label: 'Réservations', to: '/admin/reservations' },
      { label: 'Véhicules', to: '/admin/vehicles' },
      { label: 'Interventions', to: '/admin/interventions' },
      { label: 'Factures', to: '/admin/invoices' },
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
      { label: 'Mes interventions', to: '/cleaning/interventions' },
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
  const isClient = role === 'CLIENT'

  const unreadCountQuery = useQuery({
    queryKey: ['client-notifications-count'],
    queryFn: getUnreadNotificationCount,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: isClient,
  })

  const unreadCount = unreadCountQuery.data?.unread_count ?? 0
  const unreadCountLabel = unreadCount > 9 ? '9+' : unreadCount.toString()

  const firstName = useMemo(() => {
    const trimmed = user?.first_name?.trim()

    if (trimmed) {
      return trimmed
    }

    return user?.email ?? 'Utilisateur'
  }, [user?.email, user?.first_name])

  const clientMenuItems: MenuItem[] = useMemo(
    () => [
      { label: 'Tableau de bord', to: '/client' },
      { label: 'Mes réservations', to: '/client/reservations' },
      { label: 'Notifications', to: '/client/notifications' },
      { label: 'Mon profil', to: '/client/profile' },
      { label: 'Mes factures', to: '/client/invoices' },
    ],
    [],
  )

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
      {isClient ? (
        <Link
          to="/client/notifications"
          onClick={() => {
            closeMenu()
            onAction?.()
          }}
          className="relative inline-flex items-center justify-center rounded-2xl border border-slate-200 p-2 text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
          aria-label={`Voir les notifications (${unreadCount} non lues)`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[11px] font-semibold text-white">
              {unreadCountLabel}
            </span>
          ) : null}
        </Link>
      ) : null}

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
          {isClient ? (
            <div className="flex flex-col">
              {clientMenuItems.map((item) => (
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

              <div className="my-1 h-px bg-slate-200" aria-hidden="true" />

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
          ) : (
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
          )}
        </div>
      ) : null}
    </div>
  )
}
