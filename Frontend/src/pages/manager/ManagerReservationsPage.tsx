import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getInvoiceDownload } from '../../services/invoiceService'
import { cancelManagementReservation, getManagementReservations } from '../../services/managementReservationService'
import type {
  ManagementReservationListQueryParams,
  ManagementReservationStatus,
  ReservationCancellationSource,
  ReservationManagementDetail,
} from '../../types/managementReservation'
import { resolveMediaUrl } from '../../utils/media'

interface ManagerReservationsPageProps {
  basePath?: string
}

type ReservationFilter =
  | ''
  | 'BROUILLON'
  | 'CONFIRMEE'
  | 'REAFFECTATION_REQUIRED'
  | 'EN_COURS'
  | 'A_CONTROLER'
  | 'TERMINEE'
  | 'NON_UTILISEE'
  | 'ANNULEE_CLIENT'
  | 'ANNULEE_GESTIONNAIRE'

const statusFilters: Array<{ value: ReservationFilter; label: string }> = [
  { value: '', label: 'Tous les statuts' },
  { value: 'BROUILLON', label: 'Brouillon' },
  { value: 'CONFIRMEE', label: 'Confirmée' },
  { value: 'REAFFECTATION_REQUIRED', label: 'À réaffecter' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'A_CONTROLER', label: 'À contrôler' },
  { value: 'TERMINEE', label: 'Terminée' },
  { value: 'NON_UTILISEE', label: 'Non utilisée' },
  { value: 'ANNULEE_CLIENT', label: 'Annulée par le client' },
  { value: 'ANNULEE_GESTIONNAIRE', label: 'Annulée par le gestionnaire' },
]

interface ReservationFilters {
  search: string
  status: ReservationFilter
  startDate: string
  endDate: string
  vehicleSearch: string
}

const emptyFilters: ReservationFilters = {
  search: '',
  status: '',
  startDate: '',
  endDate: '',
  vehicleSearch: '',
}

function mapStatusToUi(
  status: ManagementReservationStatus,
  cancellationSource: ReservationCancellationSource | null,
): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'BROUILLON':
      return { label: 'Brouillon', variant: 'neutral' }
    case 'EN_ATTENTE_CAUTION':
      return { label: 'En attente caution', variant: 'warning' }
    case 'EN_ATTENTE_PAIEMENT':
      return { label: 'En attente paiement', variant: 'warning' }
    case 'CONFIRMEE':
      return { label: 'Confirmée', variant: 'success' }
    case 'REAFFECTATION_REQUIRED':
      return { label: 'À réaffecter', variant: 'warning' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'À contrôler', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminée', variant: 'success' }
    case 'NON_UTILISEE':
      return { label: 'Non utilisée', variant: 'neutral' }
    case 'ANNULEE':
      if (cancellationSource === 'CLIENT') return { label: 'Annulée par le client', variant: 'danger' }
      if (cancellationSource === 'GESTIONNAIRE') return { label: 'Annulée par le gestionnaire', variant: 'danger' }
      return { label: 'Annulée', variant: 'danger' }
    case 'PAIEMENT_ECHOUE':
      return { label: 'Paiement échoué', variant: 'danger' }
  }
}

const actionButtonClassName = 'shrink-0 whitespace-nowrap px-2.5! text-[13px]!'
const cancelButtonClassName = `${actionButtonClassName} gap-1.5! border border-red-200 bg-red-50! text-red-700! hover:bg-red-100! focus-visible:ring-red-400!`

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value)).replace(',', '')
}

function formatAmount(value: string): string {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
    : `${value} EUR`
}

function clientLabel(reservation: ReservationManagementDetail): string | null {
  if (!reservation.client_summary) {
    return null
  }

  const fullName = `${reservation.client_summary.last_name} ${reservation.client_summary.first_name}`.trim()

  if (fullName.length > 0) {
    return fullName
  }

  return reservation.client_summary.email || null
}

