import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  completeManagementReservation,
  getManagementReservationById,
} from '../../services/managementReservationService'
import type {
  ManagementReservationClosureRequest,
  ManagementReservationStatus,
  ReservationManagementDetail,
} from '../../types/managementReservation'

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

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function toVehicleLabel(reservation: ReservationManagementDetail): string | null {
  const parts = [reservation.vehicle.brand, reservation.vehicle.model_name].filter(Boolean)

  if (parts.length === 0) {
    return null
  }

  return parts.join(' ')
}

function toErrorState(error: unknown): {
  title: string
  message: string
} {
  if (!axios.isAxiosError(error)) {
    return {
      title: 'Chargement impossible',
      message: 'Une erreur inattendue est survenue. Veuillez reessayer.',
    }
  }

  if (error.response?.status === 403) {
    return {
      title: 'Acces refuse',
      message: 'Vous n\'avez pas les permissions pour consulter cette reservation.',
    }
  }

  if (error.response?.status === 404) {
    return {
      title: 'Reservation introuvable',
      message: 'La reservation demandee est introuvable ou a ete supprimee.',
    }
  }

  return {
    title: 'Chargement impossible',
    message: 'Impossible de recuperer le detail de la reservation. Veuillez reessayer.',
  }
}

type ErrorPayload = {
  detail?: string
  message?: string
  non_field_errors?: string[]
}

function toClosureErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Erreur reseau: impossible de contacter le serveur.'
  }

  const payload = error.response?.data as ErrorPayload | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  if (Array.isArray(payload?.non_field_errors) && payload.non_field_errors.length > 0) {
    return payload.non_field_errors.join(' ')
  }

  switch (error.response?.status) {
    case 400:
      return 'La demande de cloture est invalide.'
    case 403:
      return 'Vous n\'avez pas la permission de cloturer cette reservation.'
    case 404:
      return 'La ressource de cloture est introuvable.'
    case 409:
      return 'La cloture est impossible dans l\'etat actuel de la reservation.'
    default:
      return 'La cloture a echoue. Veuillez reessayer.'
  }
}

function canCloseReservation(status: ManagementReservationStatus): boolean {
  return status === 'A_CONTROLER'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-[#1F2937]">{value}</p>
    </div>
  )
}

