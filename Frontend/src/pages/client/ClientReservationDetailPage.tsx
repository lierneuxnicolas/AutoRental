import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { cancelReservation, getReservationById, getReservationCancellationPreview } from '../../services/reservationService'
import type { ReservationCancellationFinancials, ReservationStatus } from '../../types/reservation'

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

function formatEuro(value: string | number): string {
  const numericValue = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(numericValue)) {
    return `${value} EUR`
  }

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue)
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

function isReservationCancellable(status: ReservationStatus | undefined, startAt: string): boolean {
  if (!status) {
    return false
  }

  if (status === 'BROUILLON' || status === 'EN_ATTENTE_CAUTION' || status === 'EN_ATTENTE_PAIEMENT') {
    return true
  }

  if (status === 'CONFIRMEE') {
    const startDate = new Date(startAt)
    return !Number.isNaN(startDate.getTime()) && startDate.getTime() > Date.now()
  }

  return false
}

export default function ClientReservationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null)
  const [cancelSuccessFinancials, setCancelSuccessFinancials] = useState<ReservationCancellationFinancials | null>(null)

  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isValidReservationId,
  })

  const reservation = reservationQuery.data
  const normalizedStatus = normalizeReservationStatus(reservation?.status)
  const canShowCancelButton = reservation
    ? isReservationCancellable(normalizedStatus, reservation.start_at)
    : false

  const cancellationPreviewQuery = useQuery({
    queryKey: ['reservation-cancel-preview', reservationId, reservation?.status],
    queryFn: () => getReservationCancellationPreview(reservationId),
    enabled: isValidReservationId && Boolean(reservation) && isCancelModalOpen && canShowCancelButton,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelReservation(reservationId, { reason: 'Annulation demandee par le client depuis l espace client.' }),
    onSuccess: async (response) => {
      setCancelSuccessFinancials(response.cancellation_financials)
      setCancelErrorMessage(null)
      setIsCancelModalOpen(false)
      await reservationQuery.refetch()
    },
    onError: () => {
      setCancelErrorMessage("L'annulation n'a pas pu être finalisée. Veuillez réessayer.")
    },
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

  if (reservationQuery.isError || !reservation) {
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
      {cancelSuccessFinancials ? (
        <Alert
          variant="success"
          className="mb-4"
          title="Réservation annulée"
          message={
            <div>
              <p>Montant remboursé: {formatEuro(cancelSuccessFinancials.refundable_amount)}</p>
              <p>Frais appliqués: {formatEuro(cancelSuccessFinancials.cancellation_fee)}</p>
              <p>Caution: {cancelSuccessFinancials.deposit_release}</p>
            </div>
          }
        />
      ) : null}

      {cancelErrorMessage ? (
        <Alert
          variant="danger"
          className="mb-4"
          title="Annulation impossible"
          message={cancelErrorMessage}
        />
      ) : null}

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
        <div className="flex flex-col items-center">
          <Button
            className="mx-auto h-13 w-full max-w-105 text-base"
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
            <p className="mt-2.5 text-center text-base text-slate-700">Disponible 15 min avant le départ</p>
          ) : null}
        </div>
      ) : null}

      {shouldShowReturnButton ? (
        <div className="flex justify-center">
          <Button
            className="mx-auto h-13 w-full max-w-105 bg-[#F97316] text-base text-white hover:bg-[#EA580C]"
            onClick={() => navigate(`/client/reservations/${reservation.id}/return-inspection`)}
          >
            Restituer le véhicule
          </Button>
        </div>
      ) : null}

      {canShowCancelButton ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="danger"
            className="mx-auto h-13 w-full max-w-105 text-base"
            onClick={() => {
              setCancelErrorMessage(null)
              setIsCancelModalOpen(true)
            }}
          >
            Annuler ma réservation
          </Button>
        </div>
      ) : null}

      {isCancelModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-[#0F172A]">Êtes-vous sûr de vouloir annuler cette réservation ?</h2>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {cancellationPreviewQuery.isLoading ? (
                <div className="flex items-center gap-3">
                  <LoadingSpinner size="sm" aria-label="Chargement des montants d'annulation" />
                  <span>Calcul des montants en cours...</span>
                </div>
              ) : null}

              {cancellationPreviewQuery.isError ? (
                <Alert variant="danger" message="Les montants d'annulation ne sont pas disponibles pour le moment." />
              ) : null}

              {cancellationPreviewQuery.data ? (
                <div className="space-y-1">
                  <p>Montant payé: {formatEuro(cancellationPreviewQuery.data.amount_paid)}</p>
                  <p>Frais d'annulation: {formatEuro(cancellationPreviewQuery.data.cancellation_fee)}</p>
                  <p>Montant remboursé: {formatEuro(cancellationPreviewQuery.data.refundable_amount)}</p>
                  <p>Caution: libérée intégralement</p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={cancelMutation.isPending}
              >
                Non, conserver ma réservation
              </Button>
              <Button
                variant="danger"
                onClick={() => void cancelMutation.mutateAsync()}
                disabled={
                  cancelMutation.isPending
                  || cancellationPreviewQuery.isLoading
                  || !cancellationPreviewQuery.data?.can_cancel
                }
              >
                {cancelMutation.isPending ? 'Annulation en cours...' : 'Oui, annuler ma réservation'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}