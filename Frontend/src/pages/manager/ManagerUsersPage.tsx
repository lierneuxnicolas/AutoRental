import DocumentPdfPreview from '../../components/documents/DocumentPdfPreview'
import { documentPreviewKind } from '../../utils/documentPreview'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { getManagementDocuments, getManagementDocumentFile } from '../../services/managementDocumentService'
import { getManagementUser, getManagementUsers, updateManagementUserStatus } from '../../services/managementUserService'
import type { ManagerClientDocumentList } from '../../types/managementDocument'
import type { ManagementUserDetail, ManagementUserListItem, ManagementUserRole, PaginatedManagementUserListResponse } from '../../types/managementUser'

const PAGE_SIZE = 20
const manageableRoles = new Set<ManagementUserRole>(['CLIENT', 'MECANICIEN', 'NETTOYEUR'])

function fullName(user: Pick<ManagementUserListItem, 'first_name' | 'last_name' | 'email'>): string {
  return `${user.first_name} ${user.last_name}`.trim() || user.email
}

function roleLabel(role: ManagementUserRole | null): string {
  switch (role) {
    case 'CLIENT': return 'Client'
    case 'GESTIONNAIRE_COMPTABLE': return 'Gestionnaire'
    case 'ADMINISTRATEUR': return 'Administrateur'
    case 'MECANICIEN': return 'Mécanicien'
    case 'NETTOYEUR': return 'Nettoyage'
    default: return '—'
  }
}

function roleVariant(role: ManagementUserRole | null): StatusVariant {
  switch (role) {
    case 'GESTIONNAIRE_COMPTABLE':
    case 'ADMINISTRATEUR': return 'info'
    case 'MECANICIEN': return 'warning'
    case 'CLIENT':
    case 'NETTOYEUR': return 'neutral'
    default: return 'neutral'
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date)
}

function mapDocumentType(type: ManagerClientDocumentList['document_type']): string {
  return type === 'CARTE_IDENTITE' ? 'Carte d’identité' : 'Permis de conduire'
}

function mapDocumentStatus(status: ManagerClientDocumentList['status']): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'EN_ATTENTE': return { label: 'En attente', variant: 'warning' }
    case 'VALIDE': return { label: 'Validé', variant: 'success' }
    case 'REFUSE': return { label: 'Refusé', variant: 'danger' }
    case 'EXPIRE': return { label: 'Expiré', variant: 'danger' }
  }
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown; message?: unknown } | undefined
    if (typeof data?.detail === 'string') return data.detail
    if (typeof data?.message === 'string') return data.message
  }
  return error instanceof Error ? error.message : 'Une erreur est survenue. Veuillez réessayer.'
}

async function documentPreviewError(error: unknown): Promise<string> {
  if (axios.isAxiosError(error)) {
    const response = error.response
    if (response?.data instanceof Blob && response.data.type.includes('json')) {
      try {
        const data: unknown = JSON.parse(await response.data.text())
        if (typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string') {
          return data.detail
        }
      } catch {
        // Fall back to the HTTP status when the response is not valid JSON.
      }
    }
    if (response?.status === 404) return 'Le document ou son fichier est introuvable.'
    if (response?.status === 403) return 'Vous n’avez pas l’autorisation de consulter ce document.'
    return 'Le document n’a pas pu être chargé. Veuillez réessayer.'
  }
  return errorMessage(error)
}

function canManageUser(user: ManagementUserListItem, currentUserId: number | undefined): boolean {
  return user.id !== currentUserId && user.role !== null && manageableRoles.has(user.role)
}

interface UserActionsProps {
  user: ManagementUserListItem
  currentUserId?: number
  documentsOnly: boolean
  onView: (user: ManagementUserListItem, panel: 'info' | 'documents') => void
  onToggleStatus: (user: ManagementUserListItem) => void
  isUpdating: boolean
}

function UserActions({ user, currentUserId, documentsOnly, onView, onToggleStatus, isUpdating }: UserActionsProps) {
  if (documentsOnly) {
    return <Button variant="secondary" size="sm" onClick={() => onView(user, 'documents')}>Voir documents</Button>
  }
  const canManage = canManageUser(user, currentUserId)
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => onView(user, 'info')}>Voir informations</Button>
      <Button variant="secondary" size="sm" onClick={() => onView(user, 'documents')}>Voir documents</Button>
      {canManage ? (
        <Button
          variant={user.is_active ? 'danger' : 'success'}
          size="sm"
          disabled={isUpdating}
          onClick={() => onToggleStatus(user)}
        >
          {isUpdating ? 'Traitement...' : user.is_active ? 'Désactiver' : 'Réactiver'}
        </Button>
      ) : (
        <span className="self-center text-xs text-slate-500">
          {user.id === currentUserId ? 'Compte actuel' : 'Gestion non autorisée'}
        </span>
      )}
    </div>
  )
}

