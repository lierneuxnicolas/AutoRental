import { useEffect, useMemo, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import ReservationProgressBanner from '../../components/reservations/ReservationProgressBanner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { completeInspection } from '../../services/inspectionService'
import { getVehicleById } from '../../services/vehicleService'
import { getReservationById } from '../../services/reservationService'
import type { Inspection } from '../../types/inspection'
import { resolveMediaUrl } from '../../utils/media'

type ApiErrorPayload = {
  detail?: string
  message?: string
  non_field_errors?: string[]
  [key: string]: unknown
}

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Parking%20GetaCar%20-%20Gare%20Centrale%2C%20Rue%20des%20Mobilit%C3%A9s%2012%2C%201000%20Bruxelles'
const AUTO_COMPLETION_TIMEOUT_MS = 15_000

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
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

function toErrorMessage(error: unknown): string {
  const fallback = 'Une erreur est survenue. Veuillez reessayer.'
  const axiosError = error as AxiosError<ApiErrorPayload>
  const payload = axiosError.response?.data

  if (!payload) {
    return fallback
  }

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length > 0) {
    return payload.non_field_errors.join(' ')
  }

  return fallback
}

export default function DepartureInspectionConfirmationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0
  const completionAttemptedRef = useRef(false)

  const [confirmedInspection, setConfirmedInspection] = useState<Inspection | null>(null)
  const [completionFailedMessage, setCompletionFailedMessage] = useState<string | null>(null)
  const [isAwaitingAutoCompletion, setIsAwaitingAutoCompletion] = useState(false)

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const inspection = confirmedInspection ?? reservationQuery.data?.departure_inspection ?? null
  const vehicleId = reservationQuery.data?.vehicle.id

  const vehicleQuery = useQuery({
    queryKey: ['client-confirmation-vehicle', vehicleId],
    queryFn: () => getVehicleById(vehicleId!),
    enabled: typeof vehicleId === 'number' && vehicleId > 0,
  })

  const completionMutation = useMutation({
    mutationFn: () => {
      if (!inspection || inspection.id <= 0) {
        throw new Error('Inspection introuvable.')
      }
      if (inspection.mileage == null || inspection.energy_level_percent == null) {
        throw new Error('Donnees vehicule manquantes.')
      }

      return completeInspection(inspection.id, {
        mileage: inspection.mileage,
        energy_level_percent: inspection.energy_level_percent,
      })
    },
    onSuccess: async (response) => {
      setConfirmedInspection(response)
      setCompletionFailedMessage(null)
      await reservationQuery.refetch()
    },
    onError: (error) => {
      setCompletionFailedMessage(toErrorMessage(error))
    },
    onSettled: () => {
      setIsAwaitingAutoCompletion(false)
    },
  })

  useEffect(() => {
    if (!reservationQuery.data || completionAttemptedRef.current || completionFailedMessage) {
      return
    }

    if (!inspection) {
      return
    }

    if (inspection.status === 'TERMINE') {
      return
    }

    if (inspection.mileage == null || inspection.energy_level_percent == null) {
      completionAttemptedRef.current = true
      setCompletionFailedMessage('Impossible de finaliser automatiquement: kilometrage ou niveau d\'energie manquant. Revenez a l\'etape Etat du vehicule pour completer ces donnees.')
      return
    }

    completionAttemptedRef.current = true
    setIsAwaitingAutoCompletion(true)
    setCompletionFailedMessage(null)
    void completionMutation.mutateAsync()
  }, [completionFailedMessage, completionMutation, inspection, reservationQuery.data])

  useEffect(() => {
    if (!isAwaitingAutoCompletion) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsAwaitingAutoCompletion(false)
      setCompletionFailedMessage((current) => (
        current
        ?? 'La validation automatique a pris trop de temps. Veuillez reessayer depuis l\'etape Etat du vehicule.'
      ))
    }, AUTO_COMPLETION_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isAwaitingAutoCompletion])

  const steps = useMemo(
    () => [
      { order: 1, label: 'Deverrouillage', status: 'done' as const },
      { order: 2, label: 'Exterieur', status: 'done' as const },
      { order: 3, label: 'Interieur', status: 'done' as const },
      { order: 4, label: 'Etat du vehicule', status: 'done' as const },
      { order: 5, label: 'Confirmation', status: 'done' as const },
    ],
    [],
  )

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  const vehicle = vehicleQuery.data ?? null
  const displayVehiclePhoto = resolveMediaUrl(vehicle?.main_photo?.file)
  const vehicleLabel = reservationQuery.data ? `${reservationQuery.data.vehicle.brand} ${reservationQuery.data.vehicle.model_name}` : 'Véhicule'

  if (reservationQuery.isLoading || isAwaitingAutoCompletion) {
    return (
      <section className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <Card className="w-full max-w-2xl">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <LoadingSpinner size="lg" aria-label="Validation en cours" />
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#7C3AED]">Confirmation</p>
            <h1 className="text-3xl font-semibold text-[#0F172A]">Location démarrée !</h1>
            <p className="max-w-lg text-sm leading-6 text-slate-600">
              Vérification finale en cours avant d’afficher votre confirmation.
            </p>
          </div>
        </Card>
      </section>
    )
  }

  if (completionFailedMessage) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
          <ReservationProgressBanner className="mb-6 sm:mb-8" steps={steps} />
        </div>
        <Alert className="mb-4" variant="danger" title="Confirmation impossible" message={completionFailedMessage} />
        <div className="flex justify-center">
          <Link to={`/client/reservations/${reservationId}/departure-inspection/vehicle-state`}>
            <Button variant="secondary">Retour à l'étape État du véhicule</Button>
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
        <ReservationProgressBanner className="mb-6 sm:mb-8" steps={steps} />
      </div>
      <Card>
        <div className="space-y-4">
          <header className="text-center">
            <h1 className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[26px] font-semibold text-[#0F172A]">
              <span aria-hidden="true" className="text-3xl leading-none text-green-600">✓</span>
              <span>Votre location a démarré. Bonne route !</span>
            </h1>
          </header>

          <section
            aria-label="Résumé du véhicule"
            className="mx-auto flex w-full flex-col items-start gap-4 sm:max-w-4xl sm:translate-x-2 sm:flex-row sm:items-center sm:gap-5"
          >
            {displayVehiclePhoto ? (
              <div className="h-24 w-36 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-36">
                <img src={displayVehiclePhoto} alt={vehicleLabel} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0 sm:flex-1">
              <p className="text-lg font-semibold text-[#1F2937]">{vehicleLabel}</p>
            </div>
            <dl className="space-y-3 text-sm leading-5 sm:ml-auto sm:mr-[30px] sm:shrink-0 sm:text-left">
              <div>
                <dt className="text-slate-600">Début</dt>
                <dd className="font-medium text-[#1F2937]">{formatDateTime(reservationQuery.data?.start_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Fin</dt>
                <dd className="font-medium text-[#1F2937]">{formatDateTime(reservationQuery.data?.end_at)}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="Informations pratiques" className="space-y-5 rounded-xl bg-slate-50 p-4 text-[15px] leading-6 text-[#1F2937] sm:p-5">
            <div className="space-y-3 text-center">
              <p><strong>Récupérez la clé</strong> dans le boîtier sécurisé de la boîte à gants.</p>
              <p><strong>Documents et constat d'accident</strong> dans la boîte à gants.</p>
            </div>

            <div className="text-center">
              <p className="text-base font-semibold text-[#1F2937]">Restitution — Parking GetaCar, Gare Centrale</p>
              <a
                href={GOOGLE_MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-[15px] text-[#2563EB] underline decoration-2 underline-offset-4"
              >
                Rue des Mobilités 12, 1000 Bruxelles
              </a>
            </div>
          </section>

          <div className="flex justify-center">
            <Button className="w-full max-w-sm" onClick={() => navigate('/client')}>
              Retour au tableau de bord
            </Button>
          </div>
        </div>
      </Card>
    </section>
  )
}
