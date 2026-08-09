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
import { getReservations } from '../../services/reservationService'
import type { ReservationDetail, ReservationListQueryParams, ReservationStatus } from '../../types/reservation'

type ReservationFilter = 'all' | 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'

const filterLabels: Record<ReservationFilter, string> = {
  all: 'Toutes',
  pending: 'En attente',
  confirmed: 'Confirmées',
  in_progress: 'En cours',
  completed: 'Terminées',
  cancelled: 'Annulées',
}

const pendingStatuses: ReservationStatus[] = ['BROUILLON', 'EN_ATTENTE_CAUTION', 'EN_ATTENTE_PAIEMENT', 'A_CONTROLER']

function mapFilterToApiStatus(filter: ReservationFilter): string | undefined {
  switch (filter) {
    case 'confirmed':
      return 'CONFIRMEE'
    case 'in_progress':
      return 'EN_COURS'
    case 'completed':
      return 'TERMINEE'
    case 'cancelled':
      return 'ANNULEE'
    default:
      return undefined
  }
}

function mapStatusToUi(status: ReservationStatus | undefined): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'BROUILLON':
      return { label: 'Brouillon', variant: 'neutral' }
    case 'EN_ATTENTE_CAUTION':
      return { label: 'En attente caution', variant: 'warning' }
    case 'EN_ATTENTE_PAIEMENT':
      return { label: 'En attente paiement', variant: 'warning' }
    case 'CONFIRMEE':
      return { label: 'Confirmée', variant: 'success' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'A contrôler', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminée', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulée', variant: 'danger' }
    case 'PAIEMENT_ECHOUE':
      return { label: 'Paiement échoué', variant: 'danger' }
    default:
      return { label: 'Inconnu', variant: 'neutral' }
  }
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

function formatPeriod(startAt: string, endAt: string): string {
  const start = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(startAt))

  const end = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(endAt))

  return `${start} - ${end}`
}

function vehicleLabel(reservation: ReservationDetail): string {
  return `${reservation.vehicle.brand} ${reservation.vehicle.model_name}`
}

function canContinuePayment(status: ReservationStatus | undefined): boolean {
  return status === 'BROUILLON' || status === 'EN_ATTENTE_CAUTION' || status === 'EN_ATTENTE_PAIEMENT'
}

export default function ClientReservationsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ReservationFilter>('all')
  const [page, setPage] = useState(1)

  const queryParams: ReservationListQueryParams = {
    page,
    ordering: '-created_at',
  }

  if (searchQuery.trim().length > 0) {
    queryParams.search = searchQuery.trim()
  }

  const apiStatus = mapFilterToApiStatus(activeFilter)

  if (apiStatus) {
    queryParams.status = apiStatus
  }

  const reservationsQuery = useQuery({
    queryKey: ['client-reservations', queryParams],
    queryFn: () => getReservations(queryParams),
  })

  const reservations = useMemo(() => {
    const results = reservationsQuery.data?.results ?? []

    if (activeFilter !== 'pending') {
      return results
    }

    return results.filter((reservation) => pendingStatuses.includes(reservation.status ?? 'BROUILLON'))
  }, [activeFilter, reservationsQuery.data?.results])

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput)
  }

  const handleFilterClick = (filter: ReservationFilter) => {
    setActiveFilter(filter)
    setPage(1)
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mon espace</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Mes réservations</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Consultez l'historique, le statut et les informations clés de vos réservations.
        </p>
      </div>

      <Card className="mb-6">
        <form className="grid gap-4 md:grid-cols-[1fr_auto]" onSubmit={handleSearchSubmit}>
          <Input
            label="Recherche par référence"
            placeholder="Ex: RES-2026-0001"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <div className="flex items-end">
            <Button type="submit" className="w-full md:w-auto">
              Rechercher
            </Button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(filterLabels) as ReservationFilter[]).map((filter) => (
            <Button
              key={filter}
              variant={activeFilter === filter ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleFilterClick(filter)}
            >
              {filterLabels[filter]}
            </Button>
          ))}
        </div>
      </Card>

      {reservationsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des réservations" />
        </div>
      ) : null}

      {reservationsQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les réservations n'ont pas pu être récupérées. Veuillez réessayer."
          className="mb-6"
        />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? (
        <EmptyState
          title="Aucune réservation"
          description="Aucune réservation"
          action={
            <Link to="/vehicles">
              <Button>Rechercher un véhicule</Button>
            </Link>
          }
        />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length > 0 ? (
        <div className="space-y-4">
          {reservations.map((reservation) => {
            const status = mapStatusToUi(reservation.status)

            return (
              <Card
                key={reservation.id}
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Référence</p>
                      <p className="text-base font-semibold text-[#0F172A]">{reservation.reference}</p>
                    </div>
                    <StatusBadge variant={status.variant} label={status.label} />
                  </div>
                }
              >
                <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="font-medium text-[#1F2937]">Véhicule</p>
                    <p className="mt-1">{vehicleLabel(reservation)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Période</p>
                    <p className="mt-1">{formatPeriod(reservation.start_at, reservation.end_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Date de création</p>
                    <p className="mt-1">{formatDateTime(reservation.created_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Montant</p>
                    <p className="mt-1">{reservation.rental_amount} EUR</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Caution</p>
                    <p className="mt-1">{reservation.deposit_amount} EUR</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to={`/client/reservations/${reservation.id}`}>
                    <Button variant="secondary" size="sm">
                      Voir le détail
                    </Button>
                  </Link>
                  {canContinuePayment(reservation.status) ? (
                    <Link to={`/payment?reservationId=${reservation.id}`}>
                      <Button size="sm">Continuer le paiement</Button>
                    </Link>
                  ) : null}
                </div>
              </Card>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              Total: <span className="font-semibold text-[#1F2937]">{reservationsQuery.data?.count ?? 0}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!reservationsQuery.data?.previous}
              >
                Précédent
              </Button>
              <span className="px-2 text-sm font-medium text-slate-700">Page {page}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!reservationsQuery.data?.next}
              >
                Suivant
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}