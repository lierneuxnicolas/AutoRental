import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Car, Check } from 'lucide-react'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { getClientProfileMe, getClientProfileProgress } from '../../services/authService'
import { createReservationDeposit, createReservationPaymentIntent } from '../../services/paymentService'
import { createReservation, getPaymentChecks, getReservationById } from '../../services/reservationService'
import { getVehicleById, simulatePrice } from '../../services/vehicleService'
import type { ReservationCreateRequest, ReservationCreateResponse } from '../../types/reservation'
import type { PublicVehicle, VehiclePhoto } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'
import { toDateValue } from '../../utils/rentalPeriod'
import { formatVehicleDailyRate } from '../../utils/vehiclePrice'
import { getReservationResume } from '../../utils/reservationResume'

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null
const RESERVATION_CONFIRMATION_TIMEOUT_MS = 15000
const RESERVATION_CONFIRMATION_POLL_DELAY_MS = 3000

type ReservationApiErrorPayload = Record<string, unknown> & {
  code?: unknown
  message?: unknown
  detail?: unknown
  details?: unknown
}

const LICENSE_VEHICLE_INCOMPATIBLE_MESSAGE =
  'Votre permis autorise uniquement les véhicules automatiques. Le véhicule sélectionné possède une boîte manuelle. Veuillez choisir un véhicule automatique.'

const reservationErrorMessages: Record<string, string> = {
  ACCOUNT_INACTIVE: 'Votre compte est désactivé. Contactez le support GetaCar.',
  DATE_OF_BIRTH_IN_FUTURE: 'La date de naissance indiquée dans votre profil est invalide.',
  DRIVING_LICENSE_CATEGORY_INCOMPATIBLE: 'La catégorie de votre permis ne permet pas de louer ce véhicule.',
  DRIVING_LICENSE_DETAILS_UNVERIFIED: 'Les informations de votre permis doivent être vérifiées avant de réserver.',
  DRIVING_LICENSE_EXPIRED: 'Votre permis de conduire a expiré. Veuillez le remplacer dans votre profil.',
  DRIVING_LICENSE_EXPIRES_TOO_SOON: 'Votre permis doit rester valide jusqu’à la fin de la location.',
  DRIVING_LICENSE_MISSING: 'Ajoutez votre permis de conduire à votre profil pour réserver.',
  DRIVING_LICENSE_NOT_VALID: 'Votre permis de conduire doit être validé avant de réserver.',
  EMAIL_NOT_VERIFIED: 'Confirmez votre adresse e-mail avant de réserver.',
  DURATION_TOO_SHORT: 'La période choisie est trop courte pour cette location.',
  DRAFT_EXPIRED: 'Cette réservation provisoire a expiré. Veuillez recommencer votre réservation.',
  DEPOSIT_NOT_AUTHORIZED: "La caution n'a pas été autorisée. Veuillez réessayer.",
  DEPOSIT_AUTHORIZATION_EXPIRED: 'La préautorisation de la caution a expiré. Veuillez recommencer votre réservation.',
  END_BEFORE_START: 'La date de fin doit être postérieure à la date de début.',
  END_NOT_AT_FIXED_HOUR: "L'heure de retour doit être fixée à 10 h.",
  END_REQUIRED: 'Indiquez une date de fin pour la location.',
  IDENTITY_CARD_EXPIRED: 'Votre carte d’identité est expirée. Mettez-la à jour dans votre profil.',
  IDENTITY_CARD_EXPIRES_TOO_SOON: 'Votre carte d’identité doit rester valide jusqu’à la fin de la location.',
  IDENTITY_CARD_MISSING: 'Ajoutez votre carte d’identité à votre profil pour réserver.',
  IDENTITY_CARD_NOT_VALID: 'Votre carte d’identité doit être validée avant de réserver.',
  INVALID_END: 'La date de fin indiquée est invalide.',
  INVALID_PERIOD: 'La période choisie est invalide. Vérifiez les dates et heures de début et de fin.',
  INVALID_START: 'La date de début indiquée est invalide.',
  PRICING_ERROR: 'Le prix de cette réservation n’a pas pu être calculé. Veuillez réessayer.',
  PRICING_NOT_CONFIGURED: 'Le tarif de ce véhicule est indisponible. Veuillez contacter le support.',
  PROFILE_INCOMPLETE: 'Complétez les informations obligatoires de votre profil avant de réserver.',
  PROFILE_NOT_ELIGIBLE: 'Votre profil ou vos documents ne remplissent pas les conditions de réservation.',
  PROFILE_NOT_VALID: 'Votre profil doit être validé avant de réserver.',
  START_REQUIRED: 'Indiquez une date de début pour la location.',
  START_IN_PAST: 'La date de début ne peut pas être dans le passé.',
  START_NOT_AT_FIXED_HOUR: "Choisissez un départ à 10 h, ou une heure future pour une réservation aujourd'hui après 10 h.",
  STRIPE_CARD_DECLINED: "La préautorisation de la caution a été refusée. Veuillez utiliser un autre moyen de paiement.",
  UNDER_MINIMUM_AGE: 'Vous devez avoir au moins 21 ans à la date de début de la location.',
  VEHICLE_INCOMPATIBLE_WITH_LICENSE: LICENSE_VEHICLE_INCOMPATIBLE_MESSAGE,
  VEHICLE_NOT_ACTIVE: 'Ce véhicule n’est actuellement pas disponible à la réservation.',
  VEHICLE_NOT_BOOKABLE: 'Ce véhicule n’est actuellement pas réservable.',
  VEHICLE_TRANSMISSION_UNKNOWN: 'La transmission de ce véhicule doit être vérifiée avant sa réservation.',
  VEHICLE_UNAVAILABLE: "Ce véhicule n'est pas disponible pour les dates sélectionnées. Veuillez choisir une autre période ou un autre véhicule.",
  RESERVATION_UNAVAILABLE: "Ce véhicule n'est plus disponible pour les dates sélectionnées. Veuillez choisir une autre période ou un autre véhicule.",
}

const reservationValidationFieldLabels: Record<string, string> = {
  end_at: 'Date de fin',
  insurance_type: 'Assurance',
  start_at: 'Date de début',
  vehicle_id: 'Véhicule',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorCodeMessage(code: unknown): string | null {
  if (typeof code !== 'string') {
    return null
  }

  return reservationErrorMessages[code] ?? null
}

function collectValidationMessages(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectValidationMessages)
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(collectValidationMessages)
  }

  return []
}

