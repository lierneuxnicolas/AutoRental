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
import { getManagementReservations } from '../../services/managementReservationService'
import type { ManagementReservationStatus, ReservationManagementDetail } from '../../types/managementReservation'

interface ManagerReservationsPageProps {
  basePath?: string
}

type ReservationFilter =
  | 'all'
  | 'BROUILLON'
  | 'CONFIRMEE'
  | 'EN_COURS'
  | 'A_CONTROLER'
  | 'TERMINEE'
  | 'ANNULEE'

const statusFilters: Array<{ value: ReservationFilter; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'BROUILLON', label: 'Brouillon' },
  { value: 'CONFIRMEE', label: 'Confirmees' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'A_CONTROLER', label: 'A controler' },
  { value: 'TERMINEE', label: 'Terminees' },
  { value: 'ANNULEE', label: 'Annulees' },
]

function mapStatusToUi(status: ManagementReservationStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'BROUILLON':
      return { label: 'Brouillon', variant: 'neutral' }
    case 'EN_ATTENTE_CAUTION':
      return { label: 'En attente caution', variant: 'warning' }
    case 'EN_ATTENTE_PAIEMENT':
      return { label: 'En attente paiement', variant: 'warning' }
    case 'CONFIRMEE':
      return { label: 'Confirmee', variant: 'success' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'A controler', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminee', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulee', variant: 'danger' }
    case 'PAIEMENT_ECHOUE':
      return { label: 'Paiement echoue', variant: 'danger' }
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

function vehicleLabel(reservation: ReservationManagementDetail): string {
  const base = `${reservation.vehicle.brand} ${reservation.vehicle.model_name}`
  return reservation.vehicle.registration_plate
    ? `${base} (${reservation.vehicle.registration_plate})`
    : base
}

function clientLabel(reservation: ReservationManagementDetail): string | null {
  if (!reservation.client_summary) {
    return null
  }

  const fullName = `${reservation.client_summary.first_name} ${reservation.client_summary.last_name}`.trim()

  if (fullName.length > 0) {
    return fullName
  }

  return reservation.client_summary.email || null
}

export default function ManagerReservationsPage({ basePath = '/manager' }: ManagerReservationsPageProps) {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ReservationFilter>('all')

  const reservationsQuery = useQuery({
    queryKey: ['manager-reservations'],
    queryFn: () => getManagementReservations(),
  })

  const reservations = useMemo(
    () => reservationsQuery.data?.results ?? [],
    [reservationsQuery.data?.results],
  )

  const filteredReservations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return reservations.filter((reservation) => {
      if (activeFilter !== 'all' && reservation.status !== activeFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const parts = [
        reservation.reference,
        reservation.client_summary?.first_name,
        reservation.client_summary?.last_name,
        reservation.client_summary?.email,
        reservation.vehicle?.brand,
        reservation.vehicle?.model_name,
      ]

      const haystack = parts
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [activeFilter, reservations, search])

  const returnsToVerify = useMemo(
    () => reservations.filter((reservation) => reservation.status === 'A_CONTROLER'),
    [reservations],
  )

  const resolveReturnDateTime = (reservation: ReservationManagementDetail): string => {
    return reservation.return_inspection?.completed_at ?? reservation.end_at
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Reservations</h1>
        <p className="mt-1 text-sm text-slate-500">Consultez la liste des reservations clients.</p>
      </div>

      <Card>
        <div className="space-y-4">
          <Input
            type="search"
            label="Recherche"
            placeholder="Reference, client, e-mail, marque ou modele"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={activeFilter === filter.value ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card
        header={(
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">Retours a verifier</h2>
            <p className="mt-1 text-sm text-slate-500">
              Reservations restituees en attente de controle gestionnaire.
            </p>
          </div>
        )}
      >
        {returnsToVerify.length === 0 ? (
          <EmptyState
            title="Aucun retour en attente"
            description="Tous les retours ont ete traites ou aucun vehicule n'a encore ete restitue."
          />
        ) : (
          <div className="space-y-4">
            {returnsToVerify.map((reservation) => (
              <article key={reservation.id} className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="font-medium text-[#1F2937]">Numero reservation</p>
                    <p className="mt-1">{reservation.reference}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Client</p>
                    <p className="mt-1">{clientLabel(reservation) ?? 'Client indisponible'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Vehicule</p>
                    <p className="mt-1">{vehicleLabel(reservation)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Date/heure retour</p>
                    <p className="mt-1">{formatDateTime(resolveReturnDateTime(reservation))}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Statut</p>
                    <div className="mt-1">
                      <StatusBadge variant="warning" label="A verifier" />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Link to={`${basePath}/reservations/${reservation.id}`}>
                    <Button size="sm">Verifier le retour</Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
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

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? (
        <EmptyState
          title="Aucune reservation"
          description="Il n'y a actuellement aucune reservation a afficher."
        />
      ) : null}

      {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length > 0 ? (
        <p className="text-sm text-slate-600">
          {filteredReservations.length} resultat{filteredReservations.length > 1 ? 's' : ''}
        </p>
      ) : null}

      {!reservationsQuery.isLoading
      && !reservationsQuery.isError
      && reservations.length > 0
      && filteredReservations.length === 0 ? (
        <EmptyState
          title="Aucune reservation correspondante"
          description="Aucune reservation correspondante"
        />
      ) : null}

      {!reservationsQuery.isLoading
      && !reservationsQuery.isError
      && reservations.length > 0
      && filteredReservations.length > 0 ? (
        <div className="space-y-4">
          {filteredReservations.map((reservation) => {
            const status = mapStatusToUi(reservation.status)
            const client = clientLabel(reservation)

            return (
              <Card
                key={reservation.id}
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reference</p>
                      <p className="text-base font-semibold text-[#0F172A]">{reservation.reference}</p>
                    </div>
                    <StatusBadge variant={status.variant} label={status.label} />
                  </div>
                }
              >
                <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
                  {client ? (
                    <div>
                      <p className="font-medium text-[#1F2937]">Client</p>
                      <p className="mt-1">{client}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="font-medium text-[#1F2937]">Vehicule</p>
                    <p className="mt-1">{vehicleLabel(reservation)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Debut</p>
                    <p className="mt-1">{formatDateTime(reservation.start_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Fin</p>
                    <p className="mt-1">{formatDateTime(reservation.end_at)}</p>
                  </div>
                  {reservation.rental_amount ? (
                    <div>
                      <p className="font-medium text-[#1F2937]">Montant location</p>
                      <p className="mt-1">{reservation.rental_amount} EUR</p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex justify-end">
                  <Link to={`${basePath}/reservations/${reservation.id}`}>
                    <Button variant="secondary" size="sm">
                      {reservation.status === 'A_CONTROLER' ? 'Verifier le retour' : 'Voir le detail'}
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
