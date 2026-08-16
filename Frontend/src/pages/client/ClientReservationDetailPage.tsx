import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getReservationById } from '../../services/reservationService'
import type { ReservationStatus } from '../../types/reservation'

type UnlockButtonAvailability = {
  isVisible: boolean
  isEnabled: boolean
  showTooEarlyMessage: boolean
}

const UNLOCK_EARLY_WINDOW_MINUTES = 15

function formatDateTime(value: string): string {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatDate(value: string): string {
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

function statusToBadge(status: ReservationStatus | undefined): { label: string; variant: StatusVariant } {
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

function normalizeReservationStatus(status: ReservationStatus | undefined): ReservationStatus | undefined {
  if (!status) {
    return undefined
  }

  const normalized = status.trim().toUpperCase() as ReservationStatus
  return normalized
}

function getUnlockButtonAvailability(
  status: ReservationStatus | undefined,
  startAt: string,
  endAt: string,
): UnlockButtonAvailability {
  if (status !== 'CONFIRMEE') {
    return {
      isVisible: false,
      isEnabled: false,
      showTooEarlyMessage: false,
    }
  }

  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      isVisible: true,
      isEnabled: false,
      showTooEarlyMessage: false,
    }
  }

  const unlockWindowStart = startDate.getTime() - (UNLOCK_EARLY_WINDOW_MINUTES * 60 * 1000)
  const now = Date.now()
  const isEnabled = now >= unlockWindowStart && now <= endDate.getTime()

  return {
    isVisible: true,
    isEnabled,
    showTooEarlyMessage: now < unlockWindowStart,
  }
}

export default function ClientReservationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isValidReservationId,
  })

  if (!isValidReservationId) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Réservation invalide" message="L'identifiant de réservation est invalide." className="mb-4" />
        <Button variant="secondary" onClick={() => navigate('/client/reservations')}>
          Retour à mes réservations
        </Button>
      </section>
    )
  }

  if (reservationQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement de la réservation" />
      </section>
    )
  }

  if (reservationQuery.isError || !reservationQuery.data) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Chargement impossible" message="La réservation est introuvable ou inaccessible." className="mb-4" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/client/reservations')}>
            Retour à mes réservations
          </Button>
          <Button variant="secondary" onClick={() => void reservationQuery.refetch()}>
            Réessayer
          </Button>
        </div>
      </section>
    )
  }

  const reservation = reservationQuery.data
  const normalizedStatus = normalizeReservationStatus(reservation.status)
  const badge = statusToBadge(normalizedStatus)
  const unlockButtonAvailability = getUnlockButtonAvailability(
    normalizedStatus,
    reservation.start_at,
    reservation.end_at,
  )
  const shouldShowUnlockButton = normalizedStatus === 'CONFIRMEE' && unlockButtonAvailability.isVisible
  const shouldShowReturnButton = normalizedStatus === 'EN_COURS'

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Ma réservation</h1>
        </div>
        <Button variant="secondary" onClick={() => navigate('/client/reservations')}>
          Retour à mes réservations
        </Button>
      </div>

      <Card
        className="mb-6"
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Référence</p>
              <p className="text-base font-semibold text-[#0F172A]">{reservation.reference}</p>
            </div>
            <StatusBadge variant={badge.variant} label={badge.label} />
          </div>
        }
      >
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-medium text-[#1F2937]">Véhicule</p>
            <p className="mt-1">{reservation.vehicle.brand} {reservation.vehicle.model_name}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Période</p>
            <p className="mt-1">{formatDate(reservation.start_at)} - {formatDate(reservation.end_at)}</p>
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
          <div>
            <p className="font-medium text-[#1F2937]">Statut backend</p>
            <p className="mt-1">{reservation.status ?? 'Inconnu'}</p>
          </div>
        </div>
      </Card>

      {shouldShowUnlockButton ? (
        <div className="flex flex-col gap-2">
          <Button
            className="mx-auto h-[52px] w-full max-w-[420px] text-base"
            disabled={!unlockButtonAvailability.isEnabled}
            onClick={() => {
              if (!unlockButtonAvailability.isEnabled) {
                return
              }

              navigate(`/client/reservations/${reservation.id}/unlock`)
            }}
          >
            Aller vers le déverrouillage du véhicule
          </Button>
          {!unlockButtonAvailability.isEnabled ? (
            <p className="text-sm text-slate-600">Disponible 15 min avant le départ</p>
          ) : null}
        </div>
      ) : null}

      {shouldShowReturnButton ? (
        <div className="flex justify-center">
          <Button
            className="mx-auto h-[52px] w-full max-w-[420px] bg-[#F97316] text-base text-white hover:bg-[#EA580C]"
            onClick={() => navigate(`/client/reservations/${reservation.id}/return-inspection`)}
          >
            Restituer le véhicule
          </Button>
        </div>
      ) : null}
    </section>
  )
}