export default function ManagerReservationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [showClosureConfirm, setShowClosureConfirm] = useState(false)
  const [isVehicleAvailableConfirmed, setIsVehicleAvailableConfirmed] = useState(false)
  const [closureError, setClosureError] = useState<string | null>(null)
  const [closureSuccess, setClosureSuccess] = useState<string | null>(null)

  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0

  const detailQuery = useQuery({
    queryKey: ['manager-reservation-detail', reservationId],
    queryFn: () => getManagementReservationById(reservationId),
    enabled: isValidReservationId,
  })

  const closureMutation = useMutation({
    mutationFn: (payload: ManagementReservationClosureRequest) => completeManagementReservation(reservationId, payload),
    onSuccess: async () => {
      setShowClosureConfirm(false)
      setIsVehicleAvailableConfirmed(false)
      setClosureError(null)
      setClosureSuccess('La reservation a ete cloturee avec succes.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservationId] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
      ])
    },
    onError: (error) => {
      setClosureSuccess(null)
      setClosureError(toClosureErrorMessage(error))
    },
  })

  if (!isValidReservationId) {
    return (
      <section className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Reservation invalide"
          message="L'identifiant de reservation est invalide."
        />
        <Link to="/manager/reservations" className="inline-flex">
          <Button variant="secondary">Retour aux reservations</Button>
        </Link>
      </section>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement de la reservation" />
      </section>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    const errorState = toErrorState(detailQuery.error)

    return (
      <section className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title={errorState.title}
          message={errorState.message}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void detailQuery.refetch()}>
            Reessayer
          </Button>
          <Link to="/manager/reservations">
            <Button variant="secondary">Retour aux reservations</Button>
          </Link>
        </div>
      </section>
    )
  }

  const reservation = detailQuery.data
  const status = mapStatusToUi(reservation.status)
  const clientFullName = `${reservation.client_summary.first_name} ${reservation.client_summary.last_name}`.trim()
  const vehicleLabel = toVehicleLabel(reservation)
  const showClosureAction = canCloseReservation(reservation.status)

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Detail de reservation</h1>
          <p className="mt-1 text-sm text-slate-500">Consultez les informations completes de la reservation.</p>
        </div>
        <Link to="/manager/reservations">
          <Button variant="secondary">Retour aux reservations</Button>
        </Link>
      </div>

      {closureSuccess ? (
        <Alert
          variant="success"
          title="Cloture effectuee"
          message={closureSuccess}
        />
      ) : null}

      {closureError ? (
        <Alert
          variant="danger"
          title="Cloture impossible"
          message={closureError}
        />
      ) : null}

      <Card
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[#1F2937]">Reservation</h2>
            <StatusBadge variant={status.variant} label={status.label} />
          </div>
        }
      >
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Reference" value={reservation.reference} />
          <Field label="Statut" value={status.label} />
          <Field label="Date de creation" value={formatDateTime(reservation.created_at)} />
          <Field label="Debut" value={formatDateTime(reservation.start_at)} />
          <Field label="Fin" value={formatDateTime(reservation.end_at)} />
        </div>
      </Card>

      {showClosureAction ? (
        <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Cloture</h2>}>
          {!showClosureConfirm ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  setShowClosureConfirm(true)
                  setClosureError(null)
                  setClosureSuccess(null)
                }}
                disabled={closureMutation.isPending}
              >
                Cloturer la reservation
              </Button>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <p className="text-sm text-slate-700">
                Confirmez-vous que les controles finaux sont termines et que le vehicule peut etre remis a disposition ?
              </p>

              <label className="flex items-start gap-3 text-sm text-[#1F2937]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
                  checked={isVehicleAvailableConfirmed}
                  onChange={(event) => setIsVehicleAvailableConfirmed(event.target.checked)}
                  disabled={closureMutation.isPending}
                />
                <span>Je confirme que le vehicule est disponible.</span>
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!isVehicleAvailableConfirmed || closureMutation.isPending}
                  onClick={() => {
                    setClosureError(null)
                    setClosureSuccess(null)
                    const payload: ManagementReservationClosureRequest = {
                      mileage: 0,
                      energy_level_percent: 0,
                      comments: 'Cloture confirmee par le gestionnaire. Vehicule disponible.',
                    }
                    void closureMutation.mutateAsync(payload)
                  }}
                >
                  {closureMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" aria-label="Cloture en cours" />
                      Cloture en cours...
                    </span>
                  ) : (
                    'Confirmer la cloture'
                  )}
                </Button>

                <Button
                  variant="secondary"
                  disabled={closureMutation.isPending}
                  onClick={() => {
                    setShowClosureConfirm(false)
                    setIsVehicleAvailableConfirmed(false)
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Client</h2>}>
          <div className="grid gap-4 text-sm text-slate-700">
            {clientFullName ? <Field label="Prenom / Nom" value={clientFullName} /> : null}
            {reservation.client_summary.email ? <Field label="E-mail" value={reservation.client_summary.email} /> : null}
            {!clientFullName && !reservation.client_summary.email ? (
              <p className="text-sm text-slate-500">Aucune information client disponible.</p>
            ) : null}
          </div>
        </Card>

        <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Vehicule</h2>}>
          <div className="grid gap-4 text-sm text-slate-700">
            {vehicleLabel ? <Field label="Marque / Modele" value={vehicleLabel} /> : null}
            {reservation.vehicle.registration_plate ? (
              <Field label="Immatriculation" value={reservation.vehicle.registration_plate} />
            ) : null}
            {!vehicleLabel && !reservation.vehicle.registration_plate ? (
              <p className="text-sm text-slate-500">Aucune information vehicule disponible.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Finances</h2>}>
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2">
          {reservation.rental_amount ? <Field label="Montant location" value={`${reservation.rental_amount} EUR`} /> : null}
          {reservation.deposit_amount ? <Field label="Caution" value={`${reservation.deposit_amount} EUR`} /> : null}
          {!reservation.rental_amount && !reservation.deposit_amount ? (
            <p className="text-sm text-slate-500">Aucune information financiere disponible.</p>
          ) : null}
        </div>
      </Card>
    </section>
  )
}