function normalizeTransmission(value: string | null | undefined): 'MANUAL' | 'AUTOMATIC' | null {
  const normalized = (value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (normalized === 'manuelle' || normalized === 'manual') {
    return 'MANUAL'
  }
  if (normalized === 'automatique' || normalized === 'automatic' || normalized === 'auto') {
    return 'AUTOMATIC'
  }
  return null
}

function getLicenseIssueMessage(issue: string | null | undefined): string {
  const text = (issue ?? '').toLowerCase()
  if (text.includes('expir')) {
    return 'Votre permis de conduire a expiré. Veuillez le remplacer dans votre profil.'
  }
  if (text.includes('attente')) {
    return 'Votre permis est en attente de validation par le gestionnaire.'
  }
  if (text.includes('refus')) {
    return 'Votre permis de conduire a été refusé. Veuillez le remplacer dans votre profil.'
  }
  if (text.includes('manqu')) {
    return 'Veuillez ajouter votre permis de conduire dans votre profil.'
  }
  return 'Votre permis de conduire doit être validé avant de réserver.'
}

function getSimulationErrorMessage(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof AxiosError && error.response && error.response.status < 500) {
    const data = error.response.data
    if (isRecord(data)) {
      const codeMessage = getErrorCodeMessage(data.code)
      if (codeMessage) {
        return { message: codeMessage, retryable: false }
      }
      if (data.start_at || data.end_at) {
        return { message: 'Les dates ou heures de location sont invalides ou déjà passées. Veuillez choisir une autre période.', retryable: false }
      }
      if (data.insurance_type) {
        return { message: "La formule d'assurance sélectionnée est invalide.", retryable: false }
      }
    }
    return { message: "Le calcul du paiement n'a pas pu être effectué. Veuillez réessayer ou contacter le support.", retryable: true }
  }
  return { message: 'Le calcul du paiement est momentanément indisponible. Veuillez réessayer.', retryable: true }
}

function getPaymentPreparationErrorMessage(error: unknown): string {
  if (error instanceof AxiosError && isRecord(error.response?.data)) {
    const data = error.response.data
    const details = isRecord(data.details) ? data.details : {}
    if (Array.isArray(details.eligibility_errors)) {
      const messages = details.eligibility_errors.map(getErrorCodeMessage).filter((message): message is string => message !== null)
      if (messages.length) {
        return [...new Set(messages)].join(' ')
      }
    }
    const message = getErrorCodeMessage(data.code)
    if (message) {
      return message
    }
  }
  return "Le paiement n'a pas pu être préparé. Veuillez réessayer ou contacter le support."
}

function getReservationValidationMessage(payload: ReservationApiErrorPayload): string | null {
  const validationEntries = Object.entries(payload).filter(
    ([key, value]) => !['code', 'message', 'detail', 'details'].includes(key) && value !== undefined,
  )

  const validationMessages = validationEntries.flatMap(([, value]) => collectValidationMessages(value))
  if (validationMessages.length === 0) {
    return null
  }

  const descriptions = validationEntries.map(([field, value]) => {
    const label = reservationValidationFieldLabels[field] ?? field
    const messages = collectValidationMessages(value)
    return `${label} : ${messages.join(' ')}`
  })

  return descriptions.join(' ')
}

function getReservationCreationErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data
    if (isRecord(payload)) {
      const errorPayload = payload as ReservationApiErrorPayload
      const details = isRecord(errorPayload.details) ? errorPayload.details : {}
      const eligibilityErrors = Array.isArray(details.eligibility_errors)
        ? details.eligibility_errors
        : []
      const eligibilityMessages = eligibilityErrors
        .map(getErrorCodeMessage)
        .filter((message): message is string => message !== null)
      if (eligibilityMessages.length > 0) {
        return `Votre profil ne permet pas cette réservation : ${[...new Set(eligibilityMessages)].join(' ')}`
      }

      const codeMessage = getErrorCodeMessage(errorPayload.code)
        ?? getErrorCodeMessage(details.availability_error)
      if (codeMessage) {
        return codeMessage
      }

      const nestedValidationErrors = isRecord(details.validation_errors)
        ? getReservationValidationMessage(details.validation_errors)
        : null
      const validationMessage = nestedValidationErrors ?? getReservationValidationMessage(errorPayload)
      if (validationMessage) {
        return validationMessage
      }

      for (const candidate of [errorPayload.message, errorPayload.detail]) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim()
        }

        if (isRecord(candidate)) {
          const nestedFieldErrors = getReservationValidationMessage(candidate)
          if (nestedFieldErrors) {
            return nestedFieldErrors
          }
        }

        const nestedValidation = collectValidationMessages(candidate)
        if (nestedValidation.length > 0) {
          return nestedValidation.join(' ')
        }
      }
    }

    if (!error.response) {
      return 'Le serveur est momentanément injoignable. Vérifiez votre connexion puis réessayez.'
    }
  }

  return 'La réservation n’a pas pu être créée. Veuillez vérifier les informations et réessayer.'
}

function logReservationCreationError(error: unknown): void {
  if (!import.meta.env.DEV) {
    return
  }

  if (error instanceof AxiosError) {
    const payload = isRecord(error.response?.data) ? error.response.data : {}
    const details = isRecord(payload.details) ? payload.details : {}
    const validationFields = Object.keys(payload).filter(
      (key) => !['code', 'message', 'detail', 'details'].includes(key),
    )

    console.warn('Reservation creation request failed', {
      endpoint: error.config?.url,
      status: error.response?.status ?? null,
      code: typeof payload.code === 'string' ? payload.code : null,
      validationFields,
      eligibilityErrorCodes: Array.isArray(details.eligibility_errors)
        ? details.eligibility_errors.filter((code): code is string => typeof code === 'string')
        : [],
    })
    return
  }

  console.warn('Reservation creation failed before an API response', {
    errorType: error instanceof Error ? error.name : typeof error,
  })
}

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
    timeZone: 'Europe/Brussels',
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

function isReservationConfirmed(status: string | null | undefined): boolean {
  return status === 'CONFIRMEE' || status === 'PAYEE'
}

function mapInsuranceToBackend(insurance: InsuranceOptionKey | null): 'STANDARD' | 'COMPLEMENTAIRE' | 'DUO' | 'OMNIUM' | null {
  if (insurance === 'complementary') {
    return 'COMPLEMENTAIRE'
  }

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

  if (normalizedType === 'COMPLEMENTAIRE') {
    return 'complementary'
  }

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
  clientSecret: string
  initialCardholderName: string
  isSubmitting: boolean
  onBack: () => void
  returnUrl: string
  onSubmit: (paymentStatus?: string) => Promise<void>
  verifyBeforePayment: () => Promise<boolean>
}

