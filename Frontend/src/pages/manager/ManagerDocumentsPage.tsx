import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getManagementDocuments } from '../../services/managementDocumentService'
import type { DocumentStatus, DocumentType, ManagerClientDocumentList } from '../../types/managementDocument'

// ── Types locaux ─────────────────────────────────────────────────────────────

type DocTypeFilter = 'all' | DocumentType
type StatusFilter = 'all' | DocumentStatus

interface ActiveFilters {
  docType: DocTypeFilter
  status: StatusFilter
}

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
      return { label: 'Expiré', variant: 'neutral' }
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

// ── Filtres frontend ──────────────────────────────────────────────────────────

function applyFilters(
  docs: ManagerClientDocumentList[],
  search: string,
  filters: ActiveFilters,
): ManagerClientDocumentList[] {
  const q = search.trim().toLowerCase()
  return docs.filter((doc) => {
    if (filters.docType !== 'all' && doc.document_type !== filters.docType) return false
    if (filters.status !== 'all' && doc.status !== filters.status) return false
    if (q) {
      const haystack = `${doc.client_first_name} ${doc.client_last_name} ${doc.client_email}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
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
      <td className="px-4 py-3 text-sm text-[#1F2937]">{mapDocTypeToLabel(doc.document_type)}</td>
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
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<ActiveFilters>({ docType: 'all', status: 'all' })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['management-documents', page],
    queryFn: () => getManagementDocuments({ page, ordering: '-uploaded_at' }),
  })

  const filtered = useMemo(
    () => applyFilters(data?.results ?? [], search, filters),
    [data?.results, search, filters],
  )

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 1

  // ── Boutons de filtre ─────────────────────────────────────────────────────

  const docTypeButtons: { value: DocTypeFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'PERMIS_CONDUIRE', label: 'Permis de conduire' },
    { value: 'CARTE_IDENTITE', label: 'Carte d\'identité' },
  ]

  const statusButtons: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'EN_ATTENTE', label: 'En attente' },
    { value: 'VALIDE', label: 'Validés' },
    { value: 'REFUSE', label: 'Refusés' },
  ]

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Documents à valider</h1>
        <p className="mt-1 text-sm text-slate-500">Vérifiez les documents transmis par les clients.</p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        {docTypeButtons.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, docType: value }))}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ${
              filters.docType === value
                ? 'bg-[#2563EB] text-white'
                : 'bg-[#F5F5F5] text-[#1F2937] hover:bg-[#E5E7EB]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {statusButtons.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, status: value }))}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ${
              filters.status === value
                ? 'bg-[#2563EB] text-white'
                : 'bg-[#F5F5F5] text-[#1F2937] hover:bg-[#E5E7EB]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <Input
        type="search"
        placeholder="Rechercher par nom, prénom ou e-mail…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* États */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" aria-label="Chargement des documents" />
        </div>
      )}

      {isError && !isLoading && (
        <Alert
          variant="danger"
          title="Erreur de chargement"
          message="Impossible de récupérer les documents. Veuillez réessayer."
        />
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          title="Aucun document à valider"
          description="Il n'y a actuellement aucun document en attente de traitement."
        />
      )}

      {/* Liste — mobile */}
      {!isLoading && !isError && filtered.length > 0 && (
        <>
          <div className="flex flex-col gap-4 lg:hidden">
            {filtered.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>

          {/* Tableau — desktop */}
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
                {filtered.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
                disabled={!data?.next}
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
