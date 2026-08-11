import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { getAdminUsers, updateAdminUserStatus } from '../../services/adminUserService'
import type { AdminUserListItem, AdminUserOrdering, AdminUserRoleCode } from '../../types/adminUser'

const PAGE_SIZE = 20

type RoleFilter = 'all' | AdminUserRoleCode

type AccountStatusFilter = 'all' | 'active' | 'inactive'

type EmailVerificationFilter = 'all' | 'verified' | 'unverified'

const roleOptions: Array<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'CLIENT', label: 'CLIENT' },
  { value: 'GESTIONNAIRE_COMPTABLE', label: 'GESTIONNAIRE_COMPTABLE' },
  { value: 'MECANICIEN', label: 'MECANICIEN' },
  { value: 'NETTOYEUR', label: 'NETTOYEUR' },
  { value: 'ADMINISTRATEUR', label: 'ADMINISTRATEUR' },
]

const accountStatusOptions: Array<{ value: AccountStatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
]

const emailVerificationOptions: Array<{ value: EmailVerificationFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'verified', label: 'Vérifié' },
  { value: 'unverified', label: 'Non vérifié' },
]

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatUserLabel(user: AdminUserListItem): string {
  return `${user.first_name} ${user.last_name}`.trim() || user.email
}

function mapRoleToLabel(role: AdminUserRoleCode | null): string {
  if (!role) {
    return '—'
  }

  switch (role) {
    case 'CLIENT':
      return 'Client'
    case 'GESTIONNAIRE_COMPTABLE':
      return 'Gestionnaire'
    case 'ADMINISTRATEUR':
      return 'Administrateur'
    case 'MECANICIEN':
      return 'Mécanicien'
    case 'NETTOYEUR':
      return 'Nettoyeur'
  }
}

