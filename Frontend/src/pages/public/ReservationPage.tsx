import { useEffect, useMemo, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Alert, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useAuth } from '../../hooks/useAuth'
import { getClientProfileMe, getClientProfileProgress } from '../../services/authService'
import { createReservation } from '../../services/reservationService'
import { getVehicleById, simulatePrice } from '../../services/vehicleService'
import { createReservationDeposit, createReservationPaymentIntent } from '../../services/paymentService'
import { getReservationById } from '../../services/reservationService'
import type { ReservationCreateRequest, ReservationCreateResponse } from '../../types/reservation'
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

type InsuranceKey = 'standard' | 'duo' | 'omnium'

type ReservationFlowParams = ReservationCreateRequest & {
  insurance: InsuranceKey
  insurancePrice: number
  estimatedTotal: number
}

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

const INSURANCE_LABELS: Record<InsuranceKey, string> = {
  standard: 'Standard',
  duo: 'Duo',
  omnium: 'Omnium',
}

const INSURANCE_DAILY_PRICE: Record<InsuranceKey, number> = {
  standard: 0,
  duo: 8,
  omnium: 25,
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

function toFiniteNumber(value: unknown): number | null {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return null
  }

  return parsedValue
}

function computeInsuranceDays(durationHours: string | number): number | null {
  const parsedHours = toFiniteNumber(durationHours)

  if (parsedHours === null || parsedHours <= 0) {
    return null
  }

  return Math.max(1, Math.ceil(parsedHours / 24))
}

function formatEuroAmount(value: string | number): string {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return `${value} €`
  }

  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(parsedValue)} €`
}

function formatDurationLabel(value: string | number): string {
  const parsedHours = toFiniteNumber(value)

  if (parsedHours === null || parsedHours <= 0) {
    return 'Durée indisponible'
  }

  const totalMinutes = Math.round(parsedHours * 60)
  const days = Math.floor(totalMinutes / (24 * 60))
  const remainingAfterDays = totalMinutes - days * 24 * 60
  const hours = Math.floor(remainingAfterDays / 60)
  const minutes = remainingAfterDays - hours * 60

  const parts: string[] = []

  if (days > 0) {
    parts.push(`${days} jour${days > 1 ? 's' : ''}`)
  }

  if (hours > 0) {
    parts.push(`${hours} heure${hours > 1 ? 's' : ''}`)
  }

  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`)
  }

  if (parts.length === 0) {
    return `${parsedHours.toFixed(2)} heure${parsedHours > 1 ? 's' : ''}`
  }

  return parts.join(' · ')
}

function formatInsuranceTypeLabel(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback
  }

  const normalized = value.toLowerCase()
  if (normalized === 'standard' || normalized === 'duo' || normalized === 'omnium') {
    return INSURANCE_LABELS[normalized as InsuranceKey]
  }

  return fallback
}

function mapInsuranceToBackend(insurance: InsuranceKey): 'STANDARD' | 'DUO' | 'OMNIUM' {
  switch (insurance) {
    case 'duo':
      return 'DUO'
    case 'omnium':
      return 'OMNIUM'
    default:
      return 'STANDARD'
  }
}

function readReservationFlowParams(searchParams: URLSearchParams): ReservationFlowParams | null {
  const vehicleIdRaw = searchParams.get('vehicleId')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const insuranceRaw = searchParams.get('insurance')
  const insurancePriceRaw = searchParams.get('insurancePrice')
  const estimatedTotalRaw = searchParams.get('estimatedTotal')

  if (!vehicleIdRaw || !start || !end || !insuranceRaw || !insurancePriceRaw || !estimatedTotalRaw) {
    return null
  }

  const normalizedInsurance = insuranceRaw.toLowerCase()
  if (normalizedInsurance !== 'standard' && normalizedInsurance !== 'duo' && normalizedInsurance !== 'omnium') {
    return null
  }

  const insurancePrice = toFiniteNumber(insurancePriceRaw)
  const estimatedTotal = toFiniteNumber(estimatedTotalRaw)

  if (insurancePrice === null || insurancePrice < 0 || estimatedTotal === null || estimatedTotal < 0) {
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
    insurance: normalizedInsurance,
    insurancePrice,
    estimatedTotal,
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

interface ReservationStripePaymentFormProps {
  isSubmitting: boolean
  onBack: () => void
  onSubmit: () => Promise<void>
}

function ReservationStripePaymentForm({ isSubmitting, onBack, onSubmit }: ReservationStripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const handleSubmit = async () => {
    if (!stripe || !elements || isSubmitting || isConfirming) {
      return
    }

    setIsConfirming(true)
    setPaymentError(null)

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      })

      if (result.error) {
        setPaymentError("Le paiement n'a pas pu être effectué. Vérifiez votre moyen de paiement ou essayez-en un autre.")
        return
      }

      await onSubmit()
    } catch (error) {
      setPaymentError(toErrorMessage(error))
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {paymentError ? <Alert variant="danger" title="Paiement refuse" message={paymentError} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting || isConfirming}>
          Retour
        </Button>
        <Button variant="danger" disabled={!stripe || isSubmitting || isConfirming} onClick={handleSubmit}>
          {isSubmitting || isConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" aria-label="Paiement en cours" />
              Paiement en cours...
            </span>
          ) : (
            'Procéder au paiement'
          )}
        </Button>
      </div>
    </div>
  )
}

