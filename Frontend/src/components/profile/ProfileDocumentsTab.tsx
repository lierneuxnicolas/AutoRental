import axios from 'axios'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Alert from '../feedback/Alert'
import EmptyState from '../feedback/EmptyState'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import DocumentUpload from '../documents/DocumentUpload'
import { getClientDocuments } from '../../services/authService'
import type { ClientDocument } from '../../types/auth'

function getStatusVariant(status: ClientDocument['status']): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'VALIDE':
      return 'success'
    case 'REFUSE':
      return 'danger'
    case 'EXPIRE':
      return 'warning'
    case 'EN_ATTENTE':
    default:
      return 'warning'
  }
}

function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { detail?: string } | undefined

    if (payload?.detail && payload.detail.trim().length > 0) {
      return payload.detail
    }

    if (error.code === 'ERR_NETWORK') {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion.'
    }
  }

  return 'Les documents n’ont pas pu être récupérés.'
}

export default function ProfileDocumentsTab() {
  const documentsQuery = useQuery({
    queryKey: ['client-documents'],
    queryFn: getClientDocuments,
  })

  const documents = useMemo(() => documentsQuery.data?.results ?? [], [documentsQuery.data])
  const identityDocument = useMemo(() => documents.find((document) => document.document_type === 'CARTE_IDENTITE'), [documents])
  const drivingLicenseDocument = useMemo(() => documents.find((document) => document.document_type === 'PERMIS_CONDUIRE'), [documents])

  if (documentsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center py-8">
        <LoadingSpinner size="lg" aria-label="Chargement des documents" />
      </div>
    )
  }

  return (
    <div>
      {documentsQuery.error ? (
        <Alert variant="danger" title="Chargement impossible" message={extractApiErrorMessage(documentsQuery.error)} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card header={<div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#1F2937]">Carte d’identité</h2><StatusBadge variant={getStatusVariant(identityDocument?.status ?? 'EN_ATTENTE')} label={identityDocument ? 'En ligne' : 'À fournir'} /></div>}>
          <DocumentUpload documentType="CARTE_IDENTITE" existingDocument={identityDocument} />
        </Card>

        <Card header={<div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#1F2937]">Permis de conduire</h2><StatusBadge variant={getStatusVariant(drivingLicenseDocument?.status ?? 'EN_ATTENTE')} label={drivingLicenseDocument ? 'En ligne' : 'À fournir'} /></div>}>
          <DocumentUpload documentType="PERMIS_CONDUIRE" existingDocument={drivingLicenseDocument} />
        </Card>
      </div>

      {documents.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Aucun document transmis" description="Ajoutez votre carte d’identité et votre permis de conduire pour finaliser votre profil." />
        </div>
      ) : null}
    </div>
  )
}