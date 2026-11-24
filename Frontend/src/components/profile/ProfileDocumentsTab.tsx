import { useTranslation } from 'react-i18next'
import { clientDisplay, clientLocale } from '../../i18n/clientDisplay'
import axios from 'axios'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Card from '../ui/Card'
import StatusBadge, { type StatusVariant } from '../ui/StatusBadge'
import Button from '../ui/Button'
import DocumentUpload from '../documents/DocumentUpload'
import SecureDocumentPreview from '../documents/SecureDocumentPreview'
import { getClientDocumentFile, getClientDocuments } from '../../services/authService'
import type { ClientDocument, ClientDocumentStatus } from '../../types/auth'

function getStatusDetails(status: ClientDocumentStatus | null): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'VALIDE':
      return { label: 'Validé', variant: 'success' }
    case 'REFUSE':
      return { label: 'Refusé', variant: 'danger' }
    case 'EXPIRE':
      return { label: 'Expiré', variant: 'danger' }
    case 'EN_ATTENTE':
      return { label: 'En attente', variant: 'warning' }
    default:
      return { label: 'À fournir', variant: 'neutral' }
  }
}

function formatTransmission(value: ClientDocument['driving_license_transmission'] | undefined): string | null {
  if (value === 'MANUAL_AND_AUTOMATIC') {
    return 'Manuel'
  }
  if (value === 'AUTOMATIC_ONLY') {
    return 'Automatique'
  }
  return null
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10)
  }
  return parsed.toLocaleDateString(clientLocale())
}

function formatUploadDate(value: string | undefined): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? formatDate(value)
    : parsed.toLocaleDateString(clientLocale())
}

function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { detail?: string } | undefined
    if (payload?.detail?.trim()) {
      return payload.detail
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion.'
    }
  }
  return 'Les documents n’ont pas pu être récupérés.'
}

function ClientDocumentCard({
  document,
  documentType,
  title,
}: {
  document: ClientDocument | undefined
  documentType: ClientDocument['document_type']
  title: string
}) {
  const { t } = useTranslation()
  const status = getStatusDetails(document?.status ?? null)
  const transmissionLabel = documentType === 'PERMIS_CONDUIRE' && document?.status === 'VALIDE'
    ? formatTransmission(document.driving_license_transmission)
    : null
  const displayTitle = transmissionLabel ? `${clientDisplay(t, title)} — ${clientDisplay(t, transmissionLabel)}` : clientDisplay(t, title)
  return (
    <Card
      className="h-full border border-slate-100"
      contentClassName="flex flex-1 flex-col"
      header={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#1F2937]">{displayTitle}</h2>
          <StatusBadge variant={status.variant} label={clientDisplay(t, status.label)} />
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="min-w-0 sm:col-span-2">
            <dt className="font-medium text-slate-500">{t('client.numero_du_document')}</dt>
            <dd className="mt-1 text-[#1F2937]">{document?.document_number || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-medium text-slate-500">{t('client.date_dexpiration')}</dt>
            <dd className="mt-1 text-[#1F2937]">{formatDate(document?.expiration_date)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-medium text-slate-500">{t('client.date_denvoi')}</dt>
            <dd className="mt-1 text-[#1F2937]">{formatUploadDate(document?.uploaded_at)}</dd>
          </div>
          {document?.status === 'REFUSE' && document.rejection_reason ? (
            <div className="sm:col-span-2">
              <dt className="font-medium text-slate-500">{t('client.motif_du_refus')}</dt>
              <dd className="mt-1 text-red-700">{document.rejection_reason}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-auto grid grid-cols-2 items-stretch gap-2">
          {document?.file ? (
            <SecureDocumentPreview
              documentId={document.id}
              title={title}
              fetchFile={getClientDocumentFile}
            />
          ) : (
            <button
              type="button"
              disabled
              className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-medium text-slate-400"
            >
              {t('client.document_indisponible')}
            </button>
          )}
          <DocumentUpload documentType={documentType} existingDocument={document} />
        </div>
      </div>
    </Card>
  )
}

export default function ProfileDocumentsTab() {
  const { t } = useTranslation()
  const documentsQuery = useQuery({
    queryKey: ['client-documents'],
    queryFn: getClientDocuments,
  })

  const documents = useMemo(
    () => (documentsQuery.data?.results ?? []).filter((document) => document.is_active),
    [documentsQuery.data],
  )
  const identityDocument = documents.find((document) => document.document_type === 'CARTE_IDENTITE')
  const drivingLicenseDocument = documents.find((document) => document.document_type === 'PERMIS_CONDUIRE')

  if (documentsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center py-8">
        <LoadingSpinner size="lg" aria-label={t('client.chargement_des_documents')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {documentsQuery.error ? (
        <div className="space-y-3">
          <Alert variant="danger" title={t('client.chargement_impossible')} message={clientDisplay(t, extractApiErrorMessage(documentsQuery.error))} />
          <Button
            variant="secondary"
            disabled={documentsQuery.isFetching}
            onClick={() => void documentsQuery.refetch()}
          >
            {documentsQuery.isFetching ? 'Chargement...' : 'Réessayer'}
          </Button>
        </div>
      ) : null}

      {(!documentsQuery.isError || documentsQuery.data) ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <ClientDocumentCard
            document={identityDocument}
            documentType="CARTE_IDENTITE"
            title={t('client.carte_didentite')}
          />
          <ClientDocumentCard
            document={drivingLicenseDocument}
            documentType="PERMIS_CONDUIRE"
            title={t('client.permis_de_conduire')}
          />
        </div>
      ) : null}
    </div>
  )
}
