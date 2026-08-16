import { NavLink, Link } from 'react-router-dom'
import { CarFront, ChevronDown, CircleHelp, Globe, Menu, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import Logo from '../Logo'
import UserSessionMenu from './UserSessionMenu'

const navItems = [
  { label: 'Catalogue véhicules', to: '/vehicles', Icon: CarFront },
  { label: 'Aide & Contact', to: '/contact', Icon: CircleHelp },
]

const languageOptions = [
  { value: 'FR', label: 'FR' },
  { value: 'NL', label: 'NL' },
  { value: 'EN', label: 'EN' },
]

const linkStyles = 'text-base font-medium transition-colors'
const authMenuItems = [
  { label: 'Se connecter', to: '/login' },
  { label: 'Créer un compte', to: '/register' },
]

type OpenMenu = 'language' | 'account' | null
const MENU_CLOSE_DELAY_MS = 200

export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [selectedLanguage, setSelectedLanguage] = useState('FR')
  const desktopAuthMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileAuthMenuRef = useRef<HTMLDivElement | null>(null)
  const desktopLanguageMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileLanguageMenuRef = useRef<HTMLDivElement | null>(null)
  const closeMenuTimeoutRef = useRef<number | null>(null)
  const { isAuthenticated, user, isLoading } = useAuth()
  const hasSession = isAuthenticated && Boolean(user)
  const languageMenuOpen = openMenu === 'language'
  const authMenuOpen = openMenu === 'account'

  useEffect(() => {
    if (!openMenu) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      const isInsideMenu =
        Boolean(target) &&
        (desktopAuthMenuRef.current?.contains(target) ||
          mobileAuthMenuRef.current?.contains(target) ||
          desktopLanguageMenuRef.current?.contains(target) ||
          mobileLanguageMenuRef.current?.contains(target))

      if (!isInsideMenu) {
        if (closeMenuTimeoutRef.current !== null) {
          window.clearTimeout(closeMenuTimeoutRef.current)
          closeMenuTimeoutRef.current = null
        }
        setOpenMenu(null)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeMenuTimeoutRef.current !== null) {
          window.clearTimeout(closeMenuTimeoutRef.current)
          closeMenuTimeoutRef.current = null
        }
        setOpenMenu(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openMenu])

  useEffect(() => {
    return () => {
      if (closeMenuTimeoutRef.current !== null) {
        window.clearTimeout(closeMenuTimeoutRef.current)
      }
    }
  }, [])

  const cancelPendingMenuClose = () => {
    if (closeMenuTimeoutRef.current !== null) {
      window.clearTimeout(closeMenuTimeoutRef.current)
      closeMenuTimeoutRef.current = null
    }
  }

  const scheduleMenuClose = (menu: Exclude<OpenMenu, null>) => {
    cancelPendingMenuClose()

    closeMenuTimeoutRef.current = window.setTimeout(() => {
      setOpenMenu((value) => (value === menu ? null : value))
      closeMenuTimeoutRef.current = null
    }, MENU_CLOSE_DELAY_MS)
  }

  const closeAuthMenu = () => {
    cancelPendingMenuClose()
    setOpenMenu(null)
  }

  const closeLanguageMenu = () => {
    cancelPendingMenuClose()
    setOpenMenu(null)
  }

  return (
    <header className="relative z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center w-[140px] md:w-[165px] lg:w-[190px] shrink-0" aria-label="GetaCar accueil">
          <Logo width="100%" className="w-full h-auto object-contain" />
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Navigation principale">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 ${linkStyles} ${isActive ? 'text-[#2563EB]' : 'text-[#1F2937] hover:text-[#2563EB]'}`
                }
              >
                <item.Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div
            ref={desktopLanguageMenuRef}
            className="relative"
            onMouseEnter={cancelPendingMenuClose}
            onMouseLeave={() => scheduleMenuClose('language')}
          >
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
              onClick={() => {
                cancelPendingMenuClose()
                setOpenMenu((value) => (value === 'language' ? null : 'language'))
              }}
              aria-expanded={languageMenuOpen}
              aria-haspopup="menu"
              aria-label="Sélectionner la langue"
            >
              <Globe className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
              <span>{selectedLanguage}</span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>

            {languageMenuOpen ? (
              <div className="absolute right-0 z-[1100] mt-2 w-28 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg" role="menu" aria-label="Sélection de la langue">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedLanguage === option.value}
                    onClick={() => {
                      setSelectedLanguage(option.value)
                      closeLanguageMenu()
                    }}
                    className={`flex w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition ${
                      selectedLanguage === option.value ? 'bg-blue-50 text-[#2563EB]' : 'text-[#1F2937] hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {!isLoading && hasSession ? (
            <UserSessionMenu />
          ) : (
            <div
              ref={desktopAuthMenuRef}
              className="relative"
              onMouseEnter={cancelPendingMenuClose}
              onMouseLeave={() => scheduleMenuClose('account')}
            >
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#2563EB] bg-white px-4 py-2 text-base font-medium text-[#1F2937] transition hover:bg-blue-50"
                onClick={() => {
                  cancelPendingMenuClose()
                  setOpenMenu((value) => (value === 'account' ? null : 'account'))
                }}
                aria-expanded={authMenuOpen}
                aria-haspopup="menu"
              >
                <UserRound className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                <span>Connexion / Inscription</span>
              </button>

              {authMenuOpen ? (
                <div className="absolute right-0 z-[1100] mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg" role="menu" aria-label="Menu de connexion et inscription">
                  {authMenuItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      role="menuitem"
                      onClick={closeAuthMenu}
                      className="block rounded-xl px-3 py-2 text-base font-medium text-[#1F2937] transition hover:bg-slate-100 hover:text-[#2563EB]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
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
                  `inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-base font-medium ${
                    isActive ? 'bg-blue-50 text-[#2563EB]' : 'text-[#1F2937]'
                  }`
                }
              >
                <item.Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2">
            <div
              ref={mobileLanguageMenuRef}
              className="relative"
              onMouseEnter={cancelPendingMenuClose}
              onMouseLeave={() => scheduleMenuClose('language')}
            >
              <button
                type="button"
                className="inline-flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-base font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
                onClick={() => {
                  cancelPendingMenuClose()
                  setOpenMenu((value) => (value === 'language' ? null : 'language'))
                }}
                aria-expanded={languageMenuOpen}
                aria-haspopup="menu"
                aria-label="Sélectionner la langue"
              >
                <span className="inline-flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                  Langue
                </span>
                <span className="inline-flex items-center gap-2">
                  <span>{selectedLanguage}</span>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>

              {languageMenuOpen ? (
                <div className="absolute left-0 right-0 z-[1100] mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg" role="menu" aria-label="Sélection de la langue">
                  {languageOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedLanguage === option.value}
                      onClick={() => {
                        setSelectedLanguage(option.value)
                        closeLanguageMenu()
                      }}
                      className={`flex w-full items-center justify-center rounded-xl px-3 py-2 text-base font-medium transition ${
                        selectedLanguage === option.value ? 'bg-blue-50 text-[#2563EB]' : 'text-[#1F2937] hover:bg-slate-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {!isLoading && hasSession ? (
              <UserSessionMenu isMobile onAction={() => setMobileOpen(false)} />
            ) : (
              <div
                ref={mobileAuthMenuRef}
                className="relative"
                onMouseEnter={cancelPendingMenuClose}
                onMouseLeave={() => scheduleMenuClose('account')}
              >
                <button
                  type="button"
                  className="inline-flex w-full items-center gap-2 rounded-2xl border border-[#2563EB] bg-white px-4 py-2 text-base font-medium text-[#1F2937] transition hover:bg-blue-50"
                  onClick={() => {
                    cancelPendingMenuClose()
                    setOpenMenu((value) => (value === 'account' ? null : 'account'))
                  }}
                  aria-expanded={authMenuOpen}
                  aria-haspopup="menu"
                >
                  <UserRound className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                  <span>Connexion / Inscription</span>
                </button>

                {authMenuOpen ? (
                  <div className="absolute left-0 right-0 z-[1100] mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg" role="menu" aria-label="Menu de connexion et inscription">
                    {authMenuItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        onClick={() => {
                          closeAuthMenu()
                          setMobileOpen(false)
                        }}
                        className="block rounded-xl px-3 py-2 text-base font-medium text-[#1F2937] transition hover:bg-slate-100 hover:text-[#2563EB]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  )
}
