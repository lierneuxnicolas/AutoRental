import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { getClientProfileMe, getClientProfileProgress } from '../../services/authService'
import { createReservationDeposit, createReservationPaymentIntent } from '../../services/paymentService'
import { createReservation, getReservationById } from '../../services/reservationService'
import { getVehicleById, simulatePrice } from '../../services/vehicleService'
import type { ReservationCreateRequest, ReservationCreateResponse } from '../../types/reservation'
import type { PublicVehicle, VehiclePhoto } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null
const RESERVATION_CONFIRMATION_POLL_COUNT = 5
const RESERVATION_CONFIRMATION_POLL_DELAY_MS = 3000

function statusToBadge(status: string): { label: string; variant: StatusVariant } {
  const upperStatus = status.toUpperCase()

  if (upperStatus === 'DISPONIBLE') {
    return { label: 'Disponible', variant: 'success' }
  }

  if (upperStatus === 'LOUE') {
    return { label: 'Loue', variant: 'warning' }
  }

  if (upperStatus === 'INDISPONIBLE') {
    return { label: 'Indisponible', variant: 'danger' }
  }

  const lowered = status.replaceAll('_', ' ').toLowerCase()
  const label = lowered.charAt(0).toUpperCase() + lowered.slice(1)
  return { label, variant: 'neutral' }
}

function buildGallery(vehicle: PublicVehicle): { main: VehiclePhoto | null; secondary: VehiclePhoto[] } {
  const secondaryPhotos = vehicle.photos.filter((photo) => {
    if (!vehicle.main_photo) {
      return true
    }

    return photo.id !== vehicle.main_photo.id
  })

  return {
    main: vehicle.main_photo,
    secondary: secondaryPhotos,
  }
}

function formatRate(rate: string): string {
  const parsedRate = Number(rate)
  if (!Number.isFinite(parsedRate)) {
    return `À partir de ${rate} € / jour`
  }

  const formatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

  return `À partir de ${formatter.format(parsedRate)} € / jour`
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Non renseigné'
  }

  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non'
  }

  return String(value)
}

function getVehicleField(vehicle: PublicVehicle, keys: string[]): string {
  const record = vehicle as unknown as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && value !== '') {
      return formatValue(value)
    }
  }

  return 'Non renseigné'
}

function buildTabEntry(label: string, value: string): { label: string; value: string } {
  return { label, value: value || 'Non renseigné' }
}

function formatNumberFr(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCurrencyFr(value: number | string | null | undefined) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return null
  }

  return `${formatNumberFr(numericValue)} €`
}