function StripePaymentForm({ clientSecret, initialCardholderName, isSubmitting, onBack, returnUrl, onSubmit, verifyBeforePayment }: StripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [cardholderName, setCardholderName] = useState(initialCardholderName)
  const [cardholderError, setCardholderError] = useState<string | null>(null)
  const confirmationLockRef = useRef(false)

  const handleResolvedPaymentIntent = useCallback(async (status: string | undefined) => {
    if (status === 'succeeded' || status === 'processing') {
      await onSubmit(status)
      return true
    }

    if (status === 'requires_payment_method') {
      setPaymentError('Paiement échoué. Veuillez recommencer votre réservation.')
      return true
    }

    if (status === 'requires_action') {
      return true
    }

    return false
  }, [onSubmit])

  const handleSubmit = async () => {
    if (!stripe || !elements || isSubmitting || isConfirming || confirmationLockRef.current) {
      return
    }

    if (!paymentMethod) {
      setPaymentError('Veuillez choisir un moyen de paiement.')
      return
    }

    if (paymentMethod === 'card' && !cardholderName.trim()) {
      setCardholderError('Veuillez renseigner le nom et le prénom du titulaire.')
      return
    }

    confirmationLockRef.current = true
    setIsConfirming(true)
    setPaymentError(null)

    try {
      const existingPaymentIntentResult = await stripe.retrievePaymentIntent(clientSecret)
      const existingPaymentIntentStatus = existingPaymentIntentResult.paymentIntent?.status

      if (existingPaymentIntentStatus === 'succeeded' || existingPaymentIntentStatus === 'processing') {
        await onSubmit(existingPaymentIntentStatus)
        return
      }

      if (!await verifyBeforePayment()) {
        setPaymentError('Les vérifications avant paiement ont échoué ou sont indisponibles.')
        return
      }

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
          ...(paymentMethod === 'card'
            ? { payment_method_data: { billing_details: { name: cardholderName.trim() } } }
            : {}),
        },
        redirect: 'if_required',
      })

      if (result.error) {
        if (result.error.code === 'payment_intent_unexpected_state') {
          const latestPaymentIntentResult = await stripe.retrievePaymentIntent(clientSecret)
          const latestPaymentIntentStatus = latestPaymentIntentResult.paymentIntent?.status

          if (latestPaymentIntentStatus === 'succeeded' || latestPaymentIntentStatus === 'processing') {
            await onSubmit(latestPaymentIntentStatus)
            return
          }
        }

        setPaymentError('Paiement échoué. Veuillez recommencer votre réservation.')
        return
      }

      const confirmedPaymentIntent = result.paymentIntent ?? (await stripe.retrievePaymentIntent(clientSecret)).paymentIntent
      const wasHandled = await handleResolvedPaymentIntent(confirmedPaymentIntent?.status)

      if (!wasHandled) {
        setPaymentError('Le statut du paiement Stripe est en attente. Veuillez patienter quelques instants avant de réessayer.')
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>
      setPaymentError(axiosError.response?.data?.detail || 'Le paiement n\'a pas pu etre confirme. Veuillez reessayer.')
    } finally {
      confirmationLockRef.current = false
      setIsConfirming(false)
    }
  }

  return (
    <div className="space-y-4">
      {paymentMethod === 'card' ? (
        <Input
          label="Nom et prénom du titulaire"
          name="cardholder-name"
          autoComplete="cc-name"
          required
          value={cardholderName}
          error={cardholderError ?? undefined}
          onChange={(event) => {
            setCardholderName(event.target.value)
            setCardholderError(null)
          }}
        />
      ) : null}
      <div>
        <PaymentElement
          onChange={(event) => setPaymentMethod(event.value.type || null)}
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'bancontact'],
            fields: { card: { billingDetails: { name: 'never' } } },
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

function ReservationVehicleThumbnail({ vehicle }: { vehicle: PublicVehicle }) {
  const [imageFailed, setImageFailed] = useState(false)
  const photoUrl = resolveMediaUrl(vehicle.main_photo?.file)

  if (!photoUrl || imageFailed) {
    return (
      <div className="flex aspect-[7/5] w-full max-w-[260px] items-center justify-center rounded-lg bg-slate-100 text-slate-400" role="img" aria-label="Photo du véhicule indisponible">
        <Car aria-hidden="true" size={40} />
      </div>
    )
  }

  return (
    <img
      src={photoUrl}
      alt={`${vehicle.brand} ${vehicle.model_name}`}
      className="aspect-[7/5] w-full max-w-[260px] rounded-lg object-contain"
      onError={() => setImageFailed(true)}
    />
  )
}

type VehicleDetailTab = 'features' | 'equipment' | 'conditions'

type ReservationProgressStep = {
  order: number
  label: string
}

type ReservationStepNumber = 1 | 2 | 3 | 4
// 'duo' et 'omnium' sont des formules historiques, conservées uniquement pour les anciennes réservations.
type InsuranceOptionKey = 'standard' | 'complementary' | 'duo' | 'omnium'