function VehiclePhoto({ reservation, mobile = false }: { reservation: ReservationManagementDetail; mobile?: boolean }) {
  const photoUrl = resolveMediaUrl(reservation.vehicle.main_photo?.file)
  const sizeClass = mobile ? 'h-20 w-28' : 'h-10 w-14'

  if (!photoUrl) {
    return (
      <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-xs text-slate-500`}>
        Sans photo
      </div>
    )
  }

  return (
    <img
      src={photoUrl}
      alt={`${reservation.vehicle.brand} ${reservation.vehicle.model_name}`}
      className={`${sizeClass} shrink-0 rounded-xl border border-slate-200 object-cover`}
      loading="lazy"
    />
  )
}

function Period({ reservation }: { reservation: ReservationManagementDetail }) {
  return (
    <div className="text-sm leading-5 text-[#1F2937]">
      <p className="whitespace-nowrap">{formatDateTime(reservation.start_at)}</p>
      <p className="whitespace-nowrap"><span className="text-slate-400">→</span> {formatDateTime(reservation.end_at)}</p>
    </div>
  )
}

export default function ManagerReservationsPage({ basePath = '/manager' }: ManagerReservationsPageProps) {
  const queryClient = useQueryClient()
  const [draftFilters, setDraftFilters] = useState<ReservationFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<ReservationFilters>(emptyFilters)
  const [page, setPage] = useState(1)
  const [downloadingInvoiceForId, setDownloadingInvoiceForId] = useState<number | null>(null)
  const [invoiceDownloadError, setInvoiceDownloadError] = useState<string | null>(null)
  const [reservationToCancel, setReservationToCancel] = useState<ReservationManagementDetail | null>(null)
  const [cancellationError, setCancellationError] = useState<string | null>(null)

  const queryParams = useMemo<ManagementReservationListQueryParams>(() => ({
    page,
    search: appliedFilters.search.trim() || undefined,
    status: appliedFilters.status.startsWith('ANNULEE_') ? 'ANNULEE' : appliedFilters.status || undefined,
    cancellation_source: appliedFilters.status === 'ANNULEE_CLIENT'
      ? 'CLIENT'
      : appliedFilters.status === 'ANNULEE_GESTIONNAIRE' ? 'GESTIONNAIRE' : undefined,
    start_at_from: appliedFilters.startDate ? `${appliedFilters.startDate}T00:00:00` : undefined,
    end_at_to: appliedFilters.endDate ? `${appliedFilters.endDate}T23:59:59` : undefined,
    vehicle_search: appliedFilters.vehicleSearch.trim() || undefined,
    ordering: '-created_at',
  }), [appliedFilters, page])

  const reservationsQuery = useQuery({
    queryKey: ['manager-reservations', queryParams],
    queryFn: () => getManagementReservations(queryParams),
  })

  const cancellationMutation = useMutation({
    mutationFn: (reservationId: number) => cancelManagementReservation(reservationId),
    onSuccess: async () => {
      setReservationToCancel(null)
      await queryClient.invalidateQueries({ queryKey: ['manager-reservations'] })
    },
    onError: () => {
      setCancellationError('La réservation n’a pas pu être annulée. Actualisez la liste puis réessayez.')
    },
  })

  const reservations = useMemo(
    () => reservationsQuery.data?.results ?? [],
    [reservationsQuery.data?.results],
  )

  const totalPages = Math.max(1, Math.ceil((reservationsQuery.data?.count ?? 0) / 20))
  const hasAppliedFilters = Object.values(appliedFilters).some((value) => Boolean(value.trim()))

  const updateDraftFilter = <Key extends keyof ReservationFilters>(key: Key, value: ReservationFilters[Key]) => {
    setDraftFilters((current) => ({ ...current, [key]: value }))
  }

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setAppliedFilters(draftFilters)
  }

  const handleReset = () => {
    setDraftFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setPage(1)
  }

  const handleInvoiceDownload = async (reservation: ReservationManagementDetail) => {
    if (!reservation.invoice_id || downloadingInvoiceForId !== null) return

    setInvoiceDownloadError(null)
    setDownloadingInvoiceForId(reservation.id)
    try {
      const pdfBlob = await getInvoiceDownload(reservation.invoice_id)
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `GetaCar_Facture_${reservation.reference}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch {
      setInvoiceDownloadError(`La facture de la réservation ${reservation.reference} n’est pas disponible au téléchargement.`)
    } finally {
      setDownloadingInvoiceForId(null)
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-semibold text-[#0F172A]">Gestion des réservations</h1>
      </div>

      <Card className="rounded-2xl [&>div]:px-4 [&>div]:py-3 sm:[&>div]:px-5">
        <form onSubmit={handleFilterSubmit} className="space-y-2.5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <Input
              type="search"
              label="Recherche"
              placeholder="Référence, client, véhicule ou immatriculation"
              value={draftFilters.search}
              onChange={(event) => updateDraftFilter('search', event.target.value)}
              className="h-10 rounded-xl px-3 py-2 text-sm"
            />
            <div className="space-y-1.5">
              <label htmlFor="reservation-status-filter" className="block text-sm font-medium text-[#1F2937]">Statut</label>
              <select
                id="reservation-status-filter"
                value={draftFilters.status}
                onChange={(event) => updateDraftFilter('status', event.target.value as ReservationFilter)}
                className="block h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#1F2937] shadow-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              >
                {statusFilters.map((filter) => <option key={filter.value || 'all'} value={filter.value}>{filter.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Input type="date" label="Date début" className="h-10 rounded-xl px-3 py-2 text-sm" value={draftFilters.startDate} onChange={(event) => updateDraftFilter('startDate', event.target.value)} />
            <Input type="date" label="Date fin" className="h-10 rounded-xl px-3 py-2 text-sm" value={draftFilters.endDate} onChange={(event) => updateDraftFilter('endDate', event.target.value)} />
            <Input
              type="search"
              label="Véhicule / immatriculation"
              placeholder="Renault Rafale ou GAC-RAF-001"
              value={draftFilters.vehicleSearch}
              onChange={(event) => updateDraftFilter('vehicleSearch', event.target.value)}
              className="h-10 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleReset}>Réinitialiser</Button>
            <Button type="submit" size="sm">Rechercher</Button>
          </div>
        </form>
      </Card>

      {reservationsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des reservations" />
        </div>
      ) : null}

      {reservationsQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les reservations n'ont pas pu etre recuperees. Veuillez reessayer."
        />
      ) : null}

      {invoiceDownloadError ? (
        <Alert variant="danger" title="Téléchargement impossible" message={invoiceDownloadError} />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? (
        <EmptyState
          title={hasAppliedFilters ? 'Aucune réservation correspondante' : 'Aucune réservation'}
          description={hasAppliedFilters ? 'Aucune réservation ne correspond aux filtres appliqués.' : 'Il n’y a actuellement aucune réservation à afficher.'}
        />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length > 0 ? (
        <p className="text-sm text-slate-600">
          {reservationsQuery.data?.count ?? 0} résultat{(reservationsQuery.data?.count ?? 0) > 1 ? 's' : ''}
        </p>
      ) : null}

      {!reservationsQuery.isLoading
      && !reservationsQuery.isError
      && reservations.length > 0 ? (
        <>
          <div className="space-y-4 lg:hidden">
            {reservations.map((reservation) => {
              const status = mapStatusToUi(reservation.status, reservation.cancellation_source)
              const canCancel = reservation.status === 'CONFIRMEE'
              return (
                <Card key={reservation.id}>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <VehiclePhoto reservation={reservation} mobile />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#0F172A]">{reservation.reference}</p>
                        <p className="mt-1 text-sm font-medium text-[#1F2937]">{reservation.vehicle.brand} {reservation.vehicle.model_name}</p>
                        <p className="text-xs text-slate-500">{reservation.vehicle.registration_plate || '—'}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge variant={status.variant} label={status.label} />
                          {reservation.needs_review ? <StatusBadge variant="warning" label="À vérifier" /> : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Client</p>
                        <p className="mt-1 font-medium text-[#1F2937]">{clientLabel(reservation) ?? '—'}</p>
                        {reservation.client_summary?.email ? <p className="break-all text-xs text-slate-500">{reservation.client_summary.email}</p> : null}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Période</p>
                        <div className="mt-1"><Period reservation={reservation} /></div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Montant</p>
                        <p className="mt-1 font-semibold text-[#1F2937]">{formatAmount(reservation.rental_amount)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Link to={`${basePath}/reservations/${reservation.id}`}>
                        <Button variant="secondary" size="sm">Voir détail</Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!reservation.invoice_id || downloadingInvoiceForId !== null}
                        title={reservation.invoice_id ? undefined : 'Aucune facture disponible'}
                        onClick={() => void handleInvoiceDownload(reservation)}
                      >
                        {downloadingInvoiceForId === reservation.id ? 'Téléchargement...' : 'Télécharger facture'}
                      </Button>
                      {reservation.status === 'REAFFECTATION_REQUIRED' ? (
                        <Link to={`${basePath}/reservations/${reservation.id}?action=reassign`}>
                          <Button size="sm">Réaffecter</Button>
                        </Link>
                      ) : null}
                      {canCancel ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className={cancelButtonClassName}
                          onClick={() => {
                            setCancellationError(null)
                            setReservationToCancel(reservation)
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Supprimer
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <tr>
                  <th className="w-16 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Photo</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Référence</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Client</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Véhicule</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Période</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Montant</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                  <th className="w-px whitespace-nowrap px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => {
                  const status = mapStatusToUi(reservation.status, reservation.cancellation_source)
                  const canCancel = reservation.status === 'CONFIRMEE'
                  return (
                    <tr key={reservation.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB]">
                      <td className="px-2 py-3"><VehiclePhoto reservation={reservation} /></td>
                      <td className="whitespace-nowrap px-2 py-3 text-[13px] font-semibold text-[#0F172A]">{reservation.reference}</td>
                      <td className="px-2 py-3 text-sm">
                        <div className="w-32">
                          <p className="truncate font-medium text-[#1F2937]" title={clientLabel(reservation) ?? undefined}>{clientLabel(reservation) ?? '—'}</p>
                          {reservation.client_summary?.email ? <p className="truncate text-xs text-slate-500" title={reservation.client_summary.email}>{reservation.client_summary.email}</p> : null}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-sm">
                        <div className="w-32">
                          <p className="truncate font-medium text-[#1F2937]" title={`${reservation.vehicle.brand} ${reservation.vehicle.model_name}`}>{reservation.vehicle.brand} {reservation.vehicle.model_name}</p>
                          <p className="truncate text-xs text-slate-500">{reservation.vehicle.registration_plate || '—'}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3"><Period reservation={reservation} /></td>
                      <td className="whitespace-nowrap px-2 py-3 text-sm font-semibold text-[#1F2937]">{formatAmount(reservation.rental_amount)}</td>
                      <td className="px-2 py-3">
                        <div className="flex max-w-32 flex-wrap gap-1.5">
                          <StatusBadge variant={status.variant} label={status.label} />
                          {reservation.needs_review ? <StatusBadge variant="warning" label="À vérifier" /> : null}
                        </div>
                      </td>
                      <td className="w-px whitespace-nowrap px-2 py-3">
                        <div className="flex flex-nowrap items-center gap-1.5">
                          <Link to={`${basePath}/reservations/${reservation.id}`} className="shrink-0">
                            <Button variant="secondary" size="sm" className={actionButtonClassName}>Voir détail</Button>
                          </Link>
                          <Button
                            variant="secondary"
                            size="sm"
                            className={actionButtonClassName}
                            disabled={!reservation.invoice_id || downloadingInvoiceForId !== null}
                            title={reservation.invoice_id ? undefined : 'Aucune facture disponible'}
                            onClick={() => void handleInvoiceDownload(reservation)}
                          >
                            {downloadingInvoiceForId === reservation.id ? 'Téléchargement...' : 'Télécharger facture'}
                          </Button>
                          {reservation.status === 'REAFFECTATION_REQUIRED' ? (
                            <Link to={`${basePath}/reservations/${reservation.id}?action=reassign`} className="shrink-0">
                              <Button size="sm" className={actionButtonClassName}>Réaffecter</Button>
                            </Link>
                          ) : null}
                          {canCancel ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className={cancelButtonClassName}
                              onClick={() => {
                                setCancellationError(null)
                                setReservationToCancel(reservation)
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Supprimer
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
              <p className="text-sm text-slate-600">Page {page} / {totalPages}</p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={!reservationsQuery.data?.previous || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Précédent</Button>
                <Button type="button" variant="secondary" size="sm" disabled={!reservationsQuery.data?.next || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Suivant</Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {reservationToCancel ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-reservation-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !cancellationMutation.isPending) {
              setReservationToCancel(null)
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="cancel-reservation-title" className="text-xl font-semibold text-[#0F172A]">Supprimer cette réservation ?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              La réservation sera annulée par le gestionnaire et restera conservée dans l’historique.
            </p>
            {cancellationError ? <Alert variant="danger" title="Annulation impossible" message={cancellationError} className="mt-4" /> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={cancellationMutation.isPending}
                onClick={() => setReservationToCancel(null)}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={cancellationMutation.isPending}
                onClick={() => cancellationMutation.mutate(reservationToCancel.id)}
              >
                Confirmer la suppression
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
