import axios from 'axios'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/ui/StatusBadge'
import DocumentUpload from '../../components/documents/DocumentUpload'
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

export default function ClientDocumentsPage() {
  const documentsQuery = useQuery({
    queryKey: ['client-documents'],
    queryFn: getClientDocuments,
  })

  const documents = useMemo(() => documentsQuery.data?.results ?? [], [documentsQuery.data])
  const identityDocument = useMemo(() => documents.find((document) => document.document_type === 'CARTE_IDENTITE'), [documents])
  const drivingLicenseDocument = useMemo(() => documents.find((document) => document.document_type === 'PERMIS_CONDUIRE'), [documents])

  if (documentsQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement des documents" />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mes documents</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Documents d’identification</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Déposez et gérez vos documents nécessaires à la validation de votre profil.
        </p>
      </div>

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
    </section>
  )
}
