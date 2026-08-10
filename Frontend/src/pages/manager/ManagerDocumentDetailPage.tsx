import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  getManagementDocumentById,
  rejectManagementDocument,
  validateManagementDocument,
} from '../../services/managementDocumentService'
import type {
  DocumentStatus,
  DocumentType,
  ManagerClientDocumentDetail,
} from '../../types/managementDocument'

interface ErrorPayload {
  detail?: string
  message?: string
  reason?: string[]
}

function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data as ErrorPayload | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  if (Array.isArray(payload?.reason) && payload.reason.length > 0) {
    return payload.reason.join(' ')
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
}

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

function formatDate(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function mapStatus(status: DocumentStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'EN_ATTENTE':
      return { label: 'En attente', variant: 'warning' }
    case 'VALIDE':
      return { label: 'Valide', variant: 'success' }
    case 'REFUSE':
      return { label: 'Refuse', variant: 'danger' }
    case 'EXPIRE':
      return { label: 'Expire', variant: 'neutral' }
  }
}

function mapDocumentType(type: DocumentType): string {
  switch (type) {
    case 'CARTE_IDENTITE':
      return 'Carte d\'identite'
    case 'PERMIS_CONDUIRE':
      return 'Permis de conduire'
  }
}

function canManageDocument(status: DocumentStatus): boolean {
  return status === 'EN_ATTENTE'
}

type PreviewKind = 'image' | 'pdf' | 'none'

function detectPreviewKind(fileUrl: string | null): PreviewKind {
  if (!fileUrl) {
    return 'none'
  }

  const normalized = fileUrl.toLowerCase()

  if (
    normalized.endsWith('.png')
    || normalized.endsWith('.jpg')
    || normalized.endsWith('.jpeg')
    || normalized.endsWith('.webp')
    || normalized.endsWith('.gif')
  ) {
    return 'image'
  }

  if (normalized.endsWith('.pdf')) {
    return 'pdf'
  }

  return 'none'
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-[#1F2937]">{value}</p>
    </div>
  )
}

function DocumentPreview({ document }: { document: ManagerClientDocumentDetail }) {
  const previewKind = useMemo(() => detectPreviewKind(document.file), [document.file])

  if (!document.file) {
    return (
      <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Document</h2>}>
        <Alert
          variant="info"
          title="Apercu indisponible"
          message="Aucun fichier n'a ete retourne par l'API pour ce document."
        />
      </Card>
    )
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#1F2937]">Document</h2>
          <a
            href={document.file}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#2563EB] hover:underline"
          >
            Ouvrir le document
          </a>
        </div>
      }
    >
      {previewKind === 'image' ? (
        <img
          src={document.file}
          alt={`Document ${document.document_type.toLowerCase()}`}
          className="max-h-[70vh] w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] object-contain"
          loading="lazy"
        />
      ) : null}

      {previewKind === 'pdf' ? (
        <iframe
          src={document.file}
          title="Apercu du document"
          className="h-[70vh] w-full rounded-2xl border border-[#E5E7EB]"
        />
      ) : null}

      {previewKind === 'none' ? (
        <Alert
          variant="info"
          title="Apercu non supporte"
          message="Le format du fichier ne permet pas un apercu integre. Utilisez le lien pour ouvrir le document."
        />
      ) : null}
    </Card>
  )
}

