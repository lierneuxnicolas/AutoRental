import { useMemo, useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { cancelReservation, getReservationById } from '../../services/reservationService'
import type { ReservationStatus } from '../../types/reservation'

type ReservationTimelineItem = {
  key: string
  label: string
  at: string
}

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

function canContinuePayment(status: ReservationStatus | undefined): boolean {
  return status === 'BROUILLON' || status === 'EN_ATTENTE_CAUTION' || status === 'EN_ATTENTE_PAIEMENT'
}

function canCancelReservation(status: ReservationStatus | undefined, startAt: string): boolean {
  if (status === 'BROUILLON' || status === 'EN_ATTENTE_CAUTION' || status === 'EN_ATTENTE_PAIEMENT') {
    return true
  }

  if (status !== 'CONFIRMEE') {
    return false
  }

  const startDate = new Date(startAt)

  if (Number.isNaN(startDate.getTime())) {
    return false
  }

  return startDate.getTime() > Date.now()
}

function errorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez réessayer.'
  }

  const payload = error.response?.data as {
    detail?: string
    message?: string
    code?: string
  } | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  return 'Une erreur est survenue. Veuillez réessayer.'
}

export default function ClientReservationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isValidReservationId,
  })

  const cancelMutation = useMutation({
    mutationFn: async () => cancelReservation(reservationId, { reason: cancelReason.trim() }),
    onSuccess: async () => {
      setCancelError(null)
      setSuccessMessage('Réservation annulée avec succès.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-reservation', reservationId] }),
        queryClient.invalidateQueries({ queryKey: ['client-reservations'] }),
      ])
    },
    onError: (error) => {
      setSuccessMessage(null)
      setCancelError(errorMessage(error))
    },
  })

  const timelineItems = useMemo<ReservationTimelineItem[]>(() => {
    if (!reservationQuery.data) {
      return []
    }

    const events: ReservationTimelineItem[] = [
      {
        key: 'created',
        label: 'Réservation créée',
        at: reservationQuery.data.created_at,
      },
    ]

    if (reservationQuery.data.confirmed_at) {
      events.push({
        key: 'confirmed',
        label: 'Réservation confirmée',
        at: reservationQuery.data.confirmed_at,
      })
    }

    if (reservationQuery.data.cancelled_at) {
      events.push({
        key: 'cancelled',
        label: 'Réservation annulée',
        at: reservationQuery.data.cancelled_at,
      })
    }

    return events
  }, [reservationQuery.data])

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
  const badge = statusToBadge(reservation.status)
  const paymentAllowed = canContinuePayment(reservation.status)
  const cancellationAllowed = canCancelReservation(reservation.status, reservation.start_at)

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mes réservations</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Détail de la réservation</h1>
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

      <Card className="mb-6" header={<h2 className="text-lg font-semibold text-[#1F2937]">Historique disponible</h2>}>
        {timelineItems.length === 0 ? (
          <EmptyState title="Aucun historique" description="Aucun historique disponible." />
        ) : (
          <ul className="space-y-3">
            {timelineItems.map((item) => (
              <li key={item.key} className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
                <p className="text-sm font-semibold text-[#1F2937]">{item.label}</p>
                <p className="mt-1 text-sm text-slate-600">{formatDateTime(item.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {successMessage ? <Alert variant="success" title="Action réussie" message={successMessage} className="mb-4" /> : null}
      {cancelError ? <Alert variant="danger" title="Action impossible" message={cancelError} className="mb-4" /> : null}

      <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Actions</h2>}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {paymentAllowed ? (
            <Link to={`/payment?reservationId=${reservation.id}`}>
              <Button className="w-full sm:w-auto">Continuer le paiement</Button>
            </Link>
          ) : null}

          {cancellationAllowed ? (
            <div className="w-full space-y-3">
              <Input
                label="Motif d'annulation"
                placeholder="Indiquez la raison de l'annulation"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
              <Button
                variant="danger"
                onClick={() => {
                  setCancelError(null)
                  setSuccessMessage(null)

                  if (!cancelReason.trim()) {
                    setCancelError("Le motif d'annulation est requis.")
                    return
                  }

                  void cancelMutation.mutateAsync()
                }}
                disabled={cancelMutation.isPending}
                className="w-full sm:w-auto"
              >
                {cancelMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Annulation en cours" />
                    Annulation en cours...
                  </span>
                ) : (
                  'Annuler la réservation'
                )}
              </Button>
            </div>
          ) : null}

          {!paymentAllowed && !cancellationAllowed ? (
            <Alert
              variant="info"
              title="Aucune action disponible"
              message="Aucune action supplémentaire n'est autorisée pour cette réservation selon les règles backend."
              className="w-full"
            />
          ) : null}
        </div>
      </Card>
    </section>
  )
}