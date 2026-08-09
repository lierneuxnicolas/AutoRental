import { useMemo } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useAuth } from '../../hooks/useAuth'
import { getClientProfileMe, getClientProfileProgress } from '../../services/authService'
import { createReservation } from '../../services/reservationService'
import { getVehicleById, simulatePrice } from '../../services/vehicleService'
import type { ReservationCreateRequest } from '../../types/reservation'
import type { ClientProfileMe, ClientProfileProgress } from '../../types/auth'

type ApiErrorPayload = {
  detail?: string
  non_field_errors?: string[]
  [key: string]: unknown
}

type ProfileEligibilityReason = {
  key: string
  label: string
}

type ProfileEligibility = {
  canReserve: boolean
  reasons: ProfileEligibilityReason[]
  shouldShowDocumentsCta: boolean
}

function formatDateTimeLabel(value: string): string {
  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return value
  }

  return parsedValue.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatCurrency(value: string | number): string {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return `${value} EUR`
  }

  return `${parsedValue.toFixed(2)} EUR`
}

function readReservationParams(searchParams: URLSearchParams): ReservationCreateRequest | null {
  const vehicleIdRaw = searchParams.get('vehicleId')
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!vehicleIdRaw || !start || !end) {
    return null
  }

  const vehicleId = Number(vehicleIdRaw)

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return null
  }

  const startDate = new Date(start)
  const endDate = new Date(end)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return null
  }

  return {
    vehicle_id: vehicleId,
    start_at: start,
    end_at: end,
  }
}

function toErrorMessage(error: unknown): string {
  const fallback = 'Une erreur est survenue. Veuillez reessayer.'

  const axiosError = error as AxiosError<ApiErrorPayload>
  const payload = axiosError.response?.data

  if (!payload) {
    return fallback
  }

  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length > 0) {
    return payload.non_field_errors.join(' ')
  }

  const fieldEntries = Object.entries(payload).filter(([key, value]) => key !== 'detail' && key !== 'non_field_errors' && Array.isArray(value) && value.length > 0)

  if (fieldEntries.length > 0) {
    const [field, messages] = fieldEntries[0]
    const firstMessage = String((messages as unknown[])[0])
    return `${field}: ${firstMessage}`
  }

  return fallback
}

function buildProfileEligibility(
  profile: ClientProfileMe | undefined,
  progress: ClientProfileProgress | undefined,
): ProfileEligibility {
  if (!profile || !progress) {
    return {
      canReserve: false,
      reasons: [
        {
          key: 'PROFILE_LOADING_FAILED',
          label: 'Impossible de verifier votre profil client pour le moment.',
        },
      ],
      shouldShowDocumentsCta: true,
    }
  }

  const reasons: ProfileEligibilityReason[] = []

  if (!progress.email_verified) {
    reasons.push({ key: 'EMAIL_NOT_VERIFIED', label: 'E-mail non verifie.' })
  }

  if (!progress.personal_information_complete) {
    reasons.push({ key: 'PROFILE_INCOMPLETE', label: 'Informations personnelles incompletes.' })
  }

  if (!progress.identity_card_valid) {
    reasons.push({ key: 'IDENTITY_CARD_INVALID', label: "Carte d'identite manquante ou non validee." })
  }

  if (!progress.driving_license_valid) {
    reasons.push({ key: 'DRIVING_LICENSE_INVALID', label: 'Permis manquant ou non valide.' })
  }

  if (profile.profile_status === 'EN_ATTENTE_VALIDATION') {
    reasons.push({ key: 'PROFILE_PENDING_VALIDATION', label: 'Documents en attente de validation.' })
  }

  if (profile.profile_status === 'REFUSE') {
    const refusalReason = profile.rejection_reason?.trim()
    reasons.push({
      key: 'PROFILE_REJECTED',
      label: refusalReason ? `Profil refuse: ${refusalReason}` : 'Profil refuse.',
    })
  }

  const canReserve = reasons.length === 0 && profile.profile_status === 'VALIDE'
  const shouldShowDocumentsCta = !progress.identity_card_valid || !progress.driving_license_valid || profile.profile_status === 'EN_ATTENTE_VALIDATION'

  return {
    canReserve,
    reasons,
    shouldShowDocumentsCta,
  }
}