function UserInfo({ user }: { user: ManagementUserDetail }) {
  const fields: Array<[string, string]> = [
    ['Prénom', user.first_name || '—'],
    ['Nom', user.last_name || '—'],
    ['E-mail', user.email],
    ['Téléphone', user.phone || '—'],
    ['Date de naissance', formatDate(user.date_of_birth)],
    ['Rôle', roleLabel(user.role)],
    ['Statut', user.is_active ? 'Actif' : 'Désactivé'],
  ]

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="mt-1 break-words font-medium text-[#1F2937]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function UserDocuments({ documents, onPreview, isPreviewing }: {
  documents: ManagerClientDocumentList[]
  onPreview: (document: ManagerClientDocumentList) => void
  isPreviewing: number | null
}) {
  if (documents.length === 0) {
    return <EmptyState title="Aucun document" description="Aucun document n’est associé à ce compte." />
  }

  return (
    <div className="space-y-3">
      {documents.map((document) => {
        const status = mapDocumentStatus(document.status)
        return (
          <div key={document.id} className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-[#1F2937]">{mapDocumentType(document.document_type)}</p>
              <p className="text-sm text-slate-600">Statut : <StatusBadge variant={status.variant} label={status.label} /></p>
              <p className="text-sm text-slate-500">Expiration : {formatDate(document.expiration_date)}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={isPreviewing !== null}
              onClick={() => onPreview(document)}
            >
              {isPreviewing === document.id ? 'Ouverture...' : 'Consulter'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}

export default function ManagerUsersPage() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<ManagementUserListItem | null>(null)
  const [activePanel, setActivePanel] = useState<'info' | 'documents' | null>(null)
  const [previewingDocumentId, setPreviewingDocumentId] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'pdf'; label: string } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)

  const usersQuery = useQuery({
    queryKey: ['manager-users', page],
    queryFn: () => getManagementUsers(page),
  })

  const selectedUserQuery = useQuery({
    queryKey: ['manager-user-detail', selectedUser?.id],
    queryFn: () => getManagementUser(selectedUser!.id),
    enabled: activePanel === 'info' && selectedUser !== null,
  })

  const documentsQuery = useQuery({
    queryKey: ['manager-user-documents', selectedUser?.id],
    queryFn: async () => {
      const documents: ManagerClientDocumentList[] = []
      let nextPage: number | null = 1
      while (nextPage !== null) {
        const response = await getManagementDocuments({ user_id: selectedUser!.id, page: nextPage })
        documents.push(...response.results)
        if (!response.next) {
          nextPage = null
        } else {
          const parsed = Number(new URL(response.next, window.location.origin).searchParams.get('page'))
          nextPage = Number.isInteger(parsed) && parsed > nextPage ? parsed : null
        }
      }
      return documents
    },
    enabled: activePanel === 'documents' && selectedUser !== null,
  })

  const statusMutation = useMutation({
    mutationFn: ({ targetUser, isActive }: { targetUser: ManagementUserListItem; isActive: boolean }) => (
      updateManagementUserStatus(targetUser.id, isActive)
    ),
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData<PaginatedManagementUserListResponse>(['manager-users', page], (current) => {
        if (!current) return current
        return {
          ...current,
          results: current.results.map((item) => item.id === updatedUser.id ? updatedUser : item),
        }
      })
      if (selectedUser?.id === updatedUser.id) setSelectedUser(updatedUser)
      setOperationError(null)
      await queryClient.invalidateQueries({ queryKey: ['manager-users'] })
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  const users = usersQuery.data?.results ?? []
  const totalPages = Math.max(1, Math.ceil((usersQuery.data?.count ?? 0) / PAGE_SIZE))

  const openPanel = (target: ManagementUserListItem, panel: 'info' | 'documents') => {
    setSelectedUser(target)
    setActivePanel(panel)
    setPreview(null)
    setPreviewError(null)
    setOperationError(null)
  }

  const closePanel = () => {
    if (previewingDocumentId !== null) return
    setActivePanel(null)
    setSelectedUser(null)
    setPreview(null)
  }

  const toggleStatus = (target: ManagementUserListItem) => {
    if (!canManageUser(target, currentUser?.id)) return
    const nextActive = !target.is_active
    if (!nextActive && !window.confirm(`Désactiver le compte de ${fullName(target)} ? Ses réservations et son historique seront conservés.`)) {
      return
    }
    setOperationError(null)
    statusMutation.mutate({ targetUser: target, isActive: nextActive })
  }

  const openDocument = async (document: ManagerClientDocumentList) => {
    setPreviewingDocumentId(document.id)
    setPreviewError(null)
    try {
      const blob = await getManagementDocumentFile(document.id)
      const kind = documentPreviewKind(blob.type)
      if (!kind) {
        setPreviewError('Ce format de document ne peut pas être affiché dans l’aperçu.')
        return
      }
      setPreview({
        url: URL.createObjectURL(blob),
        kind,
        label: mapDocumentType(document.document_type),
      })
    } catch (error) {
      setPreviewError(await documentPreviewError(error))
    } finally {
      setPreviewingDocumentId(null)
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-semibold text-[#0F172A]">Utilisateurs</h1>
      </div>

      {operationError ? <Alert variant="danger" title="Action impossible" message={operationError} /> : null}
      {usersQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des utilisateurs" />
        </div>
      ) : null}
      {usersQuery.isError ? (
        <div className="space-y-3">
          <Alert variant="danger" title="Chargement impossible" message="La liste des utilisateurs n’a pas pu être récupérée." />
          <Button variant="secondary" size="sm" onClick={() => void usersQuery.refetch()}>Réessayer</Button>
        </div>
      ) : null}
      {!usersQuery.isLoading && !usersQuery.isError ? (
        <>
          <p className="text-sm text-slate-600">
            {usersQuery.data?.count ?? 0} utilisateur{(usersQuery.data?.count ?? 0) > 1 ? 's' : ''}
          </p>
          {users.length === 0 ? (
            <EmptyState title="Aucun utilisateur" description="Aucun compte utilisateur n’est actuellement enregistré." />
          ) : (
            <>
              <div className="space-y-3 min-[1152px]:hidden">
                {users.map((item) => (
                  <Card key={item.id}>
                    <div className="space-y-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-[#0F172A]">{fullName(item)}</p>
                          <p className="break-all text-sm text-slate-500">{item.email}</p>
                        </div>
                        <StatusBadge variant={item.is_active ? 'success' : 'danger'} label={item.is_active ? 'Actif' : 'Désactivé'} />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <StatusBadge variant={roleVariant(item.role)} label={roleLabel(item.role)} />
                        <span className="text-slate-500">Inscrit le {formatDate(item.date_joined)}</span>
                      </div>
                      <UserActions
                        user={item}
                        currentUserId={currentUser?.id}
                        documentsOnly={currentUser?.role?.toUpperCase() === 'ADMINISTRATEUR'}
                        onView={openPanel}
                        onToggleStatus={toggleStatus}
                        isUpdating={statusMutation.isPending && statusMutation.variables?.targetUser.id === item.id}
                      />
                    </div>
                  </Card>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] min-[1152px]:block">
                <table className="w-full min-w-[1050px] border-collapse text-left">
                  <thead className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Nom et prénom</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Rôle</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date d’inscription</th>
                      <th className="w-[28rem] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB]">
                        <td className="max-w-48 break-words px-4 py-3 text-sm font-medium text-[#1F2937]">{fullName(item)}</td>
                        <td className="max-w-56 break-all px-4 py-3 text-sm text-[#1F2937]">{item.email}</td>
                        <td className="px-4 py-3"><StatusBadge variant={roleVariant(item.role)} label={roleLabel(item.role)} /></td>
                        <td className="px-4 py-3"><StatusBadge variant={item.is_active ? 'success' : 'danger'} label={item.is_active ? 'Actif' : 'Désactivé'} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDate(item.date_joined)}</td>
                        <td className="px-4 py-3">
                          <UserActions
                            user={item}
                            currentUserId={currentUser?.id}
                            documentsOnly={currentUser?.role?.toUpperCase() === 'ADMINISTRATEUR'}
                            onView={openPanel}
                            onToggleStatus={toggleStatus}
                            isUpdating={statusMutation.isPending && statusMutation.variables?.targetUser.id === item.id}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
                  <span className="text-sm text-slate-600">Page {page} / {totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={!usersQuery.data?.previous || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Précédent</Button>
                    <Button variant="secondary" size="sm" disabled={!usersQuery.data?.next || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Suivant</Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {selectedUser && activePanel ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manager-user-panel-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePanel()
          }}
        >
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto" header={
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="manager-user-panel-title" className="text-xl font-semibold text-[#0F172A]">
                  {activePanel === 'info' ? 'Informations utilisateur' : 'Documents utilisateur'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{fullName(selectedUser)}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={closePanel}>Fermer</Button>
            </div>
          }>
            {activePanel === 'info' ? (
              selectedUserQuery.isLoading ? <LoadingSpinner aria-label="Chargement des informations" /> : null
            ) : documentsQuery.isLoading ? <LoadingSpinner aria-label="Chargement des documents" /> : null}
            {activePanel === 'info' && selectedUserQuery.isError ? (
              <Alert variant="danger" title="Informations indisponibles" message={errorMessage(selectedUserQuery.error)} />
            ) : null}
            {activePanel === 'documents' && documentsQuery.isError ? (
              <Alert variant="danger" title="Documents indisponibles" message={errorMessage(documentsQuery.error)} />
            ) : null}
            {activePanel === 'documents' && previewError ? (
              <Alert variant="danger" title="Consultation impossible" message={previewError} />
            ) : null}
            {activePanel === 'info' && selectedUserQuery.data ? <UserInfo user={selectedUserQuery.data} /> : null}
            {activePanel === 'documents' && documentsQuery.data ? (
              <UserDocuments documents={documentsQuery.data} onPreview={(document) => void openDocument(document)} isPreviewing={previewingDocumentId} />
            ) : null}
            {preview ? (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={preview.label}>
                <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-[#0F172A]">{preview.label}</h3>
                    <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Fermer l’aperçu</Button>
                  </div>
                  {preview.kind === 'image' ? (
                    <img src={preview.url} alt={preview.label} className="max-h-[78vh] w-full object-contain" />
                  ) : (
                    <DocumentPdfPreview url={preview.url} title={preview.label} className="h-[78vh]" />
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </section>
  )
}
