import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getReservations } from '../../services/reservationService'
import type { ReservationDetail, ReservationListQueryParams, ReservationStatus } from '../../types/reservation'

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
  const [page, setPage] = useState(1)

  const queryParams: ReservationListQueryParams = {
    page,
    ordering: '-created_at',
  }

  const reservationsQuery = useQuery({
    queryKey: ['client-reservations', queryParams],
    queryFn: () => getReservations(queryParams),
  })

  const reservations = useMemo(() => reservationsQuery.data?.results ?? [], [reservationsQuery.data?.results])

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-[#0F172A]">Mes réservations</h1>
      </div>

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
                className="[&>div:first-child]:px-5 [&>div:first-child]:py-3 [&>div:nth-child(2)]:px-5 [&>div:nth-child(2)]:py-4"
                header={
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Référence</p>
                      <p className="text-base font-semibold text-[#0F172A]">{reservation.reference}</p>
                    </div>
                    <StatusBadge variant={status.variant} label={status.label} />
                  </div>
                }
              >
                <div className="grid gap-x-4 gap-y-3 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="font-medium text-[#1F2937]">Véhicule</p>
                    <p>{vehicleLabel(reservation)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Période</p>
                    <p>{formatPeriod(reservation.start_at, reservation.end_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Date de création</p>
                    <p>{formatDateTime(reservation.created_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Montant</p>
                    <p>{reservation.rental_amount} EUR</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Caution</p>
                    <p>{reservation.deposit_amount} EUR</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {canContinuePayment(reservation.status) ? (
                    <Link to={`/payment?reservationId=${reservation.id}`}>
                      <Button size="sm">Continuer le paiement</Button>
                    </Link>
                  ) : null}
                  <Link to={`/client/reservations/${reservation.id}`}>
                    <Button variant="secondary" size="sm">
                      Voir les détails
                    </Button>
                  </Link>
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