const INSURANCE_TITLES: Record<InsuranceOptionKey, string> = {
  standard: 'Standard',
  complementary: 'Complémentaire',
  duo: 'Duo (ancienne formule)',
  omnium: 'Omnium (ancienne formule)',
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const { isAuthenticated } = useAuth()
  const reservationIdParam = searchParams.get('reservationId')
  const reservationIdFromQuery = reservationIdParam ? Number(reservationIdParam) : Number.NaN
  const hasReservationIdInQuery = Number.isInteger(reservationIdFromQuery) && reservationIdFromQuery > 0
  const resume = getReservationResume({
    from: `${location.pathname}${location.search}`,
    reservationDraft: (location.state as { reservationDraft?: unknown } | null)?.reservationDraft,
  })

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [activeTab, setActiveTab] = useState<VehicleDetailTab>('features')
  const [isLoading, setIsLoading] = useState(true)
  const [isNotFound, setIsNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [simulationContextMessage, setSimulationContextMessage] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<ReservationStepNumber>(() => (hasReservationIdInQuery || resume ? 3 : 1))
  const [selectedInsurance, setSelectedInsurance] = useState<InsuranceOptionKey | null>(() => resume?.reservationDraft.insurance ?? null)
  const [createdReservation, setCreatedReservation] = useState<ReservationCreateResponse | null>(null)
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null)
  const [paymentWorkflowError, setPaymentWorkflowError] = useState<string | null>(null)
  const [isPreparingPayment, setIsPreparingPayment] = useState(false)
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)
  const [confirmedPaymentIntentStatus, setConfirmedPaymentIntentStatus] = useState<string | null>(null)
  const [hasConfirmationTimedOut, setHasConfirmationTimedOut] = useState(false)
  const [hasPaymentFailed, setHasPaymentFailed] = useState(false)
  const [isRefreshingReservationStatus, setIsRefreshingReservationStatus] = useState(false)
  const finalizedPaymentClientSecretRef = useRef<string | null>(null)
  const reservationCreationInFlightRef = useRef(false)
  const confirmationPollTimerRef = useRef<number | null>(null)
  const confirmationPollDeadlineRef = useRef<number | null>(null)

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

  const licenseTransmission = profileProgressQuery.data?.driving_license_transmission ?? null
  const licenseTypeLabel =
    licenseTransmission === 'AUTOMATIC_ONLY' ? 'Automatique' : licenseTransmission === 'MANUAL_AND_AUTOMATIC' ? 'Manuel' : null
  const vehicleTransmissionKind = normalizeTransmission(vehicle?.transmission)
  const vehicleTransmissionLabel =
    vehicleTransmissionKind === 'MANUAL' ? 'Manuelle' : vehicleTransmissionKind === 'AUTOMATIC' ? 'Automatique' : null
  const licenseVehicleCompatibility: 'compatible' | 'incompatible' | 'unknown' =
    !profileProgressQuery.data?.driving_license_valid
      ? 'unknown'
      : vehicleTransmissionKind === null || licenseTransmission === null
        ? 'incompatible'
        : licenseTransmission === 'AUTOMATIC_ONLY' && vehicleTransmissionKind === 'MANUAL'
          ? 'incompatible'
          : 'compatible'
  const licenseVehicleIncompatibilityMessage =
    vehicleTransmissionKind !== null && licenseTransmission !== null
      ? LICENSE_VEHICLE_INCOMPATIBLE_MESSAGE
      : 'Le type de permis ou la transmission du véhicule ne peut pas être vérifié. Veuillez contacter le gestionnaire.'

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
    }

    if (!drivingLicenseValid) {
      errors.push(getLicenseIssueMessage(profileProgressQuery.data?.driving_license_issue))
    } else if (licenseVehicleCompatibility === 'incompatible') {
      errors.push(licenseVehicleIncompatibilityMessage)
    }

    if (!identityCardValid) {
      errors.push("Votre carte d'identité doit être validée avant de réserver.")
    }

    return errors
  }, [isAuthenticated, licenseVehicleCompatibility, licenseVehicleIncompatibilityMessage, profileProgressQuery.data, profileQuery.data])

  const reservationSteps: ReservationProgressStep[] = [
    { order: 1, label: 'Véhicule & période' },
    { order: 2, label: 'Assurance' },
    { order: 3, label: 'Récapitulatif et paiement' },
    { order: 4, label: 'Confirmation' },
  ]

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

  const insuranceOptions: Array<{ key: 'standard' | 'complementary'; title: string; deductible: number }> = [
    { key: 'standard', title: INSURANCE_TITLES.standard, deductible: 1000 },
    { key: 'complementary', title: INSURANCE_TITLES.complementary, deductible: 300 },
  ]

  const restoredInsuranceSelection = useMemo(
    () => mapInsuranceToUi(reservationStateQuery.data?.insurance_type ?? createdReservation?.insurance_type),
    [createdReservation?.insurance_type, reservationStateQuery.data?.insurance_type],
  )

  const activeReservation = reservationStateQuery.data ?? createdReservation
  const effectiveInsuranceSelection: InsuranceOptionKey | null = selectedInsurance
    ?? restoredInsuranceSelection
    ?? (hasReservationIdInQuery ? null : 'standard')
  const selectedInsuranceOption = effectiveInsuranceSelection
    ? { key: effectiveInsuranceSelection, title: INSURANCE_TITLES[effectiveInsuranceSelection] }
    : null

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

    const reservation = reservationStateQuery.data ?? createdReservation
    if (reservation?.is_daily_rate_booking ?? !hasReservationIdInQuery) {
      const localDate = (raw: string, value: Date) => /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? toDateValue(value) : raw.slice(0, 10)
      const startDateValue = Date.parse(`${localDate(start, startDate)}T00:00:00Z`)
      const endDateValue = Date.parse(`${localDate(end, endDate)}T00:00:00Z`)
      const days = Math.round((endDateValue - startDateValue) / (24 * 60 * 60 * 1000))
      return days > 0 ? days : 0
    }

    const rawDays = (endTimestamp - startTimestamp) / (24 * 60 * 60 * 1000)
    if (!Number.isFinite(rawDays) || rawDays <= 0) {
      return 0
    }

    return Math.ceil(rawDays)
  }, [createdReservation, end, hasReservationIdInQuery, reservationStateQuery.data, start])

  const cautionLabel = formatCurrencyFr(activeReservation?.deposit_amount ?? vehicle?.conditions?.minimum_deposit) ?? 'Non renseigné'
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
  const paymentChecksQuery = useQuery({
    queryKey: ['reservation-payment-checks', vehicle?.id, start, end, simulationReservationId],
    queryFn: () => getPaymentChecks({
      vehicle_id: vehicle!.id,
      start_at: start!,
      end_at: end!,
      ...(simulationReservationId ? { reservation_id: simulationReservationId } : {}),
    }),
    enabled: isAuthenticated && currentStep === 3 && Boolean(vehicle && start && end),
    retry: false,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  })
  const canProceedToPayment = isAuthenticated && !profileQuery.isLoading && !profileProgressQuery.isLoading
    && paymentErrors.length === 0 && !paymentChecksQuery.isError && !paymentChecksQuery.isPending
    && !!paymentChecksQuery.data && Object.values(paymentChecksQuery.data).every((check) => check.valid)

  const canRunSimulationQuery = Boolean(vehicle && start && end && (backendInsuranceType || simulationReservationId))

  const simulationQuery = useQuery({
    queryKey: ['vehicle-detail-reservation-simulation', vehicle?.id, start, end, backendInsuranceType, simulationReservationId],
    queryFn: () => {
      const payload: {
        vehicle_id: number
        start_at: string
        end_at: string
        insurance_type?: 'STANDARD' | 'COMPLEMENTAIRE' | 'DUO' | 'OMNIUM'
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
    retry: (failureCount, error) =>
      !(error instanceof AxiosError && error.response && error.response.status < 500) && failureCount < 2,
  })

  const complementarySimulationQuery = useQuery({
    queryKey: ['vehicle-detail-reservation-simulation', vehicle?.id, start, end, 'COMPLEMENTAIRE', simulationReservationId],
    queryFn: () => simulatePrice({
      vehicle_id: vehicle!.id,
      start_at: start!,
      end_at: end!,
      insurance_type: 'COMPLEMENTAIRE',
      ...(simulationReservationId ? { reservation_id: simulationReservationId } : {}),
    }),
    enabled: currentStep === 2 && Boolean(vehicle && start && end),
    retry: (failureCount, error) =>
      !(error instanceof AxiosError && error.response && error.response.status < 500) && failureCount < 2,
  })

  const complementarySimulation = complementarySimulationQuery.isError ? undefined : complementarySimulationQuery.data
  const complementaryDays = complementarySimulation?.billed_days
  const complementaryAmount = complementarySimulation ? Number(complementarySimulation.insurance_amount) : Number.NaN
  const complementaryRate = complementaryDays && complementaryDays > 0 && Number.isFinite(complementaryAmount)
    ? formatCurrencyFr(complementaryAmount / complementaryDays)
    : null
  const complementaryTotal = Number.isFinite(complementaryAmount) ? formatCurrencyFr(complementaryAmount) : null
  const insuranceSummary = simulationQuery.isError ? undefined : simulationQuery.data

  const insuranceSummaryVehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model_name}` : 'Véhicule indisponible'
  const insuranceSummaryStartLabel = formatDateTimeFr(start)
  const insuranceSummaryEndLabel = formatDateTimeFr(end)
  const isDailyRental = activeReservation?.is_daily_rate_booking ?? !hasReservationIdInQuery
  const insuranceSummaryDurationLabel = isDailyRental && rentalDays > 0
    ? `${rentalDays} jour${rentalDays > 1 ? 's' : ''}`
    : formatDurationFromHours(simulationQuery.data?.duration_hours, rentalDays)

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
    },
    onError: (error) => {
      logReservationCreationError(error)
      setPaymentWorkflowError(getReservationCreationErrorMessage(error))
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

    try {
      const depositResult = await depositAuthorizationMutation.mutateAsync(reservationId)
      const normalizedDepositStatus = depositResult.deposit_status.toUpperCase()
      if (normalizedDepositStatus !== 'AUTORISEE' && normalizedDepositStatus !== 'VALIDE') {
        throw new Error(depositResult.authorization_note || 'La preautorisation Stripe de la caution a ete refusee.')
      }

      const paymentIntentResult = await paymentIntentMutation.mutateAsync(reservationId)

      if (!paymentIntentResult.client_secret) {
        throw new Error('Le backend n\'a pas retourne de client_secret Stripe.')
      }

      setPaymentClientSecret(paymentIntentResult.client_secret)
    } catch (error) {
      setPaymentWorkflowError(getPaymentPreparationErrorMessage(error))
    } finally {
      setIsPreparingPayment(false)
    }
  }, [depositAuthorizationMutation, paymentIntentMutation])

  const loadExistingPaymentClientSecret = useCallback(async (reservationId: number) => {
    setPaymentWorkflowError(null)

    try {
      const paymentIntentResult = await paymentIntentMutation.mutateAsync(reservationId)

      if (!paymentIntentResult.client_secret) {
        throw new Error('Le backend n\'a pas retourne de client_secret Stripe.')
      }

      setPaymentClientSecret(paymentIntentResult.client_secret)
    } catch (error) {
      setPaymentWorkflowError(getPaymentPreparationErrorMessage(error))
    }
  }, [paymentIntentMutation])

  const clearConfirmationPollTimer = useCallback(() => {
    if (confirmationPollTimerRef.current !== null) {
      window.clearTimeout(confirmationPollTimerRef.current)
      confirmationPollTimerRef.current = null
    }
  }, [])

  const refreshReservationStatus = useCallback(async (reservationId: number): Promise<ReservationCreateResponse> => {
    const refreshedReservation = await getReservationById(reservationId)
    setCreatedReservation(refreshedReservation)
    return refreshedReservation
  }, [])

  const handlePaymentSuccess = async (paymentStatus?: string) => {
    if (!activeReservation || !paymentClientSecret) {
      return
    }

    if (finalizedPaymentClientSecretRef.current === paymentClientSecret) {
      return
    }

    finalizedPaymentClientSecretRef.current = paymentClientSecret
    setCreatedReservation(activeReservation)

    setIsConfirmingPayment(true)
    setConfirmedPaymentIntentStatus(paymentStatus ?? null)
    setHasConfirmationTimedOut(false)
    setPaymentWorkflowError(null)
    setCurrentStep(4)
    confirmationPollDeadlineRef.current = Date.now() + RESERVATION_CONFIRMATION_TIMEOUT_MS

  }

  const handleRefreshReservationStatus = useCallback(async () => {
    const reservationId = createdReservation?.id

    if (!reservationId) {
      return
    }

    setIsRefreshingReservationStatus(true)
    setPaymentWorkflowError(null)

    try {
      const refreshedReservation = await refreshReservationStatus(reservationId)

      if (isReservationConfirmed(refreshedReservation.status)) {
        setHasConfirmationTimedOut(false)
        setIsConfirmingPayment(false)
        return
      }

      if (refreshedReservation.status === 'PAIEMENT_ECHOUE') {
        setHasPaymentFailed(true)
        setIsConfirmingPayment(false)
        return
      }

      setHasConfirmationTimedOut(true)
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>
      setPaymentWorkflowError(axiosError.response?.data?.detail || 'Impossible de récupérer le statut de la réservation pour le moment.')
    } finally {
      setIsRefreshingReservationStatus(false)
    }
  }, [createdReservation?.id, refreshReservationStatus])

  useEffect(() => {
    if (currentStep < 4 || !isConfirmingPayment || hasConfirmationTimedOut) {
      clearConfirmationPollTimer()
      return
    }

    const reservationId = createdReservation?.id

    if (!reservationId || isReservationConfirmed(createdReservation.status)) {
      setIsConfirmingPayment(false)
      clearConfirmationPollTimer()
      return
    }

    let isCancelled = false

    const pollOnce = async () => {
      try {
        const refreshedReservation = await refreshReservationStatus(reservationId)

        if (isCancelled) {
          return
        }

        if (isReservationConfirmed(refreshedReservation.status)) {
          setHasConfirmationTimedOut(false)
          setIsConfirmingPayment(false)
          clearConfirmationPollTimer()
          return
        }

        if (refreshedReservation.status === 'PAIEMENT_ECHOUE') {
          setHasPaymentFailed(true)
          setIsConfirmingPayment(false)
          clearConfirmationPollTimer()
          return
        }

        if ((confirmationPollDeadlineRef.current ?? 0) <= Date.now()) {
          setHasConfirmationTimedOut(true)
          setIsConfirmingPayment(false)
          clearConfirmationPollTimer()
          return
        }

        confirmationPollTimerRef.current = window.setTimeout(() => {
          void pollOnce()
        }, RESERVATION_CONFIRMATION_POLL_DELAY_MS)
      } catch (error) {
        if (isCancelled) {
          return
        }

        if ((confirmationPollDeadlineRef.current ?? 0) <= Date.now()) {
          const axiosError = error as AxiosError<{ detail?: string }>
          setPaymentWorkflowError(axiosError.response?.data?.detail || 'Impossible de récupérer la confirmation de la réservation pour le moment.')
          setHasConfirmationTimedOut(true)
          setIsConfirmingPayment(false)
          clearConfirmationPollTimer()
          return
        }

        confirmationPollTimerRef.current = window.setTimeout(() => {
          void pollOnce()
        }, RESERVATION_CONFIRMATION_POLL_DELAY_MS)
      }
    }

    void pollOnce()

    return () => {
      isCancelled = true
      clearConfirmationPollTimer()
    }
  }, [
    clearConfirmationPollTimer,
    createdReservation,
    currentStep,
    hasConfirmationTimedOut,
    isConfirmingPayment,
    refreshReservationStatus,
  ])

  useEffect(() => () => {
    clearConfirmationPollTimer()
  }, [clearConfirmationPollTimer])

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
    if (currentStep !== 3 || !canProceedToPayment || !simulationQuery.data || simulationQuery.isError) {
      return
    }

    if (
      createReservationMutation.isPending
      || reservationCreationInFlightRef.current
      || depositAuthorizationMutation.isPending
      || paymentIntentMutation.isPending
      || isPreparingPayment
      || paymentClientSecret
      || paymentWorkflowError
    ) {
      // Stop auto-retrying once an attempt has failed: avoids an infinite loop of deposit/PaymentIntent calls.
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

        if (reservationCreationInFlightRef.current) {
          return
        }

        reservationCreationInFlightRef.current = true
        let reservation: ReservationCreateResponse
        try {
          reservation = await createReservationMutation.mutateAsync(reservationPayload)
        } catch {
          return
        } finally {
          reservationCreationInFlightRef.current = false
        }

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
    paymentWorkflowError,
    preparePayment,
    reservationPayload,
    simulationQuery.data,
    simulationQuery.isError,
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

    return (vehicle.equipment ?? []).map((item) => buildTabEntry(item.label, 'Inclus'))
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

  const paymentDurationLabel = insuranceSummaryDurationLabel
  const startBrusselsClock = start && Number.isFinite(new Date(start).getTime())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(start))
    : null
  const endBrusselsClock = end && Number.isFinite(new Date(end).getTime())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(end))
    : null
  const durationHours = Number(simulationQuery.data?.duration_hours)
  const hasShortBilledDay = isDailyRental && endBrusselsClock === '10:00' && (
    (startBrusselsClock !== null && startBrusselsClock > '10:00')
    || (Number.isFinite(durationHours) && durationHours > 0 && durationHours < rentalDays * 24)
  )
  const hasSimulationSummary = Boolean(simulationQuery.data)
  const shouldShowSimulationError = simulationQuery.isError && !hasSimulationSummary
  const simulationError = getSimulationErrorMessage(simulationQuery.error)
  const paymentInsuranceLabel = selectedInsuranceOption?.title
    ?? (mapInsuranceToUi(simulationQuery.data?.insurance_type)
      ? INSURANCE_TITLES[mapInsuranceToUi(simulationQuery.data?.insurance_type) as InsuranceOptionKey]
      : 'Non sélectionnée')
  const paymentRentalAmountLabel = formatCurrencyFr(simulationQuery.data?.rental_amount) ?? 'Non renseigné'
  const paymentInsuranceAmountLabel = formatCurrencyFr(simulationQuery.data?.insurance_amount) ?? 'Non renseigné'
  const paymentTotalAmountLabel = formatCurrencyFr(simulationQuery.data?.total_amount) ?? 'Non renseigné'
  const confirmationReservation = createdReservation?.status === 'CONFIRMEE' && createdReservation.id === activeReservation?.id
    ? createdReservation
    : activeReservation
  const displayedCurrentStep: ReservationStepNumber = confirmationReservation?.status === 'CONFIRMEE' ? 4 : currentStep

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
    <section className="py-8 sm:py-10" aria-label="Réservation du véhicule">
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
              <header className="mb-4 flex justify-end">
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
                      <p className="text-3xl font-semibold text-[#1F2937]">{formatVehicleDailyRate(vehicle.category_daily_rate)}</p>
                      <p className="mt-1 text-xs text-slate-500">TVA de 21 % comprise</p>
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
              <Card className="mt-2" header={<h2 className="text-lg font-semibold text-black">Choisissez votre assurance</h2>}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 px-4 py-3 text-[15px] leading-7 text-black sm:text-base sm:leading-8">
                    <span className="font-semibold">{insuranceSummaryVehicleLabel}</span>
                    <span>·</span>
                    <span>Départ {insuranceSummaryStartLabel}</span>
                    <span>·</span>
                    <span>Retour {insuranceSummaryEndLabel}</span>
                    <span>·</span>
                    <span className="font-medium">{insuranceSummaryDurationLabel}</span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {insuranceOptions.map((option) => {
                      const isSelected = effectiveInsuranceSelection === option.key
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setSelectedInsurance(option.key)}
                          className={[
                            'flex h-full flex-col items-center rounded-2xl border bg-white p-4 text-center text-black transition-all sm:p-5',
                            isSelected
                              ? 'border-[#7C3AED]'
                              : 'border-slate-200 hover:border-slate-400',
                          ].join(' ')}
                          aria-pressed={isSelected}
                        >
                          <p className="text-lg font-bold uppercase">{option.title.toUpperCase()}</p>
                          <ul className="mt-3 w-full space-y-1 text-left text-sm leading-5">
                            <li>• Assurance de base incluse</li>
                            <li>• Franchise{option.key === 'complementary' ? ' réduite' : ''} : <strong>{formatCurrencyFr(option.deductible)}</strong></li>
                            <li>• Caution : <strong>{cautionLabel}</strong></li>
                          </ul>
                          <p className="mt-auto pt-4 text-lg font-bold text-[#7C3AED] sm:text-xl">
                            {option.key === 'standard'
                              ? '0 € supplémentaire'
                              : complementaryRate && complementaryTotal && complementaryDays
                                ? `+${complementaryRate} TVAC/jour — ${complementaryTotal} TVAC pour ${complementaryDays} jour${complementaryDays > 1 ? 's' : ''}`
                                : complementarySimulationQuery.isPending ? 'Calcul en cours…' : 'Tarif indisponible'}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="space-y-1 text-center text-xs text-black">
                    <p>Franchise : montant qui peut rester à votre charge en cas de dommage.</p>
                    <p>Caution : préautorisation distincte sur votre carte.</p>
                  </div>

                  {complementarySimulationQuery.isError && effectiveInsuranceSelection !== 'complementary' ? (
                    <div className="space-y-2">
                      <Alert variant="danger" title="Tarif complémentaire indisponible" message={getSimulationErrorMessage(complementarySimulationQuery.error).message} />
                      <Button variant="secondary" onClick={() => void complementarySimulationQuery.refetch()}>Réessayer</Button>
                    </div>
                  ) : null}

                  {simulationQuery.isError ? (
                    <div className="space-y-2">
                      <Alert variant="danger" title="Tarification indisponible" message={getSimulationErrorMessage(simulationQuery.error).message} />
                      <Button variant="secondary" onClick={() => void simulationQuery.refetch()}>Réessayer</Button>
                    </div>
                  ) : !insuranceSummary ? (
                    <p className="text-center text-sm text-black">{canRunSimulationQuery ? 'Calcul en cours…' : 'Tarification indisponible'}</p>
                  ) : (
                    <div className="mx-auto w-full space-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-black md:w-[65%] sm:px-5 sm:text-base">
                      <div className="flex justify-between"><span>Location</span><span className="font-medium">{formatCurrencyFr(insuranceSummary.rental_amount) ?? 'Non renseigné'}</span></div>
                      <div className="flex justify-between"><span>Assurance</span><span className="font-medium">{formatCurrencyFr(insuranceSummary.insurance_amount) ?? 'Non renseigné'}</span></div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold sm:text-lg"><span>Total</span><span>{formatCurrencyFr(insuranceSummary.total_amount) ?? 'Non renseigné'}{effectiveInsuranceSelection === 'standard' || effectiveInsuranceSelection === 'complementary' ? ' TVAC' : ''}</span></div>
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button variant="secondary" onClick={() => setCurrentStep(1)}>Retour</Button>
                    <Button onClick={() => setCurrentStep(3)} disabled={!effectiveInsuranceSelection}>Continuer</Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full shrink-0">
              <Card className="mx-auto mt-2 max-w-3xl" header={<h2 className="text-lg font-semibold text-[#1F2937]">Récapitulatif et paiement</h2>}>
                <div className="divide-y divide-slate-200 [&>section]:py-4 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
                  <section className="-mx-6 px-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Votre réservation</p>
                    <div className={`mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-[auto] auto-rows-fr items-center gap-x-4 gap-y-4 text-[15px] text-slate-700 [overflow-wrap:anywhere] sm:text-base md:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-10 md:gap-y-2 ${isAuthenticated ? 'md:grid-rows-[repeat(7,minmax(1.5rem,1fr))]' : 'md:grid-rows-[repeat(6,minmax(1.5rem,1fr))]'}`}>
                      <div className="col-span-2 w-full max-w-[260px] justify-self-center md:col-span-1 md:row-span-full">
                        <ReservationVehicleThumbnail key={vehicle.id} vehicle={vehicle} />
                      </div>
                      <dl className="contents [&>div]:contents [&_dd]:text-right [&_dd]:font-semibold [&_dd]:text-slate-900">
                        <div><dt>Véhicule</dt><dd>{vehicle.brand} {vehicle.model_name}</dd></div>
                        <div><dt>Départ</dt><dd>{formatDateTimeFr(start)}</dd></div>
                        <div><dt>Retour</dt><dd>{formatDateTimeFr(end)}</dd></div>
                        <div><dt>Durée</dt><dd>{paymentDurationLabel}</dd></div>
                        <div><dt>Assurance</dt><dd>{paymentInsuranceLabel}</dd></div>
                        {isAuthenticated ? (
                          <div><dt>Type de permis</dt><dd>{licenseTypeLabel ?? '—'}</dd></div>
                        ) : null}
                        <div><dt>Transmission du véhicule</dt><dd>{vehicleTransmissionLabel ?? '—'}</dd></div>
                      </dl>
                    </div>
                    {hasShortBilledDay ? (
                      <p className="mt-3 text-sm text-slate-600">Une journée facturée comporte moins de 24 heures ; le retour est prévu à 10 h.</p>
                    ) : null}
                  </section>

                  <section>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Paiement</p>
                    {simulationQuery.isLoading ? (
                      <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
                        <LoadingSpinner size="sm" aria-label="Chargement du récapitulatif paiement" />
                        Calcul en cours...
                      </div>
                    ) : shouldShowSimulationError ? (
                      <div className="mt-3 space-y-3">
                        <Alert
                          variant="danger"
                          title="Récapitulatif indisponible"
                          message={simulationError.message}
                        />
                        {simulationError.retryable ? (
                          <Button variant="secondary" onClick={() => void simulationQuery.refetch()}>Réessayer</Button>
                        ) : null}
                      </div>
                    ) : (
                      <dl className="mt-3 space-y-2 text-[15px] text-slate-700 sm:text-base">
                        <div className="flex justify-between gap-4"><dt>Location</dt><dd className="font-semibold text-slate-900">{paymentRentalAmountLabel}</dd></div>
                        <div className="flex justify-between gap-4"><dt>Assurance</dt><dd className="font-semibold text-slate-900">{paymentInsuranceAmountLabel}</dd></div>
                        <div className="flex items-baseline justify-between gap-4 rounded-xl bg-violet-50 px-4 py-3">
                          <dt className="font-semibold text-slate-900">Total à payer</dt>
                          <dd className="text-2xl font-bold tracking-tight text-[#7C3AED] sm:text-3xl">{paymentTotalAmountLabel}</dd>
                        </div>
                        {!hasReservationIdInQuery ? (
                          <div className="text-xs text-slate-500">TVA de 21 % comprise pour la location et l'assurance.</div>
                        ) : null}
                        <div className="flex justify-between gap-4 text-sm text-slate-600">
                          <dt>Caution (préautorisation séparée)</dt><dd className="font-medium">{cautionLabel}</dd>
                        </div>
                      </dl>
                    )}
                    {!hasReservationIdInQuery && cautionLabel !== 'Non renseigné' ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Caution de {cautionLabel} préautorisée sur votre carte. Libérée après restitution et contrôle du véhicule, sous réserve des sommes dues.
                      </p>
                    ) : null}
                  </section>

                  {isAuthenticated ? (
                    <section>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Vérifications avant paiement</p>
                      <dl className="mt-3 space-y-2 text-[15px] text-slate-700 sm:text-base">
                        {[
                          { label: 'Compte client', check: paymentChecksQuery.data?.account },
                          { label: "Carte d'identité", check: paymentChecksQuery.data?.identity },
                          { label: 'Permis de conduire', check: paymentChecksQuery.data?.license },
                          { label: 'Compatibilité permis/véhicule', check: paymentChecksQuery.data?.compatibility },
                          { label: 'Disponibilité du véhicule', check: paymentChecksQuery.data?.availability },
                        ].map(({ label, check }) => (
                          <div key={label} className="flex justify-between gap-4">
                            <dt>{label}</dt>
                            <dd className={`max-w-[65%] text-right font-semibold ${!paymentChecksQuery.isError && check?.valid ? 'text-emerald-600' : check?.state === 'pending' && !paymentChecksQuery.isError ? 'text-amber-700' : 'text-red-600'}`}>
                              {paymentChecksQuery.isPending ? 'Vérification...'
                                : paymentChecksQuery.isError || !check ? 'Vérification indisponible'
                                  : check.state === 'pending' ? check.message : `${check.valid ? '✓' : '✗'} ${check.message}`}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {paymentChecksQuery.isError ? (
                        <Button variant="secondary" onClick={() => void paymentChecksQuery.refetch()}>Réessayer</Button>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="space-y-4">
                    {isAuthenticated ? <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Données de paiement</p> : null}
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
                        ) : paymentChecksQuery.isPending ? (
                          <div className="text-sm text-slate-600">Vérifications avant paiement en cours...</div>
                        ) : paymentChecksQuery.isError || !paymentChecksQuery.data ? (
                          <div className="text-sm text-red-600">Vérification indisponible. Réessayez avant de payer.</div>
                        ) : paymentErrors.length > 0 || !canProceedToPayment ? (
                          <>
                            {paymentErrors.length > 0 ? <Alert
                              variant="danger"
                              title="Paiement impossible pour le moment"
                              message={
                                <ul className="list-disc space-y-1 pl-5">
                                  {paymentErrors.map((error) => (<li key={error}>{error}</li>))}
                                </ul>
                              }
                            /> : null}
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                              <Button variant="secondary" onClick={() => setCurrentStep(2)}>Retour</Button>
                              {licenseVehicleCompatibility === 'incompatible' ? (
                                <Button variant="secondary" onClick={() => navigate('/vehicles')}>Choisir un autre véhicule</Button>
                              ) : null}
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
                              <div className="space-y-3">
                              <Alert
                                variant="danger"
                                title={createReservationMutation.isError && !activeReservation ? 'Réservation impossible' : 'Paiement impossible'}
                                message={paymentWorkflowError}
                              />
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  createReservationMutation.reset()
                                  setPaymentWorkflowError(null)
                                }}
                                >
                                  Réessayer
                                </Button>
                              </div>
                            ) : shouldShowSimulationError ? (
                              <Button variant="secondary" onClick={() => setCurrentStep(2)}>Retour</Button>
                            ) : !activeReservation || !paymentClientSecret ? (
                              <Alert
                                variant="info"
                                title="Préparation en cours"
                                message="Le backend prépare votre paiement Stripe Test."
                              />
                            ) : (
                              <>
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
                                    clientSecret={paymentClientSecret}
                                    initialCardholderName={[profileQuery.data?.first_name, profileQuery.data?.last_name].filter(Boolean).join(' ')}
                                    isSubmitting={isConfirmingPayment}
                                    onBack={() => setCurrentStep(2)}
                                    returnUrl={stripeReturnUrl}
                                    onSubmit={handlePaymentSuccess}
                                    verifyBeforePayment={async () => {
                                      const result = await paymentChecksQuery.refetch()
                                      return !result.isError && !!result.data && Object.values(result.data).every((check) => check.valid)
                                    }}
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
                                insurance: effectiveInsuranceSelection,
                              },
                            }}
                            className="inline-flex"
                          >
                            <Button variant="secondary" className="h-12 min-w-56">Se connecter</Button>
                          </Link>
                          <Link
                            to="/register"
                            state={{
                              from: `${window.location.pathname}${window.location.search}`,
                              reservationDraft: {
                                vehicleId: vehicle.id,
                                start,
                                end,
                                insurance: effectiveInsuranceSelection,
                              },
                            }}
                            className="inline-flex"
                          >
                            <Button
                              variant="secondary"
                              className="h-12 min-w-56"
                            >
                              Créer un compte
                            </Button>
                          </Link>
                        </div>

                      </div>
                    )}
                  </section>
                </div>
              </Card>
            </div>

            <div className="w-full shrink-0">
              <Card
                className="mx-auto mt-2 max-w-[600px]"
                header={confirmationReservation?.status === 'CONFIRMEE' ? undefined : <h2 className="text-lg font-semibold text-[#1F2937]">Étape 4 · Confirmation</h2>}
              >
                {confirmationReservation?.status === 'CONFIRMEE' ? (
                  <div className="flex flex-col items-center py-4 text-center sm:py-6">
                    <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_24px_rgba(16,185,129,0.3)]">
                      <Check className="h-11 w-11" strokeWidth={3.5} />
                    </span>
                    <h2 className="mt-6 text-2xl font-bold tracking-tight text-[#1F2937] sm:text-3xl">Réservation confirmée !</h2>
                    <p className="mt-3 text-base text-slate-700">
                      Votre paiement de {formatCurrencyFr(confirmationReservation.rental_amount) ?? 'montant non renseigné'} a été accepté.
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-700">Référence : {confirmationReservation.reference}</p>
                    <p className="mt-6 max-w-md text-sm leading-6 text-slate-600">
                      La caution restera en attente jusqu'au contrôle du véhicule après sa restitution.
                    </p>

                    <div className="mt-7 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
                      <Button className="bg-[#7C3AED] hover:bg-[#6D28D9] focus-visible:ring-[#7C3AED]" onClick={() => navigate(`/client/reservations?highlight=${confirmationReservation.id}`)}>
                        Voir ma réservation
                      </Button>
                      <Button variant="secondary" onClick={() => navigate('/')}>
                        Retour à l'accueil
                      </Button>
                    </div>
                  </div>
                ) : currentStep >= 4 && hasPaymentFailed ? (
                  <div className="space-y-5">
                    <Alert
                      variant="danger"
                      title="Paiement échoué"
                      message="Paiement échoué. Veuillez recommencer votre réservation."
                    />
                    <div className="flex justify-center">
                      <Button onClick={() => window.location.assign(`/vehicles/${id}`)}>Recommencer ma réservation</Button>
                    </div>
                  </div>
                ) : currentStep >= 4 && hasConfirmationTimedOut ? (
                  <div className="space-y-5">
                    <Alert
                      variant="warning"
                      title="La confirmation prend plus de temps que prévu."
                      message="Votre paiement a bien été transmis. Vérifiez à nouveau le statut de la réservation sans relancer le paiement."
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                      <Button
                        className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                        disabled={isRefreshingReservationStatus}
                        onClick={() => {
                          void handleRefreshReservationStatus()
                        }}
                      >
                        {isRefreshingReservationStatus ? 'Actualisation...' : 'Actualiser le statut'}
                      </Button>
                      <Button variant="secondary" onClick={() => navigate('/client/reservations')}>
                        Retour à mes réservations
                      </Button>
                    </div>
                  </div>
                ) : currentStep >= 4 && isConfirmingPayment ? (
                  <div className="flex min-h-[32vh] flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[36vh] sm:px-6 sm:py-12">
                    <LoadingSpinner size="lg" aria-label="Confirmation du paiement en cours" />
                    <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[#1F2937] sm:text-3xl">Veuillez patienter</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                      {confirmedPaymentIntentStatus === 'processing'
                        ? 'Votre paiement est en cours de traitement par Stripe. La confirmation de votre réservation arrivera dès validation du backend.'
                        : 'Nous procédons à la confirmation de votre paiement.'}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-slate-500 sm:text-base">Ne fermez pas cette page.</p>
                  </div>
                ) : (
                  <div className="flex min-h-[32vh] flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[36vh] sm:px-6 sm:py-12">
                    <h3 className="text-2xl font-semibold tracking-tight text-[#1F2937] sm:text-3xl">Confirmation</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                      La confirmation finale de votre réservation s&apos;affichera ici après validation du paiement.
                    </p>
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