export default function ReservationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()

  const reservationPayload = useMemo(() => readReservationParams(searchParams), [searchParams])

  const vehicleQuery = useQuery({
    queryKey: ['reservation-vehicle', reservationPayload?.vehicle_id],
    queryFn: () => getVehicleById(reservationPayload!.vehicle_id),
    enabled: Boolean(reservationPayload),
  })

  const simulationQuery = useQuery({
    queryKey: ['reservation-simulation', reservationPayload?.vehicle_id, reservationPayload?.start_at, reservationPayload?.end_at],
    queryFn: () => simulatePrice(reservationPayload!),
    enabled: Boolean(reservationPayload),
  })

  const profileQuery = useQuery({
    queryKey: ['client-profile-me', isAuthenticated],
    queryFn: getClientProfileMe,
    enabled: isAuthenticated,
  })

  const profileProgressQuery = useQuery({
    queryKey: ['client-profile-progress', isAuthenticated],
    queryFn: getClientProfileProgress,
    enabled: isAuthenticated,
  })

  const createReservationMutation = useMutation({
    mutationFn: (payload: ReservationCreateRequest) => createReservation(payload),
    onSuccess: (reservation) => {
      navigate(`/payment?reservationId=${reservation.id}`)
    },
  })

  const handleConfirmReservation = () => {
    if (!reservationPayload) {
      return
    }

    if (!isAuthenticated) {
      navigate('/login', {
        state: {
          from: `${location.pathname}${location.search}`,
        },
      })
      return
    }

    const eligibility = buildProfileEligibility(profileQuery.data, profileProgressQuery.data)
    if (!eligibility.canReserve) {
      return
    }

    createReservationMutation.mutate(reservationPayload)
  }

  if (!reservationPayload) {
    return (
      <section className="py-8 sm:py-10" aria-labelledby="reservation-page-title">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 id="reservation-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Reservation
          </h1>
          <div className="mt-6">
            <Alert
              variant="danger"
              title="Parametres invalides"
              message="Les parametres vehicleId, start et end sont requis et doivent etre valides pour creer une reservation."
            />
          </div>
        </div>
      </section>
    )
  }

  const isLoadingData = vehicleQuery.isLoading || simulationQuery.isLoading
  const isLoadingEligibility = isAuthenticated && (profileQuery.isLoading || profileProgressQuery.isLoading)
  const dataError = vehicleQuery.error ?? simulationQuery.error
  const eligibilityError = isAuthenticated ? (profileQuery.error ?? profileProgressQuery.error) : null
  const profileEligibility = isAuthenticated && !eligibilityError
    ? buildProfileEligibility(profileQuery.data, profileProgressQuery.data)
    : null
  const canConfirmReservation = Boolean(
    isAuthenticated
    && !isAuthLoading
    && !isLoadingEligibility
    && !eligibilityError
    && profileEligibility?.canReserve,
  )

  return (
    <section className="py-8 sm:py-10" aria-labelledby="reservation-page-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 id="reservation-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Reservation
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Verifiez vos informations puis confirmez votre reservation.
          </p>
        </header>

        {isLoadingData ? (
          <div className="mt-8 flex justify-center">
            <LoadingSpinner aria-label="Chargement des informations de reservation" size="lg" />
          </div>
        ) : null}

        {!isLoadingData && dataError ? (
          <div className="mt-6">
            <Alert variant="danger" title="Impossible de preparer la reservation" message={toErrorMessage(dataError)} />
          </div>
        ) : null}

        {!isLoadingData && !dataError && vehicleQuery.data && simulationQuery.data ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Recapitulatif</h2>}>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Vehicule</p>
                  <p className="mt-1 text-xl font-semibold text-[#1F2937]">
                    {vehicleQuery.data.brand} {vehicleQuery.data.model_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{vehicleQuery.data.category}</p>
                </div>

                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Periode</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTimeLabel(reservationPayload.start_at)}</p>
                    <p className="text-sm text-slate-700">{formatDateTimeLabel(reservationPayload.end_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Duree</p>
                    <p className="mt-1 text-sm text-slate-700">{simulationQuery.data.duration_hours} heures</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Location</span>
                    <span className="font-semibold text-[#1F2937]">{formatCurrency(simulationQuery.data.rental_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Caution</span>
                    <span className="font-semibold text-[#1F2937]">{formatCurrency(simulationQuery.data.deposit_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Assurance incluse</span>
                    <span className="font-semibold text-[#1F2937]">{simulationQuery.data.insurance_included ? 'Oui' : 'Non'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-base font-semibold text-[#1F2937]">Total estime</span>
                    <span className="text-xl font-semibold text-[#2563EB]">{formatCurrency(simulationQuery.data.total_amount)}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Confirmation</h2>}>
              <div className="space-y-3">
                {!isAuthenticated && !isAuthLoading ? (
                  <Alert
                    variant="info"
                    title="Connexion requise"
                    message="Connectez-vous pour confirmer la reservation. Vous reviendrez automatiquement sur cette page apres connexion."
                  />
                ) : null}

                {isAuthenticated && isLoadingEligibility ? (
                  <Alert
                    variant="info"
                    title="Verification du profil"
                    message="Verification de votre eligibilite a la reservation en cours..."
                  />
                ) : null}

                {eligibilityError ? (
                  <Alert
                    variant="danger"
                    title="Verification du profil impossible"
                    message={toErrorMessage(eligibilityError)}
                  />
                ) : null}

                {isAuthenticated && !isLoadingEligibility && !eligibilityError && profileEligibility && !profileEligibility.canReserve ? (
                  <Alert
                    variant="warning"
                    title="Profil client incomplet ou non valide"
                    message={(
                      <div className="space-y-3">
                        <p>Votre profil ne permet pas encore de confirmer cette reservation.</p>
                        <ul className="list-disc space-y-1 pl-5">
                          {profileEligibility.reasons.map((reason) => (
                            <li key={reason.key}>{reason.label}</li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button variant="secondary" onClick={() => navigate('/client/profile')}>
                            Completer mon profil
                          </Button>
                          {profileEligibility.shouldShowDocumentsCta ? (
                            <Button variant="secondary" onClick={() => navigate('/client/documents')}>
                              Ajouter mes documents
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  />
                ) : null}

                {isAuthenticated && !isLoadingEligibility && !eligibilityError && profileEligibility?.canReserve ? (
                  <Alert
                    variant="success"
                    title="Profil valide"
                    message="Votre profil est valide. Vous pouvez confirmer la reservation."
                  />
                ) : null}

                {createReservationMutation.isError ? (
                  <Alert
                    variant="danger"
                    title="Reservation impossible"
                    message={toErrorMessage(createReservationMutation.error)}
                  />
                ) : null}

                {createReservationMutation.isSuccess ? (
                  <Alert
                    variant="success"
                    title="Reservation creee"
                    message="Redirection vers le paiement..."
                  />
                ) : null}

                <Button
                  variant="danger"
                  className="w-full"
                  onClick={handleConfirmReservation}
                  disabled={createReservationMutation.isPending || isAuthLoading || !canConfirmReservation}
                >
                  {createReservationMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <LoadingSpinner size="sm" aria-label="Creation de reservation en cours" />
                      Confirmation en cours...
                    </span>
                  ) : (
                    'Confirmer la reservation'
                  )}
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </section>
  )
}
