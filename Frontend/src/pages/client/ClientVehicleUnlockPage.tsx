import { useMemo, useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import ReservationProgressBanner from '../../components/reservations/ReservationProgressBanner'
import Button from '../../components/ui/Button'
import UnlockDetectionIllustration from '../../components/vehicle/UnlockDetectionIllustration'
import { unlockVehicle } from '../../services/inspectionService'
import { getReservationById } from '../../services/reservationService'
import { getVehicleById } from '../../services/vehicleService'

const UNLOCK_EARLY_WINDOW_MINUTES = 15

type UnlockAvailability = {
  isEnabled: boolean
}

type ApiErrorPayload = {
  code?: string
  detail?: string
  message?: string
}

function getErrorPayload(error: unknown): ApiErrorPayload | null {
  if (!axios.isAxiosError(error)) {
    return null
  }

  const payload = error.response?.data as ApiErrorPayload | undefined
  return payload ?? null
}

function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data as ApiErrorPayload | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
}

function getUnlockAvailability(status: string | undefined, startAt: string, endAt: string): UnlockAvailability {
  if (status !== 'CONFIRMEE') {
    return { isEnabled: false }
  }

  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { isEnabled: false }
  }

  const now = Date.now()
  const availableAt = startDate.getTime() - (UNLOCK_EARLY_WINDOW_MINUTES * 60 * 1000)
  return { isEnabled: now >= availableAt && now <= endDate.getTime() }
}

export default function ClientVehicleUnlockPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const vehicleId = reservationQuery.data?.vehicle.id

  const vehicleQuery = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicleById(vehicleId!),
    enabled: typeof vehicleId === 'number' && vehicleId > 0,
  })

  const unlockAvailability = useMemo(() => {
    if (!reservationQuery.data) {
      return { isEnabled: false }
    }

    return getUnlockAvailability(
      reservationQuery.data.status,
      reservationQuery.data.start_at,
      reservationQuery.data.end_at,
    )
  }, [reservationQuery.data])

  const [isAlreadyUnlocked, setIsAlreadyUnlocked] = useState(false)

  const unlockSteps = [
    { order: 1, label: 'Deverrouillage', status: 'active' as const },
    { order: 2, label: 'Exterieur', status: 'future' as const },
    { order: 3, label: 'Interieur', status: 'future' as const },
    { order: 4, label: 'Confirmation', status: 'future' as const },
  ]

  const unlockMutation = useMutation({
    mutationFn: () => unlockVehicle(reservationId),
    onSuccess: () => {
      navigate(`/client/reservations/${reservationId}/departure-inspection`)
      setIsAlreadyUnlocked(false)
    },
    onError: (error) => {
      const payload = getErrorPayload(error)

      if (payload?.code === 'ALREADY_UNLOCKED') {
        setIsAlreadyUnlocked(true)
      }
    },
  })

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  if (reservationQuery.isLoading || vehicleQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement" />
      </section>
    )
  }

  if (reservationQuery.isError || !reservationQuery.data) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Chargement impossible" message="La reservation est introuvable ou inaccessible." className="mb-4" />
        <Link to="/client/reservations">
          <Button variant="secondary">Retour a mes reservations</Button>
        </Link>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
        <ReservationProgressBanner steps={unlockSteps} className="mb-6 sm:mb-8" />
      </div>

      <div className="mb-6 flex items-center justify-center gap-3">
        <div className="w-full text-center">
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Déverrouiller le véhicule</h1>
          <p className="mt-2 text-base sm:text-lg text-slate-600">
            Vous êtes à proximité du véhicule. Appuyez sur le bouton pour déverrouiller.
          </p>
        </div>
      </div>

      <div className="mx-auto flex max-w-xl flex-col items-center gap-5">
        <UnlockDetectionIllustration isDetected={unlockAvailability.isEnabled} />

        <div className={`w-full max-w-md rounded-2xl border px-4 py-3 text-center ${unlockAvailability.isEnabled ? 'border-[#86EFAC] bg-[#DCFCE7] text-[#166534]' : 'border-[#E2E8F0] bg-[#F8FAFC] text-slate-600'}`}>
          <p className="text-sm font-semibold">{unlockAvailability.isEnabled ? 'Signal détecté' : 'Signal non détecté'}</p>
          <p className="mt-1 text-sm">{unlockAvailability.isEnabled ? 'Vous pouvez déverrouiller le véhicule.' : 'Approchez-vous du véhicule pour lancer le déverrouillage.'}</p>
        </div>

        {isAlreadyUnlocked ? (
          <div className="w-full max-w-md rounded-2xl border border-[#86EFAC] bg-[#DCFCE7] px-4 py-3 text-center text-[#166534]">
            <p className="text-sm font-semibold">Véhicule déjà déverrouillé</p>
            <p className="mt-1 text-sm">Vous pouvez maintenant effectuer l'état des lieux de départ.</p>
          </div>
        ) : unlockMutation.isError ? (
          <Alert variant="danger" title="Deverrouillage impossible" message={toErrorMessage(unlockMutation.error)} />
        ) : null}

        <Button
          className="h-[52px] w-full max-w-md border-0 bg-[#F97316] text-base text-white hover:bg-[#EA580C] focus-visible:ring-[#F97316]"
          disabled={!unlockAvailability.isEnabled || unlockMutation.isPending}
          onClick={() => {
            if (isAlreadyUnlocked) {
              navigate(`/client/reservations/${reservationId}/departure-inspection`)
              return
            }

            void unlockMutation.mutateAsync()
          }}
        >
          {isAlreadyUnlocked
            ? "Continuer vers l'état des lieux"
            : unlockMutation.isPending
              ? 'Deverrouillage en cours...'
              : 'Déverrouiller le véhicule'}
        </Button>
      </div>
    </section>
  )
}