export default function ManagerDocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showRejectBlock, setShowRejectBlock] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectReasonError, setRejectReasonError] = useState<string | null>(null)

  const documentId = Number(id)
  const isValidDocumentId = Number.isInteger(documentId) && documentId > 0

  const detailQuery = useQuery({
    queryKey: ['management-document-detail', documentId],
    queryFn: () => getManagementDocumentById(documentId),
    enabled: isValidDocumentId,
  })

  const validateMutation = useMutation({
    mutationFn: () => validateManagementDocument(documentId),
    onSuccess: async () => {
      setActionError(null)
      setSuccessMessage('Le document a ete valide avec succes.')
      setShowRejectBlock(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['management-document-detail', documentId] }),
        queryClient.invalidateQueries({ queryKey: ['management-documents'] }),
      ])
    },
    onError: (error) => {
      setSuccessMessage(null)
      setActionError(toErrorMessage(error))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => rejectManagementDocument(documentId, { reason: rejectReason.trim() }),
    onSuccess: async () => {
      setActionError(null)
      setRejectReasonError(null)
      setSuccessMessage('Le document a ete refuse avec succes.')
      setShowRejectBlock(false)
      setRejectReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['management-document-detail', documentId] }),
        queryClient.invalidateQueries({ queryKey: ['management-documents'] }),
      ])
    },
    onError: (error) => {
      setSuccessMessage(null)
      setActionError(toErrorMessage(error))
    },
  })

  if (!isValidDocumentId) {
    return (
      <section className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Document invalide"
          message="L'identifiant de document est invalide."
        />
        <Link to="/manager/documents" className="inline-flex">
          <Button variant="secondary">Retour a la liste</Button>
        </Link>
      </section>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du document" />
      </section>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <section className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={toErrorMessage(detailQuery.error)}
        />
        <div className="flex flex-wrap gap-2">
          <Link to="/manager/documents">
            <Button variant="secondary">Retour a la liste</Button>
          </Link>
          <Button variant="secondary" onClick={() => void detailQuery.refetch()}>
            Reessayer
          </Button>
        </div>
      </section>
    )
  }

  const document = detailQuery.data
  const status = mapStatus(document.status)
  const canAct = canManageDocument(document.status)
  const isPendingAction = validateMutation.isPending || rejectMutation.isPending

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Documents clients</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Detail d'un document</h1>
        </div>
        <Link to="/manager/documents">
          <Button variant="secondary">Retour a la liste</Button>
        </Link>
      </div>

      {successMessage ? <Alert variant="success" title="Operation reussie" message={successMessage} /> : null}
      {actionError ? <Alert variant="danger" title="Operation impossible" message={actionError} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <DocumentPreview document={document} />
        </div>

        <div className="space-y-6">
          <Card
            header={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#1F2937]">Informations</h2>
                <StatusBadge variant={status.variant} label={status.label} />
              </div>
            }
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#1F2937]">Client</p>
                <DetailField label="Prenom" value={document.client_first_name || '—'} />
                <DetailField label="Nom" value={document.client_last_name || '—'} />
                <DetailField label="E-mail" value={document.client_email || '—'} />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#1F2937]">Document</p>
                <DetailField label="Type" value={mapDocumentType(document.document_type)} />
                <DetailField label="Statut" value={status.label} />
                <DetailField label="Numero" value={document.document_number || '—'} />
                <DetailField label="Date d'envoi" value={formatDateTime(document.uploaded_at)} />
                <DetailField label="Date d'expiration" value={formatDate(document.expiration_date)} />
                <DetailField label="Date de validation/refus" value={formatDateTime(document.validated_at)} />
                <DetailField
                  label="Motif de refus"
                  value={document.rejection_reason && document.rejection_reason.trim().length > 0 ? document.rejection_reason : '—'}
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#1F2937]">Metadonnees</p>
                <DetailField label="ID document" value={String(document.id)} />
                <DetailField label="ID client" value={String(document.client)} />
                <DetailField label="Valide par (id)" value={document.validated_by ? String(document.validated_by) : '—'} />
                <DetailField label="Valide par (email)" value={document.validated_by_email || '—'} />
                <DetailField label="Actif" value={document.is_active ? 'Oui' : 'Non'} />
                <DetailField label="Cree le" value={formatDateTime(document.created_at)} />
                <DetailField label="Mis a jour le" value={formatDateTime(document.updated_at)} />
              </div>
            </div>
          </Card>

          <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Actions</h2>}>
            {canAct ? (
              <div className="space-y-4">
                <Button
                  className="w-full"
                  variant="success"
                  disabled={isPendingAction}
                  onClick={() => {
                    setActionError(null)
                    setSuccessMessage(null)

                    const confirmed = window.confirm('Confirmer la validation de ce document ?')

                    if (!confirmed) {
                      return
                    }

                    void validateMutation.mutateAsync()
                  }}
                >
                  {validateMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" aria-label="Validation en cours" />
                      Validation en cours...
                    </span>
                  ) : (
                    'Valider le document'
                  )}
                </Button>

                {!showRejectBlock ? (
                  <Button
                    className="w-full"
                    variant="danger"
                    disabled={isPendingAction}
                    onClick={() => {
                      setActionError(null)
                      setSuccessMessage(null)
                      setShowRejectBlock(true)
                    }}
                  >
                    Refuser le document
                  </Button>
                ) : null}

                {showRejectBlock ? (
                  <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                    <label htmlFor="reject-reason" className="block text-sm font-medium text-[#1F2937]">
                      Motif de refus<span className="ml-1 text-[#EF4444]">*</span>
                    </label>
                    <textarea
                      id="reject-reason"
                      rows={4}
                      className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                      placeholder="Decrivez le motif de refus"
                      value={rejectReason}
                      onChange={(event) => {
                        setRejectReason(event.target.value)
                        if (rejectReasonError) {
                          setRejectReasonError(null)
                        }
                      }}
                    />
                    {rejectReasonError ? <p className="text-sm text-[#EF4444]">{rejectReasonError}</p> : null}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="danger"
                        className="w-full"
                        disabled={isPendingAction}
                        onClick={() => {
                          setActionError(null)
                          setSuccessMessage(null)

                          if (!rejectReason.trim()) {
                            setRejectReasonError('Le motif de refus est obligatoire.')
                            return
                          }

                          setRejectReasonError(null)
                          void rejectMutation.mutateAsync()
                        }}
                      >
                        {rejectMutation.isPending ? (
                          <span className="flex items-center gap-2">
                            <LoadingSpinner size="sm" aria-label="Refus en cours" />
                            Refus en cours...
                          </span>
                        ) : (
                          'Confirmer le refus'
                        )}
                      </Button>

                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={isPendingAction}
                        onClick={() => {
                          setShowRejectBlock(false)
                          setRejectReason('')
                          setRejectReasonError(null)
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Alert
                variant="info"
                title="Aucune action disponible"
                message="Ce document est dans un etat final ou non modifiable. Les actions de validation et de refus ne sont plus disponibles."
              />
            )}
          </Card>
        </div>
      </div>
    </section>
  )
}