export default function ReservationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedInsurance, setSelectedInsurance] = useState<InsuranceKey>('standard')
  const [createdReservation, setCreatedReservation] = useState<ReservationCreateResponse | null>(null)
  const [confirmedReservation, setConfirmedReservation] = useState<ReservationCreateResponse | null>(null)
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null)
  const [paymentSetupMessage, setPaymentSetupMessage] = useState<string | null>(null)
  const [paymentWorkflowError, setPaymentWorkflowError] = useState<string | null>(null)
  const [isPreparingPayment, setIsPreparingPayment] = useState(false)
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)
  const [confirmationState, setConfirmationState] = useState<'waiting' | 'confirmed' | 'timeout'>('waiting')
  const [confirmationPollingActive, setConfirmationPollingActive] = useState(false)

  const flowPayload = useMemo(() => readReservationFlowParams(searchParams), [searchParams])

  useEffect(() => {
    if (flowPayload) {
      setSelectedInsurance(flowPayload.insurance)
      setConfirmedReservation(null)
    }
  }, [flowPayload])

  const reservationPayload = useMemo<ReservationCreateRequest | null>(() => {
    if (!flowPayload) {
      return null
    }

    return {
      vehicle_id: flowPayload.vehicle_id,
      start_at: flowPayload.start_at,
      end_at: flowPayload.end_at,
      insurance_type: mapInsuranceToBackend(selectedInsurance),
    }
  }, [flowPayload, selectedInsurance])

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
      setCreatedReservation(reservation)
      setConfirmedReservation(null)
      setPaymentWorkflowError(null)
      setPaymentSetupMessage(null)
      setCurrentStep(4)
      void preparePayment(reservation.id)
    },
  })

  const depositAuthorizationMutation = useMutation({
    mutationFn: (reservationId: number) => createReservationDeposit(reservationId, { mode: 'STRIPE_TEST' }),
  })

  const paymentIntentMutation = useMutation({
    mutationFn: (reservationId: number) => createReservationPaymentIntent(reservationId),
  })

  const scrollToStep = (stepNumber: number) => {
    const element = stepRefs.current[stepNumber]

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const advanceToStep = (nextStep: number) => {
    setCurrentStep(nextStep)
    requestAnimationFrame(() => scrollToStep(nextStep))
  }

  const preparePayment = async (reservationId: number) => {
    setIsPreparingPayment(true)
    setPaymentWorkflowError(null)
    setPaymentSetupMessage(null)

    try {
      const depositResult = await depositAuthorizationMutation.mutateAsync(reservationId)
      const normalizedDepositStatus = depositResult.deposit_status.toUpperCase()

      if (normalizedDepositStatus !== 'AUTORISEE' && normalizedDepositStatus !== 'VALIDE') {
        throw new Error(depositResult.authorization_note || 'La caution Stripe a ete refusee.')
      }

      const paymentIntentResult = await paymentIntentMutation.mutateAsync(reservationId)

      if (!paymentIntentResult.client_secret) {
        throw new Error('Le backend n\'a pas retourne de client_secret Stripe.')
      }

      setPaymentClientSecret(paymentIntentResult.client_secret)
      setPaymentSetupMessage('Paiement pret. La caution reste distincte et sera verifiee plus tard.')
    } catch (error) {
      setPaymentWorkflowError(toErrorMessage(error))
    } finally {
      setIsPreparingPayment(false)
    }
  }

  const pollReservationConfirmation = async (reservationId: number): Promise<{ status: 'confirmed' | 'timeout'; data: ReservationCreateResponse | null }> => {
    const maxWaitTime = 30000 // 30 seconds
    const pollInterval = 2500 // 2.5 seconds
    const startTime = Date.now()

    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const refreshedReservation = await getReservationById(reservationId)

          if (refreshedReservation.status === 'CONFIRMEE') {
            resolve({ status: 'confirmed', data: refreshedReservation })
            return
          }

          const elapsedTime = Date.now() - startTime

          if (elapsedTime >= maxWaitTime) {
            resolve({ status: 'timeout', data: null })
            return
          }

          // Schedule next poll
          window.setTimeout(poll, pollInterval)
        } catch {
          // Continue polling on error (no need to inspect the error)
          const elapsedTime = Date.now() - startTime

          if (elapsedTime >= maxWaitTime) {
            resolve({ status: 'timeout', data: null })
            return
          }

          window.setTimeout(poll, pollInterval)
        }
      }

      poll()
    })
  }

  const handlePaymentSuccess = async () => {
    if (!createdReservation) {
      return
    }

    setIsConfirmingPayment(true)
    setConfirmationState('waiting')
    setConfirmationPollingActive(true)
    setPaymentWorkflowError(null)
    setPaymentSetupMessage('Paiement accepté. Confirmation du backend en cours...')

    try {
      // Advance to step 5 to show waiting state
      setCurrentStep(5)
      requestAnimationFrame(() => scrollToStep(5))

      const pollResult = await pollReservationConfirmation(createdReservation.id)

      if (pollResult.status === 'confirmed' && pollResult.data) {
        setConfirmedReservation(pollResult.data)
        setConfirmationState('confirmed')
        setConfirmationPollingActive(false)
        setPaymentSetupMessage(null)
        return
      }

      // Timeout reached
      setConfirmationState('timeout')
      setConfirmationPollingActive(false)
      setPaymentWorkflowError(null)
    } catch (error) {
      setPaymentWorkflowError(toErrorMessage(error))
      setConfirmationState('timeout')
      setConfirmationPollingActive(false)
    } finally {
      setIsConfirmingPayment(false)
    }
  }

  const insuranceOptions = [
    { key: 'standard' as const, label: 'Standard', description: 'Assurance de base, 1 conducteur' },
    { key: 'duo' as const, label: 'Duo', description: 'Assurance de base + 1 conducteur additionnel' },
    { key: 'omnium' as const, label: 'Omnium', description: 'Protection renforcée + franchise réduite' },
  ]

  if (!flowPayload || !reservationPayload) {
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
              message="Les parametres vehicleId, start, end, insurance, insurancePrice et estimatedTotal sont requis et doivent etre valides."
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

  const insuranceDays = simulationQuery.data ? computeInsuranceDays(simulationQuery.data.duration_hours) : null
  const computedInsuranceAmount = simulationQuery.data ? toFiniteNumber(simulationQuery.data.insurance_amount) : null
  const computedTotalAmount = simulationQuery.data ? toFiniteNumber(simulationQuery.data.total_amount) : null
  const insurancePriceDelta = computedInsuranceAmount !== null
    ? Math.abs(computedInsuranceAmount - flowPayload.insurancePrice)
    : null
  const totalsMatchSimulationStep = computedTotalAmount !== null
    && insurancePriceDelta !== null
    && Math.abs(computedTotalAmount - flowPayload.estimatedTotal) < 0.001
    && insurancePriceDelta < 0.001
  const hasInsurancePricing = computedInsuranceAmount !== null
  const canConfirmWithInsurance = canConfirmReservation && hasInsurancePricing && totalsMatchSimulationStep

  useEffect(() => {
    if (currentStep !== 4) {
      return
    }

    if (!canConfirmWithInsurance || !reservationPayload) {
      return
    }

    if (createdReservation || createReservationMutation.isPending || depositAuthorizationMutation.isPending || paymentIntentMutation.isPending) {
      return
    }

    void createReservationMutation.mutateAsync(reservationPayload)
  }, [
    canConfirmWithInsurance,
    createReservationMutation,
    currentStep,
    createdReservation,
    depositAuthorizationMutation.isPending,
    paymentIntentMutation.isPending,
    reservationPayload,
  ])

  const selectedInsuranceLabel = insuranceOptions.find((option) => option.key === selectedInsurance)?.label ?? INSURANCE_LABELS[selectedInsurance as InsuranceKey]
  const confirmationReservation = confirmedReservation ?? createdReservation
  const reservationPaidAmount = confirmationReservation?.total_amount ?? simulationQuery.data?.total_amount ?? flowPayload.estimatedTotal
  const reservationDepositAmount = confirmationReservation?.deposit_amount ?? simulationQuery.data?.deposit_amount ?? flowPayload.insurancePrice
  const reservationInsuranceLabel = confirmationReservation?.insurance_type
    ? INSURANCE_LABELS[confirmationReservation.insurance_type.toLowerCase() as InsuranceKey] ?? selectedInsuranceLabel
    : selectedInsuranceLabel
  const paymentVehicleLabel = vehicleQuery.data
    ? `${vehicleQuery.data.brand} ${vehicleQuery.data.model_name}`
    : 'Véhicule indisponible'
  const paymentDurationLabel = simulationQuery.data
    ? formatDurationLabel(simulationQuery.data.duration_hours)
    : 'Durée indisponible'
  const paymentInsuranceLabel = simulationQuery.data
    ? formatInsuranceTypeLabel(simulationQuery.data.insurance_type, reservationInsuranceLabel)
    : reservationInsuranceLabel
  const paymentRentalAmount = simulationQuery.data
    ? formatEuroAmount(simulationQuery.data.rental_amount)
    : 'Montant indisponible'
  const paymentInsuranceAmount = simulationQuery.data
    ? formatEuroAmount(simulationQuery.data.insurance_amount)
    : 'Montant indisponible'
  const paymentTotalAmount = simulationQuery.data
    ? formatEuroAmount(simulationQuery.data.total_amount)
    : 'Montant indisponible'
  const paymentDepositAmount = simulationQuery.data
    ? formatEuroAmount(simulationQuery.data.deposit_amount)
    : '500 €'

  return (
    <section className="py-8 sm:py-10" aria-labelledby="reservation-page-title">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 id="reservation-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Reservation
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Completez votre reservation en plusieurs étapes, sans quitter la page.
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
          <div className="mt-8 space-y-6">
            <div
              ref={(node) => {
                stepRefs.current[1] = node
              }}
              className="scroll-mt-24"
            >
              <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 1 · Choix de l’assurance</h2>}>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {insuranceOptions.map((option) => {
                      const isSelected = selectedInsurance === option.key

                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setSelectedInsurance(option.key)}
                          className={[
                            'rounded-2xl border p-4 text-left transition-all',
                            isSelected
                              ? 'border-[#F97316] bg-orange-50 ring-2 ring-[#FDBA74]'
                              : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40',
                          ].join(' ')}
                        >
                          <span className="block text-base font-semibold text-[#1F2937]">{option.label}</span>
                          <span className="mt-2 block text-sm text-slate-600">{option.description}</span>
                          <span className="mt-3 block text-sm font-medium text-[#EA580C]">
                            {formatCurrency(insuranceDays !== null ? insuranceDays * INSURANCE_DAILY_PRICE[option.key] : 0)}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="danger"
                      onClick={() => advanceToStep(2)}
                      disabled={selectedInsurance === null}
                    >
                      Valider l’assurance
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {currentStep >= 2 ? (
              <div
                ref={(node) => {
                  stepRefs.current[2] = node
                }}
                className="scroll-mt-24"
              >
                <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 2 · Récapitulatif</h2>}>
                  <div className="space-y-4">
                    <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Véhicule</p>
                        <p className="mt-1 text-lg font-semibold text-[#1F2937]">
                          {vehicleQuery.data.brand} {vehicleQuery.data.model_name}
                        </p>
                        <p className="text-sm text-slate-600">{vehicleQuery.data.category}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Période</p>
                        <p className="mt-1 text-sm text-slate-700">{formatDateTimeLabel(reservationPayload.start_at)}</p>
                        <p className="text-sm text-slate-700">{formatDateTimeLabel(reservationPayload.end_at)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-600">Location</span>
                        <span className="font-semibold text-[#1F2937]">{formatCurrency(simulationQuery.data.rental_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-600">Assurance</span>
                        <span className="font-semibold text-[#1F2937]">{selectedInsuranceLabel}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-600">Prix assurance</span>
                        <span className="font-semibold text-[#1F2937]">
                          {computedInsuranceAmount !== null ? formatCurrency(computedInsuranceAmount) : 'Tarif indisponible'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-600">Caution</span>
                        <span className="font-semibold text-[#1F2937]">{formatCurrency(simulationQuery.data.deposit_amount)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
                        <span className="text-base font-semibold text-[#1F2937]">Total estimé</span>
                        <span className="text-xl font-semibold text-[#2563EB]">
                          {computedTotalAmount !== null ? formatCurrency(computedTotalAmount) : formatCurrency(simulationQuery.data.total_amount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button variant="secondary" onClick={() => advanceToStep(3)}>
                        Valider le récapitulatif
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {currentStep >= 3 ? (
              <div
                ref={(node) => {
                  stepRefs.current[3] = node
                }}
                className="scroll-mt-24"
              >
                <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 3 · Confirmation</h2>}>
                  <div className="space-y-4">
                    {!isAuthenticated && !isAuthLoading ? (
                      <Alert
                        variant="info"
                        title="Connexion requise"
                        message="Vous devez vous connecter avant de finaliser la réservation."
                      />
                    ) : null}

                    {isAuthenticated && isLoadingEligibility ? (
                      <Alert
                        variant="info"
                        title="Vérification du profil"
                        message="Vérification de votre éligibilité à la réservation en cours..."
                      />
                    ) : null}

                    {eligibilityError ? (
                      <Alert
                        variant="danger"
                        title="Vérification du profil impossible"
                        message={toErrorMessage(eligibilityError)}
                      />
                    ) : null}

                    {isAuthenticated && !isLoadingEligibility && !eligibilityError && profileEligibility && !profileEligibility.canReserve ? (
                      <Alert
                        variant="warning"
                        title="Profil client incomplet ou non valide"
                        message={(
                          <div className="space-y-3">
                            <p>Votre profil ne permet pas encore de confirmer cette réservation.</p>
                            <ul className="list-disc space-y-1 pl-5">
                              {profileEligibility.reasons.map((reason) => (
                                <li key={reason.key}>{reason.label}</li>
                              ))}
                            </ul>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button variant="secondary" onClick={() => navigate('/client/profile')}>
                                Compléter mon profil
                              </Button>
                              {profileEligibility.shouldShowDocumentsCta ? (
                                <Button variant="secondary" onClick={() => navigate('/client/profile')}>
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
                        message="Votre profil est valide. Vous pouvez passer à la dernière étape."
                      />
                    ) : null}

                    {isAuthenticated && !isLoadingData && !dataError && !hasInsurancePricing ? (
                      <Alert
                        variant="warning"
                        title="Durée indisponible"
                        message="Impossible de calculer le prix de l'assurance à partir de la durée retournée par la simulation."
                      />
                    ) : null}

                    {isAuthenticated && !isLoadingData && !dataError && hasInsurancePricing && !totalsMatchSimulationStep ? (
                      <Alert
                        variant="warning"
                        title="Contrôle de cohérence échoué"
                        message="Les montants transmis depuis la simulation ne correspondent pas au recalcul actuel. Revenez à la simulation et recommencez."
                      />
                    ) : null}

                    {createReservationMutation.isError ? (
                      <Alert
                        variant="danger"
                        title="Réservation impossible"
                        message={toErrorMessage(createReservationMutation.error)}
                      />
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        variant="danger"
                        onClick={() => advanceToStep(4)}
                        disabled={createReservationMutation.isPending || isAuthLoading || (!isAuthenticated && !isAuthLoading)}
                      >
                        Valider la confirmation
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {currentStep >= 4 && currentStep < 5 ? (
              <div
                ref={(node) => {
                  stepRefs.current[4] = node
                }}
                className="scroll-mt-24"
              >
                <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 4 · Paiement</h2>}>
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">1. Votre réservation</p>
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Véhicule</p>
                              <p className="mt-1 text-base font-semibold text-[#1F2937]">{paymentVehicleLabel}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Assurance</p>
                              <p className="mt-1 text-base font-semibold text-[#1F2937]">{paymentInsuranceLabel}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Début</p>
                              <p className="mt-1 text-sm text-slate-700">{formatDateTimeLabel(reservationPayload.start_at)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fin</p>
                              <p className="mt-1 text-sm text-slate-700">{formatDateTimeLabel(reservationPayload.end_at)}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Durée</p>
                              <p className="mt-1 text-sm text-slate-700">{paymentDurationLabel}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">2. À payer</p>
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                              <span>Location</span>
                              <span className="font-semibold text-[#1F2937]">{paymentRentalAmount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                              <span>Assurance</span>
                              <span className="font-semibold text-[#1F2937]">{paymentInsuranceAmount}</span>
                            </div>
                            <div className="border-t border-slate-200 pt-3" />
                            <div className="flex items-center justify-between gap-3 text-base font-semibold text-[#1F2937]">
                              <span>Total à payer</span>
                              <span className="text-xl text-[#2563EB]">{paymentTotalAmount}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 sm:p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">3. Caution</p>
                          <p className="mt-3 text-xl font-semibold text-[#1F2937]">Caution : {paymentDepositAmount}</p>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            Une préautorisation de {paymentDepositAmount} sera effectuée séparément. Cette somme n'est pas comprise dans le prix de la location et n'est pas débitée comme un paiement de location.
                          </p>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            Après la restitution, le véhicule et les photos de l'état des lieux seront contrôlés par un gestionnaire. Si le retour est conforme, la caution sera libérée.
                          </p>
                        </div>

                        <Alert
                          variant="success"
                          title="4. Éligibilité"
                          message="Votre profil est conforme. Vous pouvez procéder au paiement."
                        />
                      </div>
                    </div>

                    {!isAuthenticated && !isAuthLoading ? (
                      <>
                        <Alert
                          variant="info"
                          title="Connexion ou inscription requise"
                          message="Pour finaliser votre réservation, connectez-vous ou créez un compte."
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button variant="danger" onClick={() => navigate('/login', { state: { from: `${location.pathname}${location.search}` } })}>
                            Se connecter
                          </Button>
                          <Button variant="secondary" onClick={() => navigate('/register', { state: { from: `${location.pathname}${location.search}` } })}>
                            Créer un compte
                          </Button>
                        </div>
                      </>
                    ) : !stripePromise || !stripePublishableKey ? (
                      <Alert
                        variant="danger"
                        title="Configuration Stripe manquante"
                        message="La variable VITE_STRIPE_PUBLISHABLE_KEY doit etre definie pour activer le paiement Stripe Test."
                      />
                    ) : isPreparingPayment ? (
                      <Alert
                        variant="info"
                        title="Préparation du paiement"
                        message="Le backend autorise la caution de 500 EUR puis prépare le PaymentIntent de location."
                      />
                    ) : paymentWorkflowError ? (
                      <Alert variant="danger" title="Paiement impossible" message={paymentWorkflowError} />
                    ) : !createdReservation || !paymentClientSecret ? (
                      <Alert
                        variant="info"
                        title="Préparation en cours"
                        message="La réservation est en cours de création puis le paiement Stripe Test est préparé par le backend."
                      />
                    ) : (
                      <>
                        {paymentSetupMessage ? (
                          <Alert variant="success" title="Paiement préparé" message={paymentSetupMessage} />
                        ) : null}

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">5. Actions</p>
                          <p className="mt-2 text-sm text-slate-600">
                            Vérifiez ce récapitulatif. Le paiement Stripe Test de la location et de l'assurance sera confirmé ci-dessous, sans jamais ajouter la caution au total affiché.
                          </p>
                        </div>

                        <Elements
                          stripe={stripePromise}
                          options={{
                            clientSecret: paymentClientSecret,
                            appearance: {
                              theme: 'stripe',
                              variables: {
                                colorPrimary: '#2563EB',
                                colorBackground: '#FFFFFF',
                                colorText: '#1F2937',
                                colorDanger: '#EF4444',
                                fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                borderRadius: '16px',
                              },
                              rules: {
                                '.Input': {
                                  border: '1px solid #E2E8F0',
                                  boxShadow: 'none',
                                },
                              },
                            },
                          }}
                        >
                          <ReservationStripePaymentForm
                            isSubmitting={isConfirmingPayment}
                            onBack={() => advanceToStep(3)}
                            onSubmit={handlePaymentSuccess}
                          />
                        </Elements>
                      </>
                    )}
                  </div>
                </Card>

              {currentStep >= 5 && confirmedReservation ? (
                <div
                  ref={(node) => {
                    stepRefs.current[5] = node
                  }}
                  className="scroll-mt-24"
                >
                  <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 5 · Confirmation</h2>}>
                    <div className="space-y-4">
                      <Alert
                        variant="success"
                          title="Réservation confirmée"
                        message={(
                            <div className="space-y-2">
                              <p><span className="font-semibold">Paiement :</span> réussi</p>
                              <p><span className="font-semibold">Caution :</span> {formatEuroAmount(reservationDepositAmount)} préautorisés</p>
                              <p>La caution restera en attente jusqu'au contrôle du véhicule après sa restitution.</p>
                          </div>
                        )}
                      />
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
                          <div>
                            <p className="font-medium text-[#1F2937]">Numéro de réservation</p>
                            <p className="mt-1">{confirmedReservation.reference}</p>
                          </div>
                          <div>
                            <p className="font-medium text-[#1F2937]">Véhicule</p>
                            <p className="mt-1">{confirmedReservation.vehicle.brand} {confirmedReservation.vehicle.model_name}</p>
                          </div>
                          <div>
                            <p className="font-medium text-[#1F2937]">Date/heure début</p>
                            <p className="mt-1">{formatDateTimeLabel(confirmedReservation.start_at)}</p>
                          </div>
                          <div>
                            <p className="font-medium text-[#1F2937]">Date/heure fin</p>
                            <p className="mt-1">{formatDateTimeLabel(confirmedReservation.end_at)}</p>
                          </div>
                          <div>
                            <p className="font-medium text-[#1F2937]">Assurance</p>
                            <p className="mt-1">{reservationInsuranceLabel}</p>
                          </div>
                          <div>
                            <p className="font-medium text-[#1F2937]">Montant payé</p>
                            <p className="mt-1">{formatEuroAmount(reservationPaidAmount)}</p>
                          </div>
                          <div>
                            <p className="font-medium text-[#1F2937]">Statut de réservation</p>
                            <p className="mt-1">{confirmedReservation.status}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button variant="primary" onClick={() => navigate(`/client/reservations/${confirmedReservation.id}`)}>
                            Voir ma réservation
                          </Button>
                          <Button variant="secondary" onClick={() => navigate('/')}>
                            Retour à l'accueil
                          </Button>
                        </div>
                    </div>
                  </Card>
                </div>
                ) : currentStep >= 5 && confirmationState === 'waiting' && confirmationPollingActive ? (
                  <div
                    ref={(node) => {
                      stepRefs.current[5] = node
                    }}
                    className="scroll-mt-24"
                  >
                    <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 5 · Confirmation</h2>}>
                      <div className="space-y-4">
                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                          <LoadingSpinner size="lg" aria-label="Confirmation de votre réservation en cours" />
                          <p className="text-center text-lg font-medium text-[#1F2937]">
                            Confirmation de votre réservation en cours…
                          </p>
                          <p className="text-center text-sm text-slate-600">
                            Veuillez patienter quelques instants. Nous vérifions que votre paiement et votre réservation sont confirmés par le backend.
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                ) : currentStep >= 5 && confirmationState === 'timeout' ? (
                  <div
                    ref={(node) => {
                      stepRefs.current[5] = node
                    }}
                    className="scroll-mt-24"
                  >
                    <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 5 · Confirmation</h2>}>
                      <div className="space-y-4">
                        <Alert
                          variant="warning"
                          title="Confirmation en attente"
                          message="La confirmation de votre réservation prend plus de temps que prévu. Votre paiement a été reçu en toute sécurité. Veuillez actualiser le statut ou réessayer dans quelques instants."
                        />
                        <div className="flex gap-3">
                          <Button
                            variant="danger"
                            onClick={() => {
                              setConfirmationState('waiting')
                              setConfirmationPollingActive(true)
                              if (createdReservation) {
                                void handlePaymentSuccess()
                              }
                            }}
                          >
                            Actualiser le statut
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                ) : currentStep >= 5 ? (
                  <div
                    ref={(node) => {
                      stepRefs.current[5] = node
                    }}
                    className="scroll-mt-24"
                  >
                    <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 5 · Confirmation</h2>}>
                      <Alert
                        variant="info"
                        title="Confirmation en cours"
                        message="Le backend finalise encore la confirmation de votre paiement et de la préautorisation."
                      />
                    </Card>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