function mapRoleToVariant(role: AdminUserRoleCode | null): StatusVariant {
  switch (role) {
    case 'CLIENT':
      return 'neutral'
    case 'GESTIONNAIRE_COMPTABLE':
      return 'info'
    case 'ADMINISTRATEUR':
      return 'success'
    case 'MECANICIEN':
      return 'warning'
    case 'NETTOYEUR':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function mapAccountStatus(user: AdminUserListItem): { label: string; variant: StatusVariant } {
  return user.is_active
    ? { label: 'Actif', variant: 'success' }
    : { label: 'Inactif', variant: 'danger' }
}

function mapEmailVerification(user: AdminUserListItem): { label: string; variant: StatusVariant } {
  return user.email_verified
    ? { label: 'Vérifié', variant: 'success' }
    : { label: 'Non vérifié', variant: 'warning' }
}

function mapAccountAction(user: AdminUserListItem, currentUserId?: number): {
  label: string
  variant: StatusVariant
  disabled: boolean
  targetActiveState: boolean | null
} {
  if (currentUserId !== undefined && user.id === currentUserId) {
    return {
      label: 'Compte actuel',
      variant: 'neutral',
      disabled: true,
      targetActiveState: null,
    }
  }

  if (user.is_active) {
    return {
      label: 'Désactiver',
      variant: 'danger',
      disabled: false,
      targetActiveState: false,
    }
  }

  return {
    label: 'Activer',
    variant: 'success',
    disabled: false,
    targetActiveState: true,
  }
}

interface UserCardProps {
  user: AdminUserListItem
  currentUserId?: number
  onToggleStatus: (user: AdminUserListItem, targetActiveState: boolean) => void
  isSubmitting: boolean
  isSubmittingThisUser: boolean
}

function UserCard({ user, currentUserId, onToggleStatus, isSubmitting, isSubmittingThisUser }: UserCardProps) {
  const accountStatus = mapAccountStatus(user)
  const emailVerification = mapEmailVerification(user)
  const roleVariant = mapRoleToVariant(user.role)
  const accountAction = mapAccountAction(user, currentUserId)

  return (
    <Card
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-base font-semibold text-[#0F172A]">{formatUserLabel(user)}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <StatusBadge variant={accountStatus.variant} label={accountStatus.label} />
        </div>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={roleVariant} label={mapRoleToLabel(user.role)} />
          <StatusBadge variant={emailVerification.variant} label={emailVerification.label} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-slate-500">Date d'inscription</p>
            <p className="mt-1 text-[#1F2937]">{formatDateTime(user.date_joined)}</p>
          </div>
          <div>
            <p className="text-slate-500">Dernière connexion</p>
            <p className="mt-1 text-[#1F2937]">{formatDateTime(user.last_login)}</p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          {accountAction.disabled ? (
            <StatusBadge variant={accountAction.variant} label={accountAction.label} />
          ) : (
            <Button
              variant={accountAction.variant === 'danger' ? 'danger' : 'success'}
              size="sm"
              disabled={isSubmitting || isSubmittingThisUser}
              onClick={() => {
                if (accountAction.targetActiveState === null) {
                  return
                }
                onToggleStatus(user, accountAction.targetActiveState)
              }}
            >
              {isSubmittingThisUser ? 'Traitement...' : accountAction.label}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function statusBadgeForRole(role: AdminUserRoleCode | null): { label: string; variant: StatusVariant } {
  return {
    label: mapRoleToLabel(role),
    variant: mapRoleToVariant(role),
  }
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | {
        detail?: string
        message?: string
        non_field_errors?: string[]
      }
      | undefined

    if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail
    }

    if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
      return payload.message
    }

    if (Array.isArray(payload?.non_field_errors) && payload.non_field_errors.length > 0) {
      return payload.non_field_errors.join(' ')
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Une erreur est survenue. Veuillez réessayer.'
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>('all')
  const [emailVerificationFilter, setEmailVerificationFilter] = useState<EmailVerificationFilter>('all')
  const [ordering, setOrdering] = useState<AdminUserOrdering>('-date_joined')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const currentUserId = user?.id

  const usersQuery = useQuery({
    queryKey: ['admin-users', page, searchQuery, roleFilter, accountStatusFilter, emailVerificationFilter, ordering],
    queryFn: () => getAdminUsers({
      page,
      search: searchQuery.trim() || undefined,
      role: roleFilter === 'all' ? undefined : roleFilter,
      is_active: accountStatusFilter === 'all' ? undefined : accountStatusFilter === 'active',
      email_verified: emailVerificationFilter === 'all' ? undefined : emailVerificationFilter === 'verified',
      ordering,
    }),
  })

  const users = useMemo(() => usersQuery.data?.results ?? [], [usersQuery.data?.results])
  const totalUsers = usersQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE))
  const hasUsers = users.length > 0

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) => updateAdminUserStatus(userId, isActive),
    onSuccess: async (updatedUser) => {
      setActionError(null)
      setSuccessMessage(
        updatedUser.is_active ? 'Le compte a été activé avec succès.' : 'Le compte a été désactivé avec succès.',
      )
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error) => {
      setSuccessMessage(null)
      setActionError(getErrorMessage(error))
    },
  })

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput)
  }

  const handleRetry = () => {
    void usersQuery.refetch()
  }

  const handleToggleStatus = (targetUser: AdminUserListItem, targetActiveState: boolean) => {
    setActionError(null)
    setSuccessMessage(null)

    if (targetActiveState === false) {
      const confirmed = window.confirm("Désactiver ce compte ? L'utilisateur ne pourra plus se connecter.")
      if (!confirmed) {
        return
      }
    }

    void updateStatusMutation.mutateAsync({
      userId: targetUser.id,
      isActive: targetActiveState,
    })
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Utilisateurs</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Gérez les comptes utilisateurs de la plateforme.
        </p>
      </div>

      {successMessage ? (
        <Alert variant="success" title="Mise à jour réussie" message={successMessage} />
      ) : null}

      {actionError ? (
        <Alert variant="danger" title="Mise à jour impossible" message={actionError} />
      ) : null}

      <Card>
        <form className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end" onSubmit={handleSearchSubmit}>
          <Input
            type="search"
            label="Recherche"
            placeholder="E-mail, prénom ou nom"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" className="w-full lg:w-auto">
            Rechercher
          </Button>
        </form>

        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]" htmlFor="admin-user-role-filter">
              Rôle
            </label>
            <select
              id="admin-user-role-filter"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as RoleFilter)
                setPage(1)
              }}
              className="block h-12.5 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]" htmlFor="admin-user-account-filter">
              Statut
            </label>
            <select
              id="admin-user-account-filter"
              value={accountStatusFilter}
              onChange={(event) => {
                setAccountStatusFilter(event.target.value as AccountStatusFilter)
                setPage(1)
              }}
              className="block h-12.5 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            >
              {accountStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]" htmlFor="admin-user-email-filter">
              E-mail
            </label>
            <select
              id="admin-user-email-filter"
              value={emailVerificationFilter}
              onChange={(event) => {
                setEmailVerificationFilter(event.target.value as EmailVerificationFilter)
                setPage(1)
              }}
              className="block h-12.5 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            >
              {emailVerificationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]" htmlFor="admin-user-ordering">
              Tri
            </label>
            <select
              id="admin-user-ordering"
              value={ordering}
              onChange={(event) => {
                setOrdering(event.target.value as AdminUserOrdering)
                setPage(1)
              }}
              className="block h-12.5 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            >
              <option value="-date_joined">Date d'inscription la plus récente</option>
              <option value="date_joined">Date d'inscription la plus ancienne</option>
              <option value="email">E-mail A-Z</option>
              <option value="-email">E-mail Z-A</option>
              <option value="last_login">Dernière connexion la plus ancienne</option>
              <option value="-last_login">Dernière connexion la plus récente</option>
            </select>
          </div>
        </div>
      </Card>

      {usersQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des utilisateurs" />
        </div>
      ) : null}

      {usersQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={getErrorMessage(usersQuery.error)}
          className="mb-6"
        />
      ) : null}

      {!usersQuery.isLoading && !usersQuery.isError && !hasUsers ? (
        <EmptyState
          title="Aucun utilisateur"
          description="Aucun compte ne correspond aux critères sélectionnés."
          action={
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              Réessayer
            </Button>
          }
        />
      ) : null}

      {!usersQuery.isLoading && !usersQuery.isError && hasUsers ? (
        <>
          <div className="flex flex-col gap-4 lg:hidden">
            {users.map((targetUser) => {
              const isSubmittingThisUser = updateStatusMutation.isPending && updateStatusMutation.variables?.userId === targetUser.id

              return (
                <UserCard
                  key={targetUser.id}
                  user={targetUser}
                  currentUserId={currentUserId}
                  onToggleStatus={handleToggleStatus}
                  isSubmitting={updateStatusMutation.isPending}
                  isSubmittingThisUser={isSubmittingThisUser}
                />
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Utilisateur</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Rôle</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Compte</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail vérifié</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date d'inscription</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Dernière connexion</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((targetUser) => {
                  const accountStatus = mapAccountStatus(targetUser)
                  const emailVerification = mapEmailVerification(targetUser)
                  const roleBadge = statusBadgeForRole(targetUser.role)
                  const accountAction = mapAccountAction(targetUser, currentUserId)
                  const isSubmittingThisUser = updateStatusMutation.isPending && updateStatusMutation.variables?.userId === targetUser.id

                  return (
                    <tr key={targetUser.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB]">
                      <td className="px-4 py-4 text-sm text-[#1F2937]">
                        <p className="font-medium">{formatUserLabel(targetUser)}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#1F2937]">{targetUser.email}</td>
                      <td className="px-4 py-4">
                        <StatusBadge variant={roleBadge.variant} label={roleBadge.label} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge variant={accountStatus.variant} label={accountStatus.label} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge variant={emailVerification.variant} label={emailVerification.label} />
                      </td>
                      <td className="px-4 py-4 text-sm text-[#1F2937]">{formatDateTime(targetUser.date_joined)}</td>
                      <td className="px-4 py-4 text-sm text-[#1F2937]">{formatDateTime(targetUser.last_login)}</td>
                      <td className="px-4 py-4">
                        {accountAction.disabled ? (
                          <StatusBadge variant="neutral" label={accountAction.label} />
                        ) : (
                          <Button
                            variant={accountAction.variant === 'danger' ? 'danger' : 'success'}
                            size="sm"
                            disabled={updateStatusMutation.isPending || isSubmittingThisUser}
                            onClick={() => {
                              if (accountAction.targetActiveState === null) {
                                return
                              }
                              handleToggleStatus(targetUser, accountAction.targetActiveState)
                            }}
                          >
                            {isSubmittingThisUser ? 'Traitement...' : accountAction.label}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              Total: <span className="font-semibold text-[#1F2937]">{totalUsers}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!usersQuery.data?.previous || page === 1}
              >
                Précédent
              </Button>
              <span className="px-2 text-sm font-medium text-slate-700">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!usersQuery.data?.next}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
