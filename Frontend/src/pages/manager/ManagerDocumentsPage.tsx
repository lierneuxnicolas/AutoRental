import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getManagementDocuments } from '../../services/managementDocumentService'
import type { DocumentStatus, DocumentType, ManagerClientDocumentList } from '../../types/managementDocument'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatusToUi(status: DocumentStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'EN_ATTENTE':
      return { label: 'En attente', variant: 'warning' }
    case 'VALIDE':
      return { label: 'Validé', variant: 'success' }
    case 'REFUSE':
      return { label: 'Refusé', variant: 'danger' }
    case 'EXPIRE':
      return { label: 'Expiré', variant: 'danger' }
  }
}

function mapDocTypeToLabel(type: DocumentType): string {
  switch (type) {
    case 'CARTE_IDENTITE':
      return 'Carte d\'identité'
    case 'PERMIS_CONDUIRE':
      return 'Permis de conduire'
  }
}

function mapTransmissionToLabel(
  doc: Pick<ManagerClientDocumentList, 'document_type' | 'status' | 'driving_license_transmission'>,
): string | null {
  if (doc.document_type !== 'PERMIS_CONDUIRE' || doc.status !== 'VALIDE') {
    return null
  }
  if (doc.driving_license_transmission === 'MANUAL_AND_AUTOMATIC') {
    return 'Manuel'
  }
  if (doc.driving_license_transmission === 'AUTOMATIC_ONLY') {
    return 'Automatique'
  }
  return null
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function sortDocuments(docs: ManagerClientDocumentList[]): ManagerClientDocumentList[] {
  return [...docs].sort((a, b) => {
    const pendingOrder = Number(b.status === 'EN_ATTENTE') - Number(a.status === 'EN_ATTENTE')
    return pendingOrder || Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at)
  })
}

// ── Composant document card (mobile) ─────────────────────────────────────────

function DocumentCard({ doc }: { doc: ManagerClientDocumentList }) {
  const { label, variant } = mapStatusToUi(doc.status)
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-[#1F2937]">
              {doc.client_first_name} {doc.client_last_name}
            </p>
            <p className="text-sm text-slate-500">{doc.client_email}</p>
          </div>
          <StatusBadge variant={variant} label={label} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm text-[#1F2937]">
          <div>
            <span className="text-slate-500">Type : </span>
            {mapDocTypeToLabel(doc.document_type)}
            {mapTransmissionToLabel(doc) ? <span className="block text-xs text-slate-500">{mapTransmissionToLabel(doc)}</span> : null}
                      </div>
                      <div>
            <span className="text-slate-500">Envoyé le : </span>
            {formatDateTime(doc.uploaded_at)}
          </div>
          {doc.expiration_date ? (
            <div className="col-span-2">
              <span className="text-slate-500">Expiration : </span>
              {formatDate(doc.expiration_date)}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Link to={`/manager/documents/${doc.id}`}>
            <Button variant="secondary" size="sm">
              Voir le détail
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}

// ── Ligne de tableau (desktop) ────────────────────────────────────────────────

function DocumentRow({ doc }: { doc: ManagerClientDocumentList }) {
  const { label, variant } = mapStatusToUi(doc.status)
  return (
    <tr className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB]">
      <td className="px-4 py-3 text-sm text-[#1F2937]">
        <p className="font-medium">{doc.client_first_name} {doc.client_last_name}</p>
        <p className="text-slate-500">{doc.client_email}</p>
      </td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">
        {mapDocTypeToLabel(doc.document_type)}
        {mapTransmissionToLabel(doc) ? <p className="text-xs text-slate-500">{mapTransmissionToLabel(doc)}</p> : null}
      </td>
      <td className="px-4 py-3">
        <StatusBadge variant={variant} label={label} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{formatDateTime(doc.uploaded_at)}</td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {doc.expiration_date ? formatDate(doc.expiration_date) : '—'}
      </td>
      <td className="px-4 py-3">
        <Link to={`/manager/documents/${doc.id}`}>
          <Button variant="secondary" size="sm">
            Voir le détail
          </Button>
        </Link>
      </td>
    </tr>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export default function ManagerDocumentsPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['management-documents'],
    queryFn: async () => {
      let response = await getManagementDocuments({ page: 1, ordering: '-uploaded_at' })
      const results = [...response.results]
      let nextPage = 2

      while (response.next) {
        response = await getManagementDocuments({ page: nextPage, ordering: '-uploaded_at' })
        results.push(...response.results)
        nextPage += 1
      }

      return { count: results.length, results }
    },
  })

  const sortedDocuments = useMemo(
    () => sortDocuments(data?.results ?? []),
    [data?.results],
  )

  const totalPages = Math.ceil(sortedDocuments.length / PAGE_SIZE)
  const paginatedDocuments = sortedDocuments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Documents à valider</h1>
      </div>

      {/* États */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" aria-label="Chargement des documents" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="space-y-3">
          <Alert
            variant="danger"
            title="Erreur de chargement"
            message="Impossible de récupérer les documents. Veuillez réessayer."
          />
          <Button
            variant="secondary"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? 'Chargement...' : 'Réessayer'}
          </Button>
        </div>
      )}

      {!isLoading && !isError && sortedDocuments.length === 0 && (
        <EmptyState
          title="Aucun document"
          description="Aucun document n’a été transmis."
        />
      )}

      {!isLoading && !isError && sortedDocuments.length > 0 && (
        <>
          <div className="flex flex-col gap-4 lg:hidden">
            {paginatedDocuments.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F5]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Client</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Envoyé le</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Expiration</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDocuments.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <span className="text-sm text-slate-500">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
