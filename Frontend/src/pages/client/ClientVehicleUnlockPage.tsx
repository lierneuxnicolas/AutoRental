import { clientDisplay } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
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

export default function ClientVehicleUnlockPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
    refetchInterval: 30000,
  })

  const vehicleId = reservationQuery.data?.vehicle.id

  const vehicleQuery = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicleById(vehicleId!),
    enabled: typeof vehicleId === 'number' && vehicleId > 0,
  })

  const availability = reservationQuery.data?.unlock_availability
  const canUnlock = Boolean(availability?.allowed || availability?.code === 'ALREADY_UNLOCKED')

  const [isAlreadyUnlocked, setIsAlreadyUnlocked] = useState(false)

  const unlockSteps = [
    { order: 1, label: 'Deverrouillage', status: 'active' as const },
    { order: 2, label: 'Exterieur', status: 'future' as const },
    { order: 3, label: 'Interieur', status: 'future' as const },
    { order: 4, label: 'Etat du vehicule', status: 'future' as const },
    { order: 5, label: 'Confirmation', status: 'future' as const },
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
        <Alert variant="danger" title={t('client.reservation_invalide')} message={t('client.l_identifiant_de_reservation_est_invalide')} />
      </section>
    )
  }

  if (reservationQuery.isLoading || vehicleQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label={t('client.chargement_alt')} />
      </section>
    )
  }

  if (reservationQuery.isError || !reservationQuery.data) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title={t('client.chargement_impossible')} message={t('client.la_reservation_est_introuvable_ou_inaccessible')} className="mb-4" />
        <Link to="/client/reservations">
          <Button variant="secondary">{t('client.retour_a_mes_reservations')}</Button>
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
        <h1 className="mt-2 w-full text-center text-2xl font-semibold leading-snug text-[#0F172A] sm:text-3xl">
          {t('client.deverrouillez_votre_vehicule_avec_votre_smartphone')}
        </h1>
      </div>

      <div className="mx-auto flex max-w-xl flex-col items-center gap-5">
        <UnlockDetectionIllustration isDetected={canUnlock} />

        {!canUnlock && !isAlreadyUnlocked ? (
          <Alert variant="warning" title={t('client.deverrouillage_indisponible')} message={availability?.message ?? 'La disponibilité ne peut pas être vérifiée. Actualisez la page.'} />
        ) : null}

        {isAlreadyUnlocked ? (
          <div className="w-full max-w-md rounded-2xl border border-[#86EFAC] bg-[#DCFCE7] px-4 py-3 text-center text-sm font-semibold text-[#166534]">
            {t('client.vehicule_deverrouille')}
          </div>
        ) : null}

        {unlockMutation.isError && !isAlreadyUnlocked ? (
          <Alert variant="danger" title={t('client.deverrouillage_impossible')} message={clientDisplay(t, toErrorMessage(unlockMutation.error))} />
        ) : null}

        <Button
          className="h-[52px] w-full max-w-md border-0 bg-[#F97316] text-base text-white hover:bg-[#EA580C] focus-visible:ring-[#F97316]"
          disabled={(!canUnlock && !isAlreadyUnlocked) || unlockMutation.isPending}
          onClick={() => {
            if (isAlreadyUnlocked) {
              navigate(`/client/reservations/${reservationId}/departure-inspection`)
              return
            }

            unlockMutation.mutate()
          }}
        >
          {isAlreadyUnlocked
            ? t('client.continuer_vers_letat_des_lieux')
            : unlockMutation.isPending
              ? t('client.deverrouillage_en_cours')
              : t('client.deverrouiller_le_vehicule')}
        </Button>

        <p className="-mt-1 max-w-md text-center text-base leading-6 text-slate-700">
          {t('client.apres_le_deverrouillage_prenez_les_photos_et_completez_l_etat_du')}
        </p>
      </div>
    </section>
  )
}