function formatDateTimeFr(value: string | null): string {
  if (!value) {
    return 'Non renseigné'
  }

  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) {
    return 'Non renseigné'
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function formatDurationFromHours(hours: string | number | null | undefined, fallbackDays: number): string {
  const parsedHours = Number(hours)

  if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
    if (fallbackDays > 0) {
      return `${fallbackDays} jour${fallbackDays > 1 ? 's' : ''}`
    }
    return 'Non renseignée'
  }

  const dayCount = parsedHours / 24
  if (Number.isInteger(dayCount)) {
    return `${dayCount} jour${dayCount > 1 ? 's' : ''}`
  }

  return `${formatNumberFr(parsedHours)} heure${parsedHours > 1 ? 's' : ''}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function mapInsuranceToBackend(insurance: InsuranceOptionKey | null): 'STANDARD' | 'DUO' | 'OMNIUM' | null {
  if (insurance === 'duo') {
    return 'DUO'
  }

  if (insurance === 'omnium') {
    return 'OMNIUM'
  }

  if (insurance === 'standard') {
    return 'STANDARD'
  }

  return null
}

function mapInsuranceToUi(insuranceType: string | null | undefined): InsuranceOptionKey | null {
  const normalizedType = insuranceType?.toUpperCase()

  if (normalizedType === 'DUO') {
    return 'duo'
  }

  if (normalizedType === 'OMNIUM') {
    return 'omnium'
  }

  if (normalizedType === 'STANDARD') {
    return 'standard'
  }

  return null
}

type StripePaymentFormProps = {
  isSubmitting: boolean
  onBack: () => void
  returnUrl: string
  onSubmit: (paymentStatus?: string) => Promise<void>
}

function StripePaymentForm({ isSubmitting, onBack, returnUrl, onSubmit }: StripePaymentFormProps) {
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
          return_url: returnUrl,
        },
        redirect: 'if_required',
      })

      if (result.error) {
        setPaymentError(result.error.message ?? 'Le paiement a ete refuse. Verifiez votre moyen de paiement et reessayez.')
        return
      }

      await onSubmit(result.paymentIntent?.status)
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>
      setPaymentError(axiosError.response?.data?.detail || 'Le paiement n\'a pas pu etre confirme. Veuillez reessayer.')
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
            paymentMethodOrder: ['card', 'bancontact'],
            wallets: {
              applePay: 'never',
              googlePay: 'never',
              link: 'never',
            },
          }}
        />
      </div>

      {paymentError ? <Alert variant="danger" title="Erreur Stripe" message={paymentError} /> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting || isConfirming}>
          Retour
        </Button>
        <Button onClick={handleSubmit} disabled={!stripe || isSubmitting || isConfirming}>
          {isSubmitting || isConfirming ? 'Paiement en cours...' : 'Payer et confirmer'}
        </Button>
      </div>
    </div>
  )
}

function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const parsed = new Date(year, monthIndex, day)

  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) {
    return null
  }

  return parsed
}

function getAgeYears(dateOfBirth: string | null | undefined): number | null {
  const parsedBirthDate = parseDateInput(dateOfBirth)
  if (!parsedBirthDate) {
    return null
  }

  const today = new Date()
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let age = currentDay.getFullYear() - parsedBirthDate.getFullYear()
  const isBirthdayPassed =
    currentDay.getMonth() > parsedBirthDate.getMonth()
    || (currentDay.getMonth() === parsedBirthDate.getMonth() && currentDay.getDate() >= parsedBirthDate.getDate())

  if (!isBirthdayPassed) {
    age -= 1
  }

  return age
}

type VehicleDetailTab = 'features' | 'equipment' | 'conditions'

type ReservationProgressStep = {
  order: number
  label: string
}

type ReservationStepNumber = 1 | 2 | 3 | 4 | 5
type InsuranceOptionKey = 'standard' | 'duo' | 'omnium'

const INSURANCE_DAILY_PRICE: Record<InsuranceOptionKey, number> = {
  standard: 0,
  duo: 8,
  omnium: 25,
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const reservationIdParam = searchParams.get('reservationId')
  const reservationIdFromQuery = reservationIdParam ? Number(reservationIdParam) : Number.NaN
  const hasReservationIdInQuery = Number.isInteger(reservationIdFromQuery) && reservationIdFromQuery > 0

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [activeTab, setActiveTab] = useState<VehicleDetailTab>('features')
  const [isLoading, setIsLoading] = useState(true)
  const [isNotFound, setIsNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [simulationContextMessage, setSimulationContextMessage] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<ReservationStepNumber>(() => (hasReservationIdInQuery ? 4 : 1))
  const [selectedInsurance, setSelectedInsurance] = useState<InsuranceOptionKey | null>(null)
  const [createdReservation, setCreatedReservation] = useState<ReservationCreateResponse | null>(null)
  const [depositBackendStatus, setDepositBackendStatus] = useState<string | null>(null)
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null)
  const [paymentSetupMessage, setPaymentSetupMessage] = useState<string | null>(null)
  const [paymentWorkflowError, setPaymentWorkflowError] = useState<string | null>(null)
  const [isPreparingPayment, setIsPreparingPayment] = useState(false)
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)

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

  const reservationStateQuery = useQuery({
    queryKey: ['vehicle-detail-reservation-state', reservationIdFromQuery],
    queryFn: () => getReservationById(reservationIdFromQuery),
    enabled: isAuthenticated && hasReservationIdInQuery,
  })

  const paymentErrors = useMemo(() => {
    if (!isAuthenticated) {
      return []
    }

    const errors: string[] = []
    const dateOfBirth = profileQuery.data?.date_of_birth ?? null
    const drivingLicenseValid = profileProgressQuery.data?.driving_license_valid ?? false
    const identityCardValid = profileProgressQuery.data?.identity_card_valid ?? false

    if (!dateOfBirth) {
      errors.push('Veuillez renseigner votre date de naissance dans votre profil.')
    } else {
      const age = getAgeYears(dateOfBirth)
      if (age === null) {
        errors.push('Veuillez renseigner votre date de naissance dans votre profil.')
      } else if (age < 18) {
        errors.push('Vous devez avoir au moins 18 ans pour louer un véhicule.')
      } else if (age > 90) {
        errors.push("L'âge maximum autorisé pour une location GetACar est de 90 ans.")
      }
    }

    if (!drivingLicenseValid) {
      errors.push('Votre permis de conduire doit être validé avant de pouvoir payer.')
    }

    if (!identityCardValid) {
      errors.push("Votre carte d'identité doit être validée avant de pouvoir payer.")
    }

    return errors
  }, [isAuthenticated, profileProgressQuery.data, profileQuery.data])

  const canProceedToPayment = isAuthenticated && !profileQuery.isLoading && !profileProgressQuery.isLoading && paymentErrors.length === 0

  const reservationSteps: ReservationProgressStep[] = [
    { order: 1, label: 'Véhicule & période' },
    { order: 2, label: 'Assurance' },
    { order: 3, label: 'Récapitulatif' },
    { order: 4, label: 'Paiement et vérifications' },
    { order: 5, label: 'Confirmation' },
  ]

  const start = searchParams.get('start')
  const end = searchParams.get('end')

  useEffect(() => {
    if (!id) {
      return
    }

    const isLegacyVehiclePath = location.pathname === `/vehicles/${id}`
    if (!isLegacyVehiclePath || !start || !end) {
      return
    }

    navigate(`/vehicles/${id}/reservation${location.search}`, { replace: true })
  }, [end, id, location.pathname, location.search, navigate, start])

  const insuranceOptions: Array<{ key: InsuranceOptionKey; title: string; description: string; price: string }> = [
    {
      key: 'standard',
      title: 'Standard',
      description: 'Assurance de base, 1 conducteur',
      price: 'Incluse',
    },
    {
      key: 'duo',
      title: 'Duo',
      description: 'Assurance de base + 1 conducteur additionnel',
      price: '+ 8 €/jour',
    },
    {
      key: 'omnium',
      title: 'Omnium',
      description: 'Protection renforcée + franchise réduite',
      price: '+ 25 €/jour',
    },
  ]

  const restoredInsuranceSelection = useMemo(
    () => mapInsuranceToUi(reservationStateQuery.data?.insurance_type ?? createdReservation?.insurance_type),
    [createdReservation?.insurance_type, reservationStateQuery.data?.insurance_type],
  )

  const activeReservation = reservationStateQuery.data ?? createdReservation
  const effectiveInsuranceSelection = selectedInsurance ?? restoredInsuranceSelection
  const selectedInsuranceOption = insuranceOptions.find((option) => option.key === effectiveInsuranceSelection) ?? null

  const rentalDays = useMemo(() => {
    if (!start || !end) {
      return 0
    }

    const startDate = new Date(start)
    const endDate = new Date(end)

    const startTimestamp = startDate.getTime()
    const endTimestamp = endDate.getTime()
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
      return 0
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000
    const rawDays = (endTimestamp - startTimestamp) / millisecondsPerDay
    if (!Number.isFinite(rawDays) || rawDays <= 0) {
      return 0
    }

    return Math.ceil(rawDays)
  }, [start, end])

  const rentalPrice = useMemo(() => {
    if (!vehicle || rentalDays <= 0) {
      return 0
    }

    const dailyRate = Number(vehicle.category_daily_rate)
    if (!Number.isFinite(dailyRate)) {
      return 0
    }

    return dailyRate * rentalDays
  }, [vehicle, rentalDays])

  const insurancePrice = useMemo(() => {
    if (!effectiveInsuranceSelection || rentalDays <= 0) {
      return 0
    }

    return INSURANCE_DAILY_PRICE[effectiveInsuranceSelection] * rentalDays
  }, [effectiveInsuranceSelection, rentalDays])

  const estimatedTotal = useMemo(() => {
    if (!effectiveInsuranceSelection) {
      return null
    }

    return rentalPrice + insurancePrice
  }, [effectiveInsuranceSelection, rentalPrice, insurancePrice])

  const cautionLabel = formatCurrencyFr(vehicle?.conditions?.minimum_deposit) ?? 'Non renseigné'
  const backendInsuranceType = mapInsuranceToBackend(effectiveInsuranceSelection)

  const stripeReturnUrl = useMemo(() => {
    const nextSearchParams = new URLSearchParams()

    if (start) {
      nextSearchParams.set('start', start)
    }

    if (end) {
      nextSearchParams.set('end', end)
    }

    const activeReservationId = createdReservation?.id ?? reservationIdFromQuery
    if (activeReservationId) {
      nextSearchParams.set('reservationId', String(activeReservationId))
    }

    const queryString = nextSearchParams.toString()
    return `${window.location.origin}${location.pathname}${queryString ? `?${queryString}` : ''}`
  }, [createdReservation?.id, end, location.pathname, reservationIdFromQuery, start])

  const simulationReservationId = createdReservation?.id ?? (hasReservationIdInQuery ? reservationIdFromQuery : null)
  const canRunSimulationQuery = Boolean(vehicle && start && end && (backendInsuranceType || simulationReservationId))

  const simulationQuery = useQuery({
    queryKey: ['vehicle-detail-reservation-simulation', vehicle?.id, start, end, backendInsuranceType, simulationReservationId],
    queryFn: () => {
      const payload: {
        vehicle_id: number
        start_at: string
        end_at: string
        insurance_type?: 'STANDARD' | 'DUO' | 'OMNIUM'
        reservation_id?: number
      } = {
        vehicle_id: vehicle!.id,
        start_at: start!,
        end_at: end!,
      }

      if (backendInsuranceType) {
        payload.insurance_type = backendInsuranceType
      }

      if (simulationReservationId) {
        payload.reservation_id = simulationReservationId
      }

      return simulatePrice(payload)
    },
    enabled: canRunSimulationQuery,
  })

  const insuranceSummaryVehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model_name}` : 'Véhicule indisponible'
  const insuranceSummaryStartLabel = formatDateTimeFr(start)
  const insuranceSummaryEndLabel = formatDateTimeFr(end)
  const insuranceSummaryDurationLabel = formatDurationFromHours(simulationQuery.data?.duration_hours, rentalDays)

  const reservationPayload = useMemo<ReservationCreateRequest | null>(() => {
    if (!vehicle || !start || !end || !backendInsuranceType) {
      return null
    }

    return {
      vehicle_id: vehicle.id,
      start_at: start,
      end_at: end,
      insurance_type: backendInsuranceType,
    }
  }, [backendInsuranceType, end, start, vehicle])

  const createReservationMutation = useMutation({
    mutationFn: (payload: ReservationCreateRequest) => createReservation(payload),
    onSuccess: (reservation) => {
      setCreatedReservation(reservation)
      setPaymentWorkflowError(null)
      setPaymentSetupMessage(null)
    },
    onError: (error) => {
      const axiosError = error as AxiosError<{ detail?: string }>
      setPaymentWorkflowError(axiosError.response?.data?.detail || 'La reservation n\'a pas pu etre creee.')
    },
  })

  const depositAuthorizationMutation = useMutation({
    mutationFn: (reservationId: number) => createReservationDeposit(reservationId, { mode: 'STRIPE_TEST' }),
  })

  const paymentIntentMutation = useMutation({
    mutationFn: (reservationId: number) => createReservationPaymentIntent(reservationId),
  })

  const preparePayment = useCallback(async (reservationId: number) => {
    setIsPreparingPayment(true)
    setPaymentWorkflowError(null)
    setPaymentSetupMessage(null)

    try {
      const depositResult = await depositAuthorizationMutation.mutateAsync(reservationId)
      const normalizedDepositStatus = depositResult.deposit_status.toUpperCase()
      setDepositBackendStatus(normalizedDepositStatus)

      if (normalizedDepositStatus !== 'AUTORISEE' && normalizedDepositStatus !== 'VALIDE') {
        throw new Error(depositResult.authorization_note || 'La preautorisation Stripe de la caution a ete refusee.')
      }

      const paymentIntentResult = await paymentIntentMutation.mutateAsync(reservationId)

      if (!paymentIntentResult.client_secret) {
        throw new Error('Le backend n\'a pas retourne de client_secret Stripe.')
      }

      setPaymentClientSecret(paymentIntentResult.client_secret)
      setPaymentSetupMessage('Le moyen de paiement est prêt. La confirmation finale dépendra du backend et du webhook Stripe.')
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string; message?: string }>
      setPaymentWorkflowError(
        axiosError.response?.data?.detail
        || axiosError.response?.data?.message
        || (error instanceof Error ? error.message : 'Impossible de preparer le paiement Stripe Test.'),
      )
    } finally {
      setIsPreparingPayment(false)
    }
  }, [depositAuthorizationMutation, paymentIntentMutation])

  const loadExistingPaymentClientSecret = useCallback(async (reservationId: number) => {
    setPaymentWorkflowError(null)
    setPaymentSetupMessage(null)

    try {
      const paymentIntentResult = await paymentIntentMutation.mutateAsync(reservationId)

      if (!paymentIntentResult.client_secret) {
        throw new Error('Le backend n\'a pas retourne de client_secret Stripe.')
      }

      setPaymentClientSecret(paymentIntentResult.client_secret)
      setPaymentSetupMessage('Le moyen de paiement est prêt. La confirmation finale dépendra du backend et du webhook Stripe.')
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string; message?: string }>
      setPaymentWorkflowError(
        axiosError.response?.data?.detail
        || axiosError.response?.data?.message
        || (error instanceof Error ? error.message : 'Impossible de recuperer le moyen de paiement Stripe Test.'),
      )
    }
  }, [paymentIntentMutation])

  const pollReservationConfirmation = async (reservationId: number): Promise<ReservationCreateResponse | null> => {
    for (let attempt = 0; attempt < RESERVATION_CONFIRMATION_POLL_COUNT; attempt += 1) {
      await delay(RESERVATION_CONFIRMATION_POLL_DELAY_MS)
      const refreshedReservation = await getReservationById(reservationId)

      if (refreshedReservation.status === 'CONFIRMEE') {
        return refreshedReservation
      }
    }

    return null
  }

  const handlePaymentSuccess = async (paymentStatus?: string) => {
    if (!createdReservation) {
      return
    }

    setIsConfirmingPayment(true)
    setPaymentWorkflowError(null)
    if (paymentStatus === 'processing') {
      setPaymentSetupMessage('Votre paiement est en cours de traitement. Veuillez patienter.')
    } else {
      setPaymentSetupMessage('Paiement en cours de confirmation...')
    }

    try {
      const refreshedReservation = await pollReservationConfirmation(createdReservation.id)

      if (refreshedReservation) {
        setCreatedReservation(refreshedReservation)
        setCurrentStep(5)
        return
      }

      setPaymentWorkflowError('Paiement soumis, mais confirmation backend encore en attente. Veuillez rafraichir dans quelques instants.')
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>
      setPaymentWorkflowError(axiosError.response?.data?.detail || 'Impossible de confirmer le paiement pour le moment.')
    } finally {
      setIsConfirmingPayment(false)
    }
  }

  useEffect(() => {
    if (!createdReservation) {
      return
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    if (nextSearchParams.get('reservationId') === String(createdReservation.id)) {
      return
    }

    nextSearchParams.set('reservationId', String(createdReservation.id))
    navigate(`${location.pathname}?${nextSearchParams.toString()}`, { replace: true })
  }, [createdReservation, location.pathname, navigate, searchParams])

  useEffect(() => {
    if (currentStep !== 4 || !canProceedToPayment) {
      return
    }

    if (createReservationMutation.isPending || depositAuthorizationMutation.isPending || paymentIntentMutation.isPending || isPreparingPayment || paymentClientSecret) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const syncStripePayment = async () => {
        if (activeReservation) {
          if (activeReservation.status === 'EN_ATTENTE_PAIEMENT') {
            await loadExistingPaymentClientSecret(activeReservation.id)
            return
          }

          await preparePayment(activeReservation.id)
          return
        }

        if (!reservationPayload || !simulationQuery.data) {
          return
        }

        const reservation = await createReservationMutation.mutateAsync(reservationPayload)

        if (reservation.status === 'EN_ATTENTE_PAIEMENT') {
          await loadExistingPaymentClientSecret(reservation.id)
          return
        }

        await preparePayment(reservation.id)
      }

      void syncStripePayment()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    activeReservation,
    canProceedToPayment,
    createReservationMutation,
    currentStep,
    depositAuthorizationMutation.isPending,
    isPreparingPayment,
    loadExistingPaymentClientSecret,
    paymentClientSecret,
    paymentIntentMutation.isPending,
    preparePayment,
    reservationPayload,
    simulationQuery.data,
  ])

  useEffect(() => {
    let isMounted = true

    async function loadVehicleById() {
      if (!id) {
        setErrorMessage('Identifiant du vehicule manquant.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setErrorMessage(null)
      setIsNotFound(false)

      try {
        const payload = await getVehicleById(id)

        if (!isMounted) {
          return
        }

        setVehicle(payload)
      } catch (error) {
        if (!isMounted) {
          return
        }

        const axiosError = error as AxiosError
        if (axiosError.response?.status === 404) {
          setIsNotFound(true)
          setVehicle(null)
        } else {
          setErrorMessage('Impossible de charger ce vehicule pour le moment.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadVehicleById()

    return () => {
      isMounted = false
    }
  }, [id])

  const gallery = useMemo(() => (vehicle ? buildGallery(vehicle) : null), [vehicle])
  const status = useMemo(() => (vehicle ? statusToBadge(vehicle.public_status) : null), [vehicle])
  const usageAdvised = useMemo(
    () => (vehicle ? getVehicleField(vehicle, ['recommended_use', 'usage_advised', 'usage_conseille', 'recommended_usage', 'usage_recommande']) : 'Non renseigné'),
    [vehicle],
  )

  const featureRows = useMemo(() => {
    if (!vehicle) {
      return []
    }

    return [
      buildTabEntry('Places', getVehicleField(vehicle, ['seats'])),
      buildTabEntry('Portes', getVehicleField(vehicle, ['doors'])),
      buildTabEntry('Motorisation', getVehicleField(vehicle, ['motorisation', 'motorization', 'engine', 'fuel_type'])),
      buildTabEntry('Boîte', getVehicleField(vehicle, ['boite', 'boite_vitesse', 'gearbox', 'transmission'])),
      buildTabEntry('Puissance', getVehicleField(vehicle, ['power_hp', 'power', 'horsepower', 'puissance'])),
      buildTabEntry('Consommation', getVehicleField(vehicle, ['consumption', 'fuel_consumption', 'consommation'])),
      buildTabEntry('Coffre / volume', getVehicleField(vehicle, ['trunk_volume', 'boot_volume', 'coffre', 'volume_coffre'])),
      buildTabEntry('Norme Euro', getVehicleField(vehicle, ['euro_standard', 'euro_norm', 'standard_euro'])),
      buildTabEntry('Couleur', getVehicleField(vehicle, ['color'])),
    ]
  }, [vehicle])

  const equipmentRows = useMemo(() => {
    if (!vehicle) {
      return []
    }

    return [
      buildTabEntry('Climatisation', getVehicleField(vehicle, ['climatisation', 'air_conditioning'])),
      buildTabEntry('GPS', getVehicleField(vehicle, ['gps', 'navigation'])),
      buildTabEntry('Bluetooth / CarPlay', getVehicleField(vehicle, ['bluetooth', 'carplay', 'bluetooth_carplay'])),
      buildTabEntry('ISOFIX', getVehicleField(vehicle, ['isofix'])),
      buildTabEntry('USB', getVehicleField(vehicle, ['usb'])),
    ]
  }, [vehicle])

  const conditionRows = useMemo(() => {
    if (!vehicle) {
      return []
    }

    const conditions = vehicle.conditions
    const requiredDocuments = conditions?.reservation_profile_validation?.required_documents
    const documentsMustBeValid = conditions?.reservation_profile_validation?.documents_must_be_valid

    const includedKmPerDay = conditions?.included_km_per_day ?? vehicle.included_km_per_day
    const includedKmValue =
      typeof includedKmPerDay === 'number' && Number.isFinite(includedKmPerDay)
        ? `${formatNumberFr(includedKmPerDay)} km / jour`
        : 'Non renseigné'

    const extraKmPrice = conditions?.extra_km_price ?? vehicle.extra_km_price
    const extraKmPriceValue = formatCurrencyFr(extraKmPrice)
    const extraKmValue = extraKmPriceValue
      ? `${extraKmPriceValue} / km supplémentaire`
      : 'Non renseigné'

    const minimumDepositValue = formatCurrencyFr(conditions?.minimum_deposit)
    const depositValue = minimumDepositValue
      ? `${minimumDepositValue} — préautorisation bancaire`
      : 'Non renseigné'

    const minimumAge = conditions?.minimum_age ?? vehicle.minimum_age
    const minimumAgeValue =
      typeof minimumAge === 'number' && Number.isFinite(minimumAge)
        ? `${formatNumberFr(minimumAge)} ans`
        : 'Non renseigné'

    const requiredLicense = conditions?.required_license ?? vehicle.required_license
    const permitValue = requiredLicense
      ? `${requiredLicense} valide requis`
      : 'Non renseigné'

    const validatedDocumentsValue = (() => {
      if (documentsMustBeValid === undefined && !requiredDocuments) {
        return 'Non renseigné'
      }

      if (documentsMustBeValid === false) {
        return 'Non'
      }

      if (Array.isArray(requiredDocuments) && requiredDocuments.length > 0) {
        const normalizedCodes = new Set(requiredDocuments)

        if (normalizedCodes.has('PERMIS_CONDUIRE') && normalizedCodes.has('CARTE_IDENTITE')) {
          return "Permis de conduire et pièce d'identité obligatoires"
        }

        const labels = requiredDocuments.map((documentType) => {
          if (documentType === 'PERMIS_CONDUIRE') {
            return 'Permis de conduire'
          }

          if (documentType === 'CARTE_IDENTITE') {
            return "Pièce d'identité"
          }

          return documentType.replaceAll('_', ' ').toLowerCase()
        })

        return `Documents obligatoires: ${labels.join(', ')}`
      }

      return 'Oui'
    })()

    const fuelTracking = conditions?.fuel_tracking
    const fuelValue = fuelTracking?.managed_in_inspections
      ? "Le véhicule doit être restitué avec le même niveau de carburant qu'au départ"
      : 'Non renseigné'

    const latePolicy = conditions?.late_policy
    const lateValue = latePolicy?.managed_in_departure_inspection_window
      ? 'Non renseigné'
      : 'Non renseigné'

    const cancellationPolicy = conditions?.cancellation_policy
    const cancellationValue = cancellationPolicy
      ? 'Non renseigné'
      : 'Non renseigné'

    const inspectionPolicy = conditions?.inspection_policy
    const inspectionValue = inspectionPolicy
      ? inspectionPolicy.departure_required && inspectionPolicy.return_required
        ? 'État des lieux obligatoire au départ et au retour avec photos'
        : 'Non renseigné'
      : 'Non renseigné'

    return [
      buildTabEntry('Kilométrage inclus', includedKmValue),
      buildTabEntry('Kilométrage supplémentaire', extraKmValue),
      buildTabEntry('Caution', depositValue),
      buildTabEntry('Âge minimum', minimumAgeValue),
      buildTabEntry('Permis', permitValue),
      buildTabEntry('Documents validés', validatedDocumentsValue),
      buildTabEntry('Carburant', fuelValue),
      buildTabEntry('Retard', lateValue),
      buildTabEntry('Annulation', cancellationValue),
      buildTabEntry('État des lieux', inspectionValue),
    ]
  }, [vehicle])

  const handleSimulationClick = () => {
    if (start && end) {
      setSimulationContextMessage(null)
      setCurrentStep(2)
      return
    }

    setSimulationContextMessage('Aucune période sélectionnée. Revenez au catalogue pour choisir une date de début et de fin avant de lancer la simulation.')
  }

  const tabs: Array<{ id: VehicleDetailTab; label: string }> = [
    { id: 'features', label: 'Caractéristiques' },
    { id: 'equipment', label: 'Équipements' },
    { id: 'conditions', label: 'Conditions' },
  ]

  if (isLoading) {
    return (
      <section className="py-8 sm:py-10" aria-label="Chargement du vehicule">
        <div className="mx-auto flex max-w-7xl justify-center px-4 sm:px-6 lg:px-8">
          <LoadingSpinner aria-label="Chargement du vehicule" size="lg" />
        </div>
      </section>
    )
  }

  if (isNotFound) {
    return (
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <EmptyState
            title="Vehicule introuvable"
            description="Le vehicule demande n'existe pas ou n'est plus accessible."
            action={
              <Link to="/vehicles" className="inline-flex">
                <Button variant="secondary">Retour au catalogue</Button>
              </Link>
            }
          />
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Alert
            variant="danger"
            title="Erreur reseau"
            message={errorMessage}
          />
        </div>
      </section>
    )
  }

  if (!vehicle || !status || !gallery) {
    return (
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <EmptyState
            title="Donnees indisponibles"
            description="Les informations de ce vehicule sont incompletes pour le moment."
          />
        </div>
      </section>
    )
  }

  const paymentPeriodLabel = start && end
    ? `${formatDateTimeFr(start)} → ${formatDateTimeFr(end)}`
    : 'Non renseignée'
  const paymentDurationLabel = formatDurationFromHours(simulationQuery.data?.duration_hours, rentalDays)
  const hasSimulationSummary = Boolean(simulationQuery.data)
  const shouldShowSimulationError = simulationQuery.isError && !hasSimulationSummary
  const paymentInsuranceLabel = selectedInsuranceOption?.title
    ?? (simulationQuery.data?.insurance_type === 'STANDARD'
      ? 'Standard'
      : simulationQuery.data?.insurance_type === 'DUO'
        ? 'Duo'
        : simulationQuery.data?.insurance_type === 'OMNIUM'
          ? 'Omnium'
          : 'Non sélectionnée')
  const paymentRentalAmountLabel = formatCurrencyFr(simulationQuery.data?.rental_amount) ?? 'Non renseigné'
  const paymentInsuranceAmountLabel = formatCurrencyFr(simulationQuery.data?.insurance_amount) ?? 'Non renseigné'
  const paymentTotalAmountLabel = formatCurrencyFr(simulationQuery.data?.total_amount) ?? 'Non renseigné'
  const confirmationReservation = activeReservation
  const displayedCurrentStep: ReservationStepNumber = confirmationReservation?.status === 'CONFIRMEE' ? 5 : currentStep
  const isDepositConfirmedForDisplay = depositBackendStatus === 'AUTORISEE' || confirmationReservation?.status === 'CONFIRMEE'

  const tabContent = {
    features: (featureRows.length > 0 ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {featureRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{row.value}</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-slate-500">Aucune information disponible dans cette section.</p>
    )),
    equipment: (equipmentRows.length > 0 ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {equipmentRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{row.value}</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-slate-500">Aucun équipement renseigné pour le moment.</p>
    )),
    conditions: (conditionRows.length > 0 ? (
      <div className="grid gap-4 md:grid-cols-2">
        {conditionRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{row.value}</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-slate-500">Aucune condition disponible pour cette location.</p>
    )),
  }

  return (
    <section className="py-8 sm:py-10" aria-labelledby="vehicle-detail-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav aria-label="Progression de reservation" className="mb-6 sm:mb-8">
          <div className="overflow-x-auto pb-2">
            <ol className="flex min-w-185 items-start gap-2 sm:gap-3">
              {reservationSteps.map((step, index) => {
                const isCompleted = step.order < displayedCurrentStep
                const isCurrent = step.order === displayedCurrentStep

                return (
                  <Fragment key={step.order}>
                    <li className="flex w-32 shrink-0 flex-col items-center text-center sm:w-40">
                      <span
                        aria-current={isCurrent ? 'step' : undefined}
                        className={[
                          'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold',
                          isCompleted
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : isCurrent
                              ? 'border-indigo-600 bg-linear-to-br from-blue-600 to-violet-600 text-white'
                              : 'border-slate-300 bg-slate-100 text-slate-600',
                        ].join(' ')}
                      >
                        {isCompleted ? '✓' : step.order}
                      </span>
                      <span
                        className={[
                          'mt-2 text-xs font-medium leading-snug sm:text-sm',
                          isCurrent ? 'text-slate-900' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {step.label}
                      </span>
                    </li>

                    {index < reservationSteps.length - 1 ? (
                      <li
                        aria-hidden="true"
                        className={[
                          'mt-5 h-0.5 min-w-5 flex-1 rounded sm:mt-6',
                          index < displayedCurrentStep - 1 ? 'bg-emerald-500' : 'bg-slate-300',
                        ].join(' ')}
                      />
                    ) : null}
                  </Fragment>
                )
              })}
            </ol>
          </div>
        </nav>

        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-350 ease-out"
            style={{ transform: `translateX(-${(displayedCurrentStep - 1) * 100}%)` }}
          >
            <div className="w-full shrink-0">
              <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#2563EB]">{vehicle.category}</p>
                  <h1 id="vehicle-detail-title" className="mt-1 text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
                    {vehicle.brand} {vehicle.model_name}
                  </h1>
                </div>
                <StatusBadge variant={status.variant} label={status.label} />
              </header>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_0.95fr]">
                <Card>
                  {gallery.main && resolveMediaUrl(gallery.main.file) ? (
                    <img
                      src={resolveMediaUrl(gallery.main.file) ?? undefined}
                      alt={`${vehicle.brand} ${vehicle.model_name}`}
                      className="h-72 w-full rounded-[1.25rem] object-cover sm:h-[26rem]"
                    />
                  ) : (
                    <div className="flex h-72 w-full items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-slate-100 to-slate-200 sm:h-[26rem]">
                      <p className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600">
                        Aucune photo principale disponible
                      </p>
                    </div>
                  )}

                  {gallery.secondary.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {gallery.secondary.map((photo) => (
                        <img
                          key={photo.id}
                          src={resolveMediaUrl(photo.file) ?? undefined}
                          alt={`Photo du vehicule ${vehicle.brand} ${vehicle.model_name}`}
                          className="h-24 w-full rounded-xl object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : null}
                </Card>

                <Card
                  header={<h2 className="text-lg font-semibold text-[#1F2937]">Informations du véhicule</h2>}
                  footer={
                    <div className="flex flex-col gap-3">
                      <Button className="w-full" onClick={handleSimulationClick}>Simuler et réserver</Button>
                      {simulationContextMessage ? (
                        <Alert variant="info" title="Période requise" message={simulationContextMessage} />
                      ) : null}
                    </div>
                  }
                >
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Modèle</p>
                      <p className="mt-1 text-2xl font-semibold text-[#1F2937]">{vehicle.brand} {vehicle.model_name}</p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-500">Usage conseillé</p>
                      <p className="mt-1 text-base font-medium text-[#1F2937]">{usageAdvised}</p>
                    </div>

                    <div className="rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
                      <p className="text-sm font-medium text-slate-500">Tarif journalier</p>
                      <p className="mt-2 text-3xl font-semibold text-[#1F2937]">{formatRate(vehicle.category_daily_rate)}</p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="mt-8 overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-3">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={[
                        'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                        activeTab === tab.id
                          ? 'bg-[#2563EB] text-white shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-slate-100',
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-5 sm:p-6">
                  {activeTab === 'features' && tabContent.features}
                  {activeTab === 'equipment' && tabContent.equipment}
                  {activeTab === 'conditions' && tabContent.conditions}
                </div>
              </div>
            </div>

            <div className="w-full shrink-0">
              <Card className="mt-2" header={<h2 className="text-lg font-semibold text-[#1F2937]">Choisissez votre assurance</h2>}>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 px-4 py-3 text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-8">
                    <span className="font-semibold text-[#1F2937]">{insuranceSummaryVehicleLabel}</span>
                    <span className="text-slate-300">·</span>
                    <span>Départ {insuranceSummaryStartLabel}</span>
                    <span className="text-slate-300">·</span>
                    <span>Retour {insuranceSummaryEndLabel}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-medium text-[#1F2937]">{insuranceSummaryDurationLabel}</span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {insuranceOptions.map((option) => {
                      const isSelected = effectiveInsuranceSelection === option.key
                      const optionInsuranceTotal = INSURANCE_DAILY_PRICE[option.key] * rentalDays

                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setSelectedInsurance(option.key)}
                          className={[
                            'flex h-full flex-col rounded-2xl border bg-white p-4 text-left transition-all sm:p-5',
                            isSelected
                              ? 'border-[#7C3AED] bg-violet-50/40 shadow-[0_10px_30px_rgba(124,58,237,0.12)] ring-2 ring-[#7C3AED]/20'
                              : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/30',
                          ].join(' ')}
                          aria-pressed={isSelected}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{option.title.toUpperCase()}</p>
                              <p className="mt-2 text-sm font-medium text-slate-700">
                                {option.key === 'standard' ? 'Assurance de base' : option.key === 'duo' ? 'Assurance de base' : 'Protection renforcée'}
                              </p>
                              {option.key === 'duo' ? <p className="mt-1 text-sm text-violet-600">1 conducteur additionnel</p> : null}
                              {option.key === 'omnium' ? <p className="mt-1 text-sm text-violet-600">Franchise réduite</p> : null}
                            </div>

                            {option.key === 'omnium' ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-[#6D28D9]">
                                ★ Recommandée
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 flex items-end justify-between gap-4">
                            <div>
                              <p className="text-sm text-slate-600">
                                {option.key === 'standard'
                                  ? 'Une protection essentielle incluse dans votre location.'
                                  : option.key === 'duo'
                                    ? 'Ajoutez un second conducteur sans stress ni frais supplémentaires.'
                                    : 'Moins de franchise, plus de sérénité en cas d’imprévu.'}
                              </p>
                              <p className="mt-1 text-base font-semibold text-[#1F2937]">{option.price}</p>
                            </div>
                          </div>

                          <ul className="mt-4 space-y-3 text-sm text-slate-700">
                            {(option.key === 'standard'
                              ? [
                                  '✓ Couverture responsabilité civile',
                                  '✓ Dommages au véhicule (franchise standard)',
                                  '✓ Vol et incendie',
                                  '✓ Assistance 24/7',
                                ]
                              : option.key === 'duo'
                                ? [
                                    '✓ Tout ce qui est inclus dans Standard',
                                    '✓ 2 conducteurs autorisés',
                                    '✓ Conduite partagée en toute tranquillité',
                                    '✓ Idéal pour les couples ou amis',
                                  ]
                                : [
                                    '✓ Tout ce qui est inclus dans Conducteur +',
                                    '✓ Franchise réduite en cas de dommage',
                                    '✓ Protection maximale du véhicule',
                                    '✓ Assistance premium 24/7',
                                  ]
                            ).map((feature) => (
                              <li key={feature} className="flex items-start gap-2.5">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-600">
                                  ✓
                                </span>
                                <span className="leading-6">{feature.replace(/^✓\s*/, '')}</span>
                              </li>
                            ))}
                          </ul>

                          <p className="mt-4 text-sm font-medium text-violet-600">
                            {option.key === 'standard'
                              ? 'Idéale pour réduire le coût'
                              : option.key === 'duo'
                                ? 'Idéale si vous partagez la conduite'
                                : 'Idéale pour plus de tranquillité'}
                          </p>

                          <p className="mt-3 text-xs text-slate-500">
                            {rentalDays > 0
                              ? `${formatCurrencyFr(optionInsuranceTotal) ?? '0 €'} pour ${rentalDays} jour${rentalDays > 1 ? 's' : ''}`
                              : 'Montant calculé une fois la période disponible'}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 sm:text-base sm:leading-7">
                      <p className="text-base font-semibold text-slate-900 sm:text-lg">Récapitulatif estimé</p>
                      <span className="hidden sm:inline text-slate-300">|</span>
                      <p className="font-medium text-slate-700">Durée: {rentalDays > 0 ? `${rentalDays} jour${rentalDays > 1 ? 's' : ''}` : 'non disponible'}</p>
                      <p className="font-medium text-slate-700">Location: {formatCurrencyFr(rentalPrice) ?? '0 €'}</p>
                      <p className="font-medium text-slate-700">Assurance: {effectiveInsuranceSelection ? (formatCurrencyFr(insurancePrice) ?? '0 €') : 'Non sélectionnée'}</p>
                      <p className="text-base font-bold text-[#1F2937] sm:text-lg">Total: {estimatedTotal !== null ? (formatCurrencyFr(estimatedTotal) ?? '0 €') : 'Non sélectionné'}</p>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button variant="secondary" onClick={() => setCurrentStep(1)}>Retour</Button>
                    <Button onClick={() => setCurrentStep(3)} disabled={!effectiveInsuranceSelection}>Continuer</Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full shrink-0">
              <Card className="mt-2" header={<h2 className="text-lg font-semibold text-[#1F2937]">Récapitulatif de votre véhicule</h2>}>
                <div className="space-y-7">
                  <div className="grid gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-start">
                    <div className="w-full">
                      {gallery.main && resolveMediaUrl(gallery.main.file) ? (
                        <div className="overflow-hidden rounded-2xl bg-slate-50">
                          <div className="flex h-[340px] items-center justify-center p-2 sm:h-[380px] sm:p-3">
                            <img
                              src={resolveMediaUrl(gallery.main.file) ?? undefined}
                              alt={`${vehicle.brand} ${vehicle.model_name}`}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-[340px] items-center justify-center rounded-2xl bg-slate-100 text-sm font-medium text-slate-600 sm:h-[380px]">
                          Photo indisponible
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-col justify-center space-y-4 text-slate-700">
                      <div className="space-y-1.5">
                        <p className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{vehicle.brand} {vehicle.model_name}</p>
                        <p className="text-base font-medium text-slate-600">{vehicle.category || 'Non renseigné'}</p>
                      </div>

                      <div className="space-y-2 text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-8">
                        <p><span className="font-medium text-slate-900">Début :</span> <span className="font-semibold text-slate-900">{formatDateTimeFr(start)}</span></p>
                        <p><span className="font-medium text-slate-900">Fin :</span> <span className="font-semibold text-slate-900">{formatDateTimeFr(end)}</span></p>
                        <p><span className="font-medium text-slate-900">Durée :</span> <span className="font-semibold text-slate-900">{rentalDays > 0 ? `${rentalDays} jour${rentalDays > 1 ? 's' : ''}` : 'Non renseignée'}</span></p>
                        <p><span className="font-medium text-slate-900">Assurance :</span> <span className="font-semibold text-slate-900">{selectedInsuranceOption?.title ?? 'Non sélectionnée'}</span></p>
                        <p><span className="font-medium text-slate-900">Prix location :</span> <span className="font-semibold text-slate-900">{formatCurrencyFr(rentalPrice) ?? '0 €'}</span></p>
                        <p><span className="font-medium text-slate-900">Prix assurance :</span> <span className="font-semibold text-slate-900">{effectiveInsuranceSelection ? (formatCurrencyFr(insurancePrice) ?? '0 €') : 'Non sélectionné'}</span></p>
                        <p><span className="font-medium text-slate-900">Caution :</span> <span className="font-semibold text-slate-900">{cautionLabel}</span></p>
                      </div>

                      <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-5 py-4 shadow-[0_8px_24px_rgba(124,58,237,0.08)]">
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Total estimé</p>
                        <p className="mt-2 text-3xl font-bold tracking-tight text-[#7C3AED] sm:text-4xl">
                          {estimatedTotal !== null ? (formatCurrencyFr(estimatedTotal) ?? '0 €') : 'Non sélectionné'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button variant="secondary" onClick={() => setCurrentStep(2)}>Retour</Button>
                    <Button onClick={() => setCurrentStep(4)} disabled={!effectiveInsuranceSelection}>Confirmer et continuer</Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full shrink-0">
              <Card className="mt-2" header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 4 · Paiement et vérifications</h2>}>
                <div className="space-y-8">
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,0.9fr)] lg:items-start">
                    <section className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-6">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Votre réservation</p>
                      <div className="mt-4 space-y-3 text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-8">
                        <p><span className="font-medium text-slate-900">Véhicule :</span> <span className="font-semibold text-slate-950">{vehicle.brand} {vehicle.model_name}</span></p>
                        <p><span className="font-medium text-slate-900">Période :</span> <span className="font-semibold text-slate-950">{paymentPeriodLabel}</span></p>
                        <p><span className="font-medium text-slate-900">Durée :</span> <span className="font-semibold text-slate-950">{paymentDurationLabel}</span></p>
                        <p><span className="font-medium text-slate-900">Assurance :</span> <span className="font-semibold text-slate-950">{paymentInsuranceLabel}</span></p>
                      </div>
                    </section>

                    <section className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-6">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">À payer</p>
                      <div className="mt-4 flex h-full flex-col justify-between">
                        {simulationQuery.isLoading ? (
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <LoadingSpinner size="sm" aria-label="Chargement du récapitulatif paiement" />
                            Chargement du calcul backend...
                          </div>
                        ) : shouldShowSimulationError ? (
                          <Alert
                            variant="danger"
                            title="Récapitulatif indisponible"
                            message="Impossible de charger le calcul backend du paiement pour le moment."
                          />
                        ) : (
                          <div className="space-y-3 text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-8">
                            <div className="flex items-center justify-between gap-4">
                              <span>Location</span>
                              <span className="text-xl font-semibold text-[#1F2937] sm:text-2xl">{paymentRentalAmountLabel}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span>Assurance</span>
                              <span className="text-xl font-semibold text-[#1F2937] sm:text-2xl">{paymentInsuranceAmountLabel}</span>
                            </div>
                            <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-3">
                              <span className="text-base font-medium text-slate-900">Total à payer</span>
                              <span className="text-3xl font-bold tracking-tight text-[#7C3AED] sm:text-4xl">{paymentTotalAmountLabel}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    <div className="space-y-3">
                      {gallery.main && resolveMediaUrl(gallery.main.file) ? (
                        <img
                          src={resolveMediaUrl(gallery.main.file) ?? undefined}
                          alt={`${vehicle.brand} ${vehicle.model_name}`}
                          className="h-[380px] w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-[380px] items-center justify-center text-sm text-slate-600">
                          Photo indisponible
                        </div>
                      )}
                    </div>
                  </div>

                  <section className="space-y-4">
                    {isAuthenticated ? (
                      <div className="space-y-4">
                        {profileQuery.isLoading || profileProgressQuery.isLoading ? (
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <LoadingSpinner size="sm" aria-label="Vérification du profil" />
                            Vérification de votre profil avant paiement...
                          </div>
                        ) : profileQuery.isError || profileProgressQuery.isError ? (
                          <Alert
                            variant="danger"
                            title="Vérification du profil impossible"
                            message="Impossible de vérifier votre profil pour l’instant. Merci de réessayer plus tard."
                          />
                        ) : paymentErrors.length > 0 ? (
                          <>
                            <Alert
                              variant="danger"
                              title="Paiement impossible pour le moment"
                              message={
                                <ul className="list-disc space-y-1 pl-5">
                                  {paymentErrors.map((error) => (<li key={error}>{error}</li>))}
                                </ul>
                              }
                            />
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                              <Button variant="secondary" onClick={() => setCurrentStep(3)}>Retour</Button>
                              <Button variant="secondary" onClick={() => navigate('/client/profile')}>
                                Compléter mon profil
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            {!stripePublishableKey || !stripePromise ? (
                              <Alert
                                variant="danger"
                                title="Configuration Stripe manquante"
                                message="La variable VITE_STRIPE_PUBLISHABLE_KEY doit être définie pour activer le paiement Stripe Test."
                              />
                            ) : isPreparingPayment ? (
                              <Alert
                                variant="info"
                                title="Préparation du paiement"
                                message="Création de la réservation, préautorisation de la caution et préparation du PaymentIntent en cours..."
                              />
                            ) : paymentWorkflowError ? (
                              <Alert variant="danger" title="Paiement impossible" message={paymentWorkflowError} />
                            ) : !activeReservation || !paymentClientSecret ? (
                              <Alert
                                variant="info"
                                title="Préparation en cours"
                                message="Le backend prépare votre paiement Stripe Test."
                              />
                            ) : (
                              <>
                                {paymentSetupMessage ? <Alert variant="success" title="Paiement prêt" message={paymentSetupMessage} /> : null}

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
                                        borderRadius: '16px',
                                      },
                                    },
                                  }}
                                >
                                  <StripePaymentForm
                                    isSubmitting={isConfirmingPayment}
                                    onBack={() => setCurrentStep(3)}
                                    returnUrl={stripeReturnUrl}
                                    onSubmit={handlePaymentSuccess}
                                  />
                                </Elements>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4 pt-2 text-center">
                        <h3 className="text-2xl font-semibold tracking-tight text-[#1F2937] sm:text-3xl">
                          Connectez-vous pour continuer
                        </h3>

                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <Link
                            to="/login"
                            state={{
                              from: `${window.location.pathname}${window.location.search}`,
                              reservationDraft: {
                                vehicleId: vehicle.id,
                                start,
                                end,
                                insurance: selectedInsurance,
                                insurancePrice,
                                rentalPrice,
                                estimatedTotal,
                              },
                            }}
                            className="inline-flex"
                          >
                            <Button className="h-12 min-w-56 bg-linear-to-r from-[#2563EB] to-[#7C3AED] text-white hover:from-[#1D4ED8] hover:to-[#6D28D9]">Se connecter</Button>
                          </Link>
                          <Link
                            to="/register"
                            state={{
                              from: `${window.location.pathname}${window.location.search}`,
                              reservationDraft: {
                                vehicleId: vehicle.id,
                                start,
                                end,
                                insurance: selectedInsurance,
                                insurancePrice,
                                rentalPrice,
                                estimatedTotal,
                              },
                            }}
                            className="inline-flex"
                          >
                            <Button
                              variant="secondary"
                              className="h-12 min-w-56 border border-[#F97316] bg-[#FFF7ED] text-[#C2410C] hover:bg-[#FFEDD5]"
                            >
                              Créer un compte
                            </Button>
                          </Link>
                        </div>

                        <p className="mx-auto max-w-2xl text-xs font-medium text-slate-500 sm:text-sm">
                          Après connexion, vous pourrez compléter votre profil et faire valider vos documents avant de finaliser votre réservation.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              </Card>
            </div>

            <div className="w-full shrink-0">
              <Card className="mt-2" header={<h2 className="text-lg font-semibold text-[#1F2937]">Étape 5 · Confirmation</h2>}>
                {confirmationReservation?.status === 'CONFIRMEE' ? (
                  <div className="space-y-5">
                    <Alert
                      variant="success"
                      title="✓ Réservation confirmée"
                      message="Votre paiement a été accepté et votre réservation est confirmée."
                    />

                    <div className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-[#1F2937]">Référence réservation</p>
                        <p className="mt-1">{confirmationReservation.reference}</p>
                      </div>
                      <div>
                        <p className="font-medium text-[#1F2937]">Véhicule</p>
                        <p className="mt-1">{confirmationReservation.vehicle.brand} {confirmationReservation.vehicle.model_name}</p>
                      </div>
                      <div>
                        <p className="font-medium text-[#1F2937]">Date/heure de début</p>
                        <p className="mt-1">{formatDateTimeFr(confirmationReservation.start_at)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-[#1F2937]">Date/heure de fin</p>
                        <p className="mt-1">{formatDateTimeFr(confirmationReservation.end_at)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-[#1F2937]">Assurance</p>
                        <p className="mt-1">{selectedInsuranceOption?.title ?? confirmationReservation.insurance_type ?? 'Non renseignée'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-[#1F2937]">Montant réellement payé</p>
                        <p className="mt-1">{formatCurrencyFr(confirmationReservation.total_amount) ?? 'Non renseigné'}</p>
                      </div>
                      {isDepositConfirmedForDisplay ? (
                        <div>
                          <p className="font-medium text-[#1F2937]">Caution</p>
                          <p className="mt-1">500 € préautorisés</p>
                        </div>
                      ) : null}
                      <div>
                        <p className="font-medium text-[#1F2937]">Statut paiement</p>
                        <p className="mt-1">Confirmé</p>
                      </div>
                      <div>
                        <p className="font-medium text-[#1F2937]">Statut de la réservation</p>
                        <p className="mt-1">{confirmationReservation.status}</p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600">
                      La caution restera en attente jusqu'au contrôle du véhicule après sa restitution.
                    </p>

                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                      <Button onClick={() => navigate(`/client/reservations/${confirmationReservation.id}`)}>
                        Voir ma réservation
                      </Button>
                      <Button variant="secondary" onClick={() => navigate('/')}>
                        Retour à l'accueil
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[32vh] flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[36vh] sm:px-6 sm:py-12">
                    <LoadingSpinner size="lg" aria-label="Confirmation du paiement en cours" />
                    <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[#1F2937] sm:text-3xl">Veuillez patienter</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                      Nous procédons à la confirmation de votre paiement.
                    </p>
                    <p className="mt-3 text-sm font-semibold text-slate-500 sm:text-base">Ne fermez pas cette page.</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}