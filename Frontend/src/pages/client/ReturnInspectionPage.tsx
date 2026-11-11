import { useEffect, useMemo, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LockKeyhole, MapPin, Smartphone } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import InspectionVehicleStateCard from '../../components/inspections/InspectionVehicleStateCard'
import { MAX_VEHICLE_MILEAGE, validateInspectionVehicleState } from '../../components/inspections/inspectionVehicleState'
import ReservationProgressBanner from '../../components/reservations/ReservationProgressBanner'
import InspectionPhotoSlot from '../../components/inspections/InspectionPhotoSlot'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  completeDemoReturnKeyCheck,
  completeInspection,
  createReturnInspection,
  saveDepartureVehicleState,
  uploadInspectionPhoto,
} from '../../services/inspectionService'
import { getInvoiceDownload, getInvoices } from '../../services/invoiceService'
import { getReservationById } from '../../services/reservationService'
import { getVehicleById } from '../../services/vehicleService'
import type {
  CompleteInspectionRequest,
  DepartureVehicleStateRequest,
  Inspection,
  InspectionPhoto,
  PhotoType,
  Severity,
} from '../../types/inspection'
import type { ReservationInspectionDetail } from '../../types/reservation'
import { resolveMediaUrl } from '../../utils/media'
import { finalizeReturnAndRead, isReturnCompleted } from '../../utils/returnFinalization'

type ApiErrorPayload = {
  detail?: string
  non_field_errors?: string[]
  code?: string
  message?: string
  [key: string]: unknown
}

type PhotoSlotState = {
  selectedFile: File | null
  previewUrl: string | null
  uploadedPhoto: InspectionPhoto | null
  errorMessage: string | null
}

type InspectionStepPhotoSlot = {
  key: string
  label: string
  photoType: PhotoType
  position?: number
}

const EXTERIOR_PHOTO_SLOTS: InspectionStepPhotoSlot[] = [
  { key: 'exterior_front_left', label: 'Avant gauche', photoType: 'AVANT' },
  { key: 'exterior_front_right', label: 'Avant droit', photoType: 'COTE_DROIT' },
  { key: 'exterior_rear_left', label: 'Arriere gauche', photoType: 'COTE_GAUCHE' },
  { key: 'exterior_rear_right', label: 'Arriere droit', photoType: 'ARRIERE' },
]

const INTERIOR_PHOTO_SLOTS: InspectionStepPhotoSlot[] = [
  { key: 'interior_dashboard', label: 'Tableau de bord', photoType: 'TABLEAU_DE_BORD' },
  { key: 'interior_front_seats', label: 'Sieges avant', photoType: 'INTERIEUR', position: 1 },
  { key: 'interior_rear_seats', label: 'Sieges arriere', photoType: 'INTERIEUR', position: 2 },
  { key: 'interior_trunk', label: 'Coffre', photoType: 'AUTRE', position: 1 },
]

const REQUIRED_RETURN_PHOTO_TYPES: PhotoType[] = [
  'AVANT',
  'ARRIERE',
  'COTE_GAUCHE',
  'COTE_DROIT',
  'INTERIEUR',
  'TABLEAU_DE_BORD',
]

const ANOMALY_PHOTO_SLOTS = [
  { key: 'slot1', label: "Photo de l'anomalie 1", position: 1 },
  { key: 'slot2', label: "Photo de l'anomalie 2", position: 2 },
] as const

type AnomalyPhotoSlotKey = (typeof ANOMALY_PHOTO_SLOTS)[number]['key']

type AnomalyPhotoSlotState = {
  photoId: number | null
  previewUrl: string | null
  isUploading: boolean
  errorMessage: string | null
}

function buildInitialAnomalyPhotoState(): Record<AnomalyPhotoSlotKey, AnomalyPhotoSlotState> {
  return {
    slot1: {
      photoId: null,
      previewUrl: null,
      isUploading: false,
      errorMessage: null,
    },
    slot2: {
      photoId: null,
      previewUrl: null,
      isUploading: false,
      errorMessage: null,
    },
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

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  return fallback
}

function toErrorCode(error: unknown): string | null {
  const axiosError = error as AxiosError<ApiErrorPayload>
  const rawCode = axiosError.response?.data?.code
  return typeof rawCode === 'string' && rawCode.trim().length > 0 ? rawCode.trim() : null
}

const VEHICLE_STATE_ERROR_MESSAGES: Record<string, string> = {
  MILEAGE_REQUIRED: 'Le kilometrage final est obligatoire.',
  DEPARTURE_MILEAGE_UNAVAILABLE: "Le kilometrage de depart est indisponible, impossible d'enregistrer le retour.",
  INVALID_MILEAGE: 'Le kilometrage final ne peut pas etre inferieur au kilometrage de depart.',
  ENERGY_LEVEL_REQUIRED: 'Le niveau de carburant/batterie final est obligatoire.',
  INVALID_ENERGY_LEVEL: 'Le niveau de carburant/batterie doit etre compris entre 0 et 100.',
  INSPECTION_ALREADY_COMPLETED: 'Cette etape a deja ete enregistree.',
  INVALID_RESERVATION_STATUS: "La reservation n'est plus en cours.",
  INITIAL_INSPECTION_NOT_COMPLETED: "L'etat des lieux de depart doit etre termine avant celui de retour.",
}

function toVehicleStateErrorMessage(error: unknown): string {
  const code = toErrorCode(error)
  if (code && VEHICLE_STATE_ERROR_MESSAGES[code]) {
    return VEHICLE_STATE_ERROR_MESSAGES[code]
  }
  return toErrorMessage(error)
}

async function toInvoiceErrorMessage(error: unknown): Promise<string> {
  const fallback = 'Une erreur est survenue. Veuillez reessayer.'
  const axiosError = error as AxiosError<ApiErrorPayload | Blob>
  const payload = axiosError.response?.data

  // With responseType: 'blob', axios stores JSON error bodies as an opaque Blob instead of parsing them.
  if (payload instanceof Blob) {
    try {
      const text = await payload.text()
      const parsed = JSON.parse(text) as ApiErrorPayload
      if (typeof parsed.detail === 'string' && parsed.detail.trim().length > 0) {
        return parsed.detail
      }
      if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
        return parsed.message
      }
    } catch {
      // Not a JSON body (e.g. empty or HTML error page): fall through to the generic message below.
    }
    return fallback
  }

  return toErrorMessage(error)
}

function inspectionStatusToBadge(status?: string): { variant: StatusVariant; label: string } {
  switch (status) {
    case 'BROUILLON':
      return { variant: 'neutral', label: 'Brouillon' }
    case 'EN_COURS':
      return { variant: 'info', label: 'En cours' }
    case 'TERMINE':
      return { variant: 'success', label: 'Termine' }
    case 'ANNULE':
      return { variant: 'danger', label: 'Annule' }
    default:
      return { variant: 'neutral', label: 'Inconnu' }
  }
}

function buildInitialPhotoState(): Record<string, PhotoSlotState> {
  const allSlots = [...EXTERIOR_PHOTO_SLOTS, ...INTERIOR_PHOTO_SLOTS]
  return allSlots.reduce<Record<string, PhotoSlotState>>((accumulator, slot) => {
    accumulator[slot.key] = {
      selectedFile: null,
      previewUrl: null,
      uploadedPhoto: null,
      errorMessage: null,
    }
    return accumulator
  }, {})
}

function getPhotoSlotKeyFromServerPhoto(photo: InspectionPhoto): string | null {
  switch (photo.photo_type) {
    case 'AVANT':
      return 'exterior_front_left'
    case 'COTE_DROIT':
      return 'exterior_front_right'
    case 'COTE_GAUCHE':
      return 'exterior_rear_left'
    case 'ARRIERE':
      return 'exterior_rear_right'
    case 'TABLEAU_DE_BORD':
      return 'interior_dashboard'
    case 'INTERIEUR':
      if (photo.position === 1) {
        return 'interior_front_seats'
      }
      if (photo.position === 2) {
        return 'interior_rear_seats'
      }
      return null
    case 'AUTRE':
      if (photo.position === 1) {
        return 'interior_trunk'
      }
      return null
    default:
      return null
  }
}

function buildPhotoStateFromInspection(inspection: ReservationInspectionDetail | null): Record<string, PhotoSlotState> {
  const state = buildInitialPhotoState()

  if (!inspection) {
    return state
  }

  inspection.photos.forEach((photo) => {
    const slotKey = getPhotoSlotKeyFromServerPhoto(photo)
    if (!slotKey) {
      return
    }

    state[slotKey] = {
      selectedFile: null,
      previewUrl: resolveMediaUrl(photo.file),
      uploadedPhoto: photo,
      errorMessage: null,
    }
  })

  return state
}

function revokePreviewUrl(previewUrl: string | null) {
  if (previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
}

function parsePositiveInteger(value: string): number | null {
  if (value.trim().length === 0) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  })
}

function buildInvoicePdfFilename(reservationReference: string | undefined, reservationId: number): string {
  if (reservationReference && reservationReference.trim().length > 0) {
    return `GetaCar_Facture_${reservationReference.trim()}.pdf`
  }
  return `GetaCar_Facture_Reservation_${reservationId}.pdf`
}

function ReturnInspectionLayout({
  children,
  stepIndex,
  inspection,
  progress,
  showInspectionSummary = true,
  allStepsDone = false,
}: {
  children: React.ReactNode
  stepIndex: number
  inspection: Inspection | null
  progress: number
  showInspectionSummary?: boolean
  allStepsDone?: boolean
}) {
  const stepLabels = ['Parking', 'Extérieur', 'Intérieur', 'État du véhicule', 'Verrouillage', 'Terminé']
  const steps = stepLabels.map((label, index) => ({
    order: index + 1,
    label,
    status: allStepsDone || index + 1 < stepIndex
      ? 'done' as const
      : index + 1 === stepIndex
        ? 'active' as const
        : 'future' as const,
  }))

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
        <ReservationProgressBanner
          ariaLabel="Progression de restitution"
          className="mb-6 sm:mb-8"
          steps={steps}
        />
      </div>

      {inspection && showInspectionSummary ? (
        <Card className="mb-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#1F2937]">Progression</p>
              <p className="text-sm font-semibold text-[#0F172A]">{progress}%</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div className="h-full rounded-full bg-[#2563EB] transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inspection</p>
                <p className="text-base font-semibold text-[#0F172A]">#{inspection.id}</p>
              </div>
              <StatusBadge variant={inspectionStatusToBadge(inspection.status).variant} label={inspectionStatusToBadge(inspection.status).label} />
            </div>
          </div>
        </Card>
      ) : null}

      <div className="space-y-6">{children}</div>
    </section>
  )
}

export default function ReturnInspectionPage() {
  return <ReturnInspectionParkingPage />
}

export function ReturnInspectionExteriorPage() {
  return <ReturnInspectionStepOne />
}

function ReturnInspectionParkingPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [parkingConfirmationError, setParkingConfirmationError] = useState(false)
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0
  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Réservation invalide" message="L'identifiant de réservation est invalide." />
      </section>
    )
  }

  const reservation = reservationQuery.data
  const parkingName = reservation?.vehicle.parking_name || 'Parking de dépôt'
  const parkingAddress = reservation?.vehicle.parking_address

  return (
    <ReturnInspectionLayout stepIndex={1} inspection={reservation?.return_inspection ?? null} progress={0} showInspectionSummary={false}>
      {reservationQuery.isLoading ? (
        <Card>
          <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
            <LoadingSpinner size="sm" aria-label="Chargement du parking" />
            <p>Chargement des informations du parking...</p>
          </div>
        </Card>
      ) : null}
      {reservationQuery.isError ? (
        <Alert variant="danger" title="Chargement impossible" message="Les informations de restitution n'ont pas pu être chargées. Veuillez réessayer." />
      ) : null}
      {reservation ? (
        <div className="space-y-6">
          <Card>
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Parking</h1>
              <div className="space-y-3">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6D28D9]">
                  <MapPin aria-hidden="true" size={24} />
                </span>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[#1F2937]">Parking de dépôt</h2>
                  <p className="text-base font-medium text-slate-800">{parkingName}</p>
                  <p className="text-sm leading-6 text-slate-600">
                    {parkingAddress || 'Adresse du parking non renseignée.'}
                  </p>
                </div>
              </div>
              <p className="text-lg font-semibold leading-7 text-[#1F2937] sm:text-xl">
                Le véhicule est-il stationné au parking de départ indiqué ci-dessous ?
              </p>
              {parkingConfirmationError ? (
                <Alert
                  variant="danger"
                  message="Veuillez restituer le véhicule au parking de départ avant de continuer."
                />
              ) : null}
            </div>
          </Card>

          <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate('/client/reservations')}>
              Retour à mes réservations
            </Button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setParkingConfirmationError(true)}
              >
                Non
              </Button>
              <Button
                className="w-full bg-[#6D28D9] text-white hover:bg-[#5B21B6] focus-visible:ring-[#6D28D9] sm:w-auto"
                onClick={() => navigate(`/client/reservations/${reservationId}/return-inspection/exterior`)}
              >
                Oui, continuer vers l'extérieur
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ReturnInspectionLayout>
  )
}

function ReturnInspectionStepOne() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const [createdInspection, setCreatedInspection] = useState<{ reservationId: number, inspection: Inspection } | null>(null)
  const inspection = reservationQuery.data?.return_inspection
    ?? (createdInspection?.reservationId === reservationId ? createdInspection.inspection : null)

  const [photoState, setPhotoState] = useState<Record<string, PhotoSlotState>>(buildInitialPhotoState)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const uploadingSlotKeysRef = useRef<Set<string>>(new Set())
  const initializationAttemptRef = useRef<{ reservationId: number | null, attempted: boolean }>({ reservationId: null, attempted: false })

  const startMutation = useMutation({
    mutationFn: () => createReturnInspection(reservationId),
    onSuccess: (response) => {
      setCreatedInspection({ reservationId, inspection: response.inspection })
      setPhotoState(buildInitialPhotoState())
      setGlobalError(null)
      void reservationQuery.refetch()
    },
    onError: (error) => {
      const axiosError = error as AxiosError<ApiErrorPayload>
      if (axiosError.response?.data?.code === 'RETURN_INSPECTION_ALREADY_EXISTS') {
        // Duplicate initialization attempt (e.g. dev-mode double effect run): the inspection
        // already exists, so reload it silently instead of surfacing a false error.
        setGlobalError(null)
        void reservationQuery.refetch()
        return
      }
      setGlobalError(toErrorMessage(error))
    },
  })

  useEffect(() => {
    if (!isReservationIdValid || reservationQuery.isLoading || reservationQuery.isFetching || reservationQuery.isError) {
      return
    }
    if (inspection || startMutation.isPending) {
      return
    }

    if (initializationAttemptRef.current.reservationId !== reservationId) {
      initializationAttemptRef.current = { reservationId, attempted: false }
    }
    if (initializationAttemptRef.current.attempted) {
      return
    }

    initializationAttemptRef.current.attempted = true
    void startMutation.mutate()
  }, [inspection, isReservationIdValid, reservationId, reservationQuery.isError, reservationQuery.isFetching, reservationQuery.isLoading, startMutation, startMutation.isPending])

  useEffect(() => {
    if (!reservationQuery.data?.return_inspection) {
      return
    }
    setPhotoState(buildPhotoStateFromInspection(reservationQuery.data.return_inspection))
    setGlobalError(null)
  }, [reservationQuery.data?.return_inspection])

  useEffect(() => {
    return () => {
      Object.values(photoState).forEach((slot) => {
        revokePreviewUrl(slot.previewUrl)
      })
    }
  }, [photoState])

  const completedExteriorPhotos = useMemo(
    () => EXTERIOR_PHOTO_SLOTS.filter((slot) => photoState[slot.key]?.uploadedPhoto !== null).length,
    [photoState],
  )

  const canContinue = Boolean(inspection) && completedExteriorPhotos === EXTERIOR_PHOTO_SLOTS.length

  const uploadSlotPhoto = async (slotConfig: InspectionStepPhotoSlot, file: File) => {
    if (!inspection) {
      return
    }
    if (uploadingSlotKeysRef.current.has(slotConfig.key)) {
      return
    }
    uploadingSlotKeysRef.current.add(slotConfig.key)

    setPhotoState((currentState) => {
      const existingPreviewUrl = currentState[slotConfig.key].previewUrl
      revokePreviewUrl(existingPreviewUrl)
      return {
        ...currentState,
        [slotConfig.key]: {
          ...currentState[slotConfig.key],
          selectedFile: file,
          previewUrl: URL.createObjectURL(file),
          errorMessage: null,
        },
      }
    })

    setGlobalError(null)

    try {
      const uploadedPhoto = await uploadInspectionPhoto(inspection.id, {
        file,
        photo_type: slotConfig.photoType,
        position: slotConfig.position,
      })

      setPhotoState((currentState) => ({
        ...currentState,
        [slotConfig.key]: {
          ...currentState[slotConfig.key],
          selectedFile: null,
          previewUrl: resolveMediaUrl(uploadedPhoto.file),
          uploadedPhoto,
          errorMessage: null,
        },
      }))

      await reservationQuery.refetch()
    } catch (error) {
      setPhotoState((currentState) => ({
        ...currentState,
        [slotConfig.key]: {
          ...currentState[slotConfig.key],
          errorMessage: toErrorMessage(error),
        },
      }))
    } finally {
      uploadingSlotKeysRef.current.delete(slotConfig.key)
    }
  }

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  const progress = Math.round((completedExteriorPhotos / EXTERIOR_PHOTO_SLOTS.length) * 100)
  const reservationLoadErrorMessage = !inspection && reservationQuery.isError
    ? `Impossible de charger la reservation pour initialiser l'etat des lieux de retour. ${toErrorMessage(reservationQuery.error)}`
    : null
  const isInitializingInspection = !inspection && !reservationLoadErrorMessage && (reservationQuery.isLoading || reservationQuery.isFetching || startMutation.isPending)
  const hasInitializationFailed = !inspection
    && initializationAttemptRef.current.attempted
    && !reservationQuery.isLoading
    && !reservationQuery.isFetching
    && !startMutation.isPending
    && startMutation.isError
  const initializationErrorMessage = hasInitializationFailed && globalError
    ? `Impossible d'initialiser automatiquement l'etat des lieux de retour. ${globalError}`
    : null

  return (
    <ReturnInspectionLayout
      stepIndex={2}
      inspection={inspection}
      progress={progress}
      showInspectionSummary={false}
    >
      {reservationLoadErrorMessage ? <Alert className="mb-4" variant="danger" title="Chargement impossible" message={reservationLoadErrorMessage} /> : null}
      {initializationErrorMessage ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Alert className="flex-1" variant="danger" title="Initialisation impossible" message={initializationErrorMessage} />
          <Button
            variant="secondary"
            onClick={() => {
              initializationAttemptRef.current = { reservationId, attempted: true }
              setGlobalError(null)
              startMutation.reset()
              startMutation.mutate()
            }}
            disabled={startMutation.isPending}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      {isInitializingInspection ? (
        <Card>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <LoadingSpinner size="sm" aria-label="Initialisation" />
            <p>Initialisation de l’état des lieux...</p>
          </div>
        </Card>
      ) : null}

      {inspection ? (
        <Card
          header={(
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Extérieur</h2>
              <Link to={`/client/reservations?highlight=${reservationId}`}>
                <Button variant="secondary">Retour a la reservation</Button>
              </Link>
            </div>
          )}
        >
          <p className="mb-4 text-base text-slate-600 sm:text-lg">{completedExteriorPhotos}/{EXTERIOR_PHOTO_SLOTS.length} photo(s) extérieure(s) obligatoire(s) envoyée(s).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {EXTERIOR_PHOTO_SLOTS.map((slotConfig) => {
              const slot = photoState[slotConfig.key]
              return (
                <InspectionPhotoSlot
                  key={slotConfig.key}
                  photoType={slotConfig.photoType}
                  label={slotConfig.label}
                  previewUrl={slot.previewUrl}
                  uploadedUrl={slot.uploadedPhoto?.file ?? null}
                  isUploading={uploadingSlotKeysRef.current.has(slotConfig.key)}
                  errorMessage={slot.errorMessage}
                  onFileChange={(file) => {
                    if (!file) {
                      return
                    }
                    void uploadSlotPhoto(slotConfig, file)
                  }}
                />
              )
            })}
          </div>
          <div className="mt-4 flex justify-center">
            <Button className="w-full sm:w-auto" disabled={!canContinue} onClick={() => navigate(`/client/reservations/${reservationId}/return-inspection/interior`)}>
              Continuer
            </Button>
          </div>
        </Card>
      ) : null}
    </ReturnInspectionLayout>
  )
}

export function ReturnInspectionInteriorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0
  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const inspection = reservationQuery.data?.return_inspection ?? null
  const [photoState, setPhotoState] = useState<Record<string, PhotoSlotState>>(buildInitialPhotoState)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const uploadingSlotKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!reservationQuery.data?.return_inspection) {
      return
    }
    setPhotoState(buildPhotoStateFromInspection(reservationQuery.data.return_inspection))
  }, [reservationQuery.data?.return_inspection])

  useEffect(() => {
    return () => {
      Object.values(photoState).forEach((slot) => {
        revokePreviewUrl(slot.previewUrl)
      })
    }
  }, [photoState])

  const completedInteriorPhotos = useMemo(
    () => INTERIOR_PHOTO_SLOTS.filter((slot) => photoState[slot.key]?.uploadedPhoto !== null).length,
    [photoState],
  )

  const uploadSlotPhoto = async (slotConfig: InspectionStepPhotoSlot, file: File) => {
    if (!inspection) {
      return
    }
    if (uploadingSlotKeysRef.current.has(slotConfig.key)) {
      return
    }
    uploadingSlotKeysRef.current.add(slotConfig.key)

    setPhotoState((currentState) => {
      const existingPreviewUrl = currentState[slotConfig.key].previewUrl
      revokePreviewUrl(existingPreviewUrl)
      return {
        ...currentState,
        [slotConfig.key]: {
          ...currentState[slotConfig.key],
          selectedFile: file,
          previewUrl: URL.createObjectURL(file),
          errorMessage: null,
        },
      }
    })

    setGlobalError(null)

    try {
      const uploadedPhoto = await uploadInspectionPhoto(inspection.id, {
        file,
        photo_type: slotConfig.photoType,
        position: slotConfig.position,
      })

      setPhotoState((currentState) => ({
        ...currentState,
        [slotConfig.key]: {
          ...currentState[slotConfig.key],
          selectedFile: null,
          previewUrl: resolveMediaUrl(uploadedPhoto.file),
          uploadedPhoto,
          errorMessage: null,
        },
      }))
      await reservationQuery.refetch()
    } catch (error) {
      setPhotoState((currentState) => ({
        ...currentState,
        [slotConfig.key]: {
          ...currentState[slotConfig.key],
          errorMessage: toErrorMessage(error),
        },
      }))
    } finally {
      uploadingSlotKeysRef.current.delete(slotConfig.key)
    }
  }

  const canContinue = Boolean(inspection) && completedInteriorPhotos === INTERIOR_PHOTO_SLOTS.length

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  return (
    <ReturnInspectionLayout
      stepIndex={3}
      inspection={inspection}
      progress={Math.round((completedInteriorPhotos / INTERIOR_PHOTO_SLOTS.length) * 100)}
      showInspectionSummary={false}
    >
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}
      <Card
        header={(
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Intérieur</h2>
            <Link to={`/client/reservations?highlight=${reservationId}`}>
              <Button variant="secondary">Retour a la reservation</Button>
            </Link>
          </div>
        )}
      >
        <p className="mb-4 text-base text-slate-600 sm:text-lg">{completedInteriorPhotos}/{INTERIOR_PHOTO_SLOTS.length} photo(s) intérieure(s) obligatoire(s) envoyée(s).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {INTERIOR_PHOTO_SLOTS.map((slotConfig) => {
            const slot = photoState[slotConfig.key]
            return (
              <InspectionPhotoSlot
                key={slotConfig.key}
                photoType={slotConfig.photoType}
                label={slotConfig.label}
                previewUrl={slot.previewUrl}
                uploadedUrl={slot.uploadedPhoto?.file ?? null}
                isUploading={uploadingSlotKeysRef.current.has(slotConfig.key)}
                errorMessage={slot.errorMessage}
                onFileChange={(file) => {
                  if (!file) {
                    return
                  }
                  void uploadSlotPhoto(slotConfig, file)
                }}
              />
            )
          })}
        </div>
        <div className="mt-4 flex justify-center">
          <Button className="w-full sm:w-auto" disabled={!canContinue} onClick={() => navigate(`/client/reservations/${reservationId}/return-inspection/vehicle-state`)}>
            Continuer
          </Button>
        </div>
      </Card>
    </ReturnInspectionLayout>
  )
}

export function ReturnInspectionVehicleStatePage() {
  const { id } = useParams<{ id: string }>()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0
  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  if (!isReservationIdValid) {
    return <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
  }
  if (reservationQuery.isLoading) {
    return <LoadingSpinner aria-label="Chargement de la restitution" />
  }
  if (reservationQuery.isError || !reservationQuery.data) {
    return <Alert variant="danger" title="Chargement impossible" message="Impossible de charger la restitution." />
  }
  return <ReturnVehicleStateForm key={reservationId} reservationId={reservationId} />
}

function ReturnVehicleStateForm({ reservationId }: { reservationId: number }) {
  const navigate = useNavigate()
  const isReservationIdValid = true
  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
  })
  const inspection = reservationQuery.data?.return_inspection ?? null
  const departureMileage = reservationQuery.data?.departure_inspection?.mileage ?? null
  const savedDamage = inspection?.damages?.find((damage) => damage.location === 'Etat du vehicule')
  const [mileageInput, setMileageInput] = useState(() => inspection?.mileage?.toString() ?? '')
  const [energyInput, setEnergyInput] = useState(() => inspection?.energy_level_percent?.toString() ?? '')
  const [hasDamage, setHasDamage] = useState<boolean | null>(() =>
    inspection?.mileage != null && inspection?.energy_level_percent != null ? Boolean(savedDamage) : null,
  )
  const [damageDescription, setDamageDescription] = useState(() => savedDamage?.description ?? '')
  const [damageSeverity, setDamageSeverity] = useState<Severity | ''>(() => savedDamage?.severity ?? '')
  const [anomalyPhotoState, setAnomalyPhotoState] = useState<Record<AnomalyPhotoSlotKey, AnomalyPhotoSlotState>>(
    buildInitialAnomalyPhotoState,
  )
  const [globalError, setGlobalError] = useState<string | null>(null)
  const savingStateRef = useRef(false)
  const anomalyPhotoInputRefs = useRef<Record<AnomalyPhotoSlotKey, HTMLInputElement | null>>({
    slot1: null,
    slot2: null,
  })

  const mileageValue = parsePositiveInteger(mileageInput)
  const energyValue = parsePositiveInteger(energyInput)

  const mileageFieldError = useMemo(() => {
    if (mileageInput.trim().length === 0) {
      return null
    }
    if (mileageValue === null) {
      return 'Le kilometrage final doit etre un nombre valide.'
    }
    if (mileageValue > MAX_VEHICLE_MILEAGE) {
      return 'Le kilometrage saisi est trop eleve.'
    }
    if (departureMileage !== null && mileageValue < departureMileage) {
      return 'Le kilométrage final ne peut pas être inférieur au kilométrage de départ.'
    }
    return null
  }, [departureMileage, mileageInput, mileageValue])

  const energyFieldError = useMemo(() => {
    if (energyInput.trim().length === 0) {
      return null
    }
    if (energyValue === null || energyValue < 0 || energyValue > 100) {
      return 'Le niveau de carburant/batterie doit etre compris entre 0 et 100.'
    }
    return null
  }, [energyInput, energyValue])

  const isMileageValid = mileageValue !== null && mileageFieldError === null
  const isEnergyValid = energyValue !== null && energyFieldError === null

  const missingFields = useMemo(() => {
    const missing: string[] = []
    if (!isMileageValid) missing.push('Kilometrage')
    if (!isEnergyValid) missing.push('Niveau carburant/batterie')
    if (hasDamage === null) missing.push('Anomalie constatee')
    if (hasDamage && damageDescription.trim().length === 0) missing.push('Description anomalie')
    if (hasDamage && damageSeverity === '') missing.push('Gravite anomalie')
    return missing
  }, [damageDescription, damageSeverity, hasDamage, isEnergyValid, isMileageValid])

  const commonValidation = validateInspectionVehicleState({
    mileage: mileageInput,
    maxMileage: MAX_VEHICLE_MILEAGE,
    energy: energyInput,
    anomalyPresent: hasDamage,
    anomalyDescription: damageDescription,
    anomalySeverity: damageSeverity === 'ACCEPTABLE' || damageSeverity === 'GRAVE' ? damageSeverity : '',
  })
  const canContinue = Boolean(inspection) && commonValidation.error === null && mileageFieldError === null

  const uploadedAnomalyPhotoIds = useMemo(
    () => Object.values(anomalyPhotoState).map((slot) => slot.photoId).filter((photoId): photoId is number => photoId !== null),
    [anomalyPhotoState],
  )

  const uploadAnomalyPhoto = async (slotKey: AnomalyPhotoSlotKey, file: File) => {
    if (!inspection) {
      return
    }

    const slotConfig = ANOMALY_PHOTO_SLOTS.find((slot) => slot.key === slotKey)
    if (!slotConfig) {
      return
    }

    setAnomalyPhotoState((current) => ({
      ...current,
      [slotKey]: {
        ...current[slotKey],
        isUploading: true,
        errorMessage: null,
      },
    }))

    try {
      const uploaded = await uploadInspectionPhoto(inspection.id, {
        file,
        photo_type: 'DOMMAGE',
        position: slotConfig.position,
      })

      setAnomalyPhotoState((current) => ({
        ...current,
        [slotKey]: {
          photoId: uploaded.id,
          previewUrl: resolveMediaUrl(uploaded.file),
          isUploading: false,
          errorMessage: null,
        },
      }))
    } catch (error) {
      setAnomalyPhotoState((current) => ({
        ...current,
        [slotKey]: {
          ...current[slotKey],
          isUploading: false,
          errorMessage: toErrorMessage(error),
        },
      }))
    }
  }

  const removeAnomalyPhoto = (slotKey: AnomalyPhotoSlotKey) => {
    setAnomalyPhotoState((current) => {
      revokePreviewUrl(current[slotKey].previewUrl)
      return {
        ...current,
        [slotKey]: {
          photoId: null,
          previewUrl: null,
          isUploading: false,
          errorMessage: null,
        },
      }
    })
  }

  const saveStateMutation = useMutation({
    mutationFn: (payload: DepartureVehicleStateRequest) => saveDepartureVehicleState(inspection!.id, payload),
    onSuccess: async () => {
      setGlobalError(null)
      await reservationQuery.refetch()

      navigate(`/client/reservations/${reservationId}/return-inspection/lock`)
    },
    onError: async (error, payload) => {
      const refreshed = await reservationQuery.refetch()
      const saved = refreshed.data?.return_inspection
      const damage = saved?.damages?.find((item) => item.location === 'Etat du vehicule')
      const sameDamage = payload.anomaly_present
        ? Boolean(damage && damage.description === payload.anomaly_description
          && damage.severity === payload.anomaly_severity
          && [...damage.photo_ids].sort().join(',') === [...(payload.photo_ids ?? [])].sort().join(','))
        : !damage
      if (saved && saved.mileage === payload.mileage && saved.energy_level_percent === payload.energy_level_percent && sameDamage) {
        setGlobalError(null)
        navigate(`/client/reservations/${reservationId}/return-inspection/lock`)
        return
      }
      setGlobalError(toVehicleStateErrorMessage(error))
    },
  })

  const onSaveVehicleState = () => {
    if (!inspection || !canContinue || mileageValue === null || energyValue === null || hasDamage === null || savingStateRef.current) {
      return
    }

    if (inspection.mileage === mileageValue && inspection.energy_level_percent === energyValue
      && ((!hasDamage && !savedDamage)
        || (hasDamage && savedDamage && damageDescription.trim() === savedDamage.description
          && damageSeverity === savedDamage.severity && uploadedAnomalyPhotoIds.length === 0))) {
      navigate(`/client/reservations/${reservationId}/return-inspection/lock`)
      return
    }

    const payload: DepartureVehicleStateRequest = {
      mileage: mileageValue,
      energy_level_percent: energyValue,
      anomaly_present: hasDamage,
    }

    if (hasDamage) {
      payload.anomaly_description = damageDescription.trim()
      payload.anomaly_severity = damageSeverity as Severity
      payload.photo_ids = uploadedAnomalyPhotoIds
    } else {
      payload.photo_ids = []
    }

    setGlobalError(null)
    savingStateRef.current = true
    saveStateMutation.mutate(payload, { onSettled: () => { savingStateRef.current = false } })
  }

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  if (inspection?.status === 'TERMINE') {
    return (
      <ReturnInspectionLayout stepIndex={4} inspection={inspection} progress={50} showInspectionSummary={false}>
        <Card>
          <h1 className="text-xl font-semibold">État du véhicule enregistré</h1>
          <p>Kilométrage final : {inspection.mileage ?? 'non renseigné'} km</p>
          <p>Carburant ou batterie : {inspection.energy_level_percent ?? 'non renseigné'} %</p>
          <p>{inspection.damages?.length ? 'Anomalie enregistrée' : 'Aucune anomalie enregistrée'}</p>
          <Button className="mt-4" onClick={() => navigate(`/client/reservations/${reservationId}/return-inspection/lock`)}>
            Continuer vers le verrouillage
          </Button>
        </Card>
      </ReturnInspectionLayout>
    )
  }

  const anomalyPhotoFields = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[#1F2937]">Photos de l'anomalie (2 maximum)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ANOMALY_PHOTO_SLOTS.map((slot) => {
          const slotState = anomalyPhotoState[slot.key]
          return (
            <Card key={slot.key} className="h-full">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#1F2937]">{slot.label}</p>
                <input ref={(input) => { anomalyPhotoInputRefs.current[slot.key] = input }} type="file" accept="image/*" capture="environment" disabled={slotState.isUploading} className="hidden" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file) void uploadAnomalyPhoto(slot.key, file) }} />
                {slotState.previewUrl ? <img src={slotState.previewUrl} alt={slot.label} className="h-44 w-full rounded-2xl border border-[#E5E7EB] object-cover" /> : <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-sm text-slate-500">Emplacement vide</div>}
                {slotState.errorMessage ? <Alert variant="danger" message={slotState.errorMessage} /> : null}
                <Button className="w-full" disabled={slotState.isUploading} onClick={() => anomalyPhotoInputRefs.current[slot.key]?.click()}>{slotState.isUploading ? 'Envoi en cours...' : slotState.photoId ? 'Remplacer la photo' : 'Ajouter une photo'}</Button>
                {slotState.photoId ? <Button variant="secondary" className="w-full" onClick={() => removeAnomalyPhoto(slot.key)}>Supprimer la photo</Button> : null}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )

  return (
    <ReturnInspectionLayout
      stepIndex={4}
      inspection={inspection}
      progress={50}
      showInspectionSummary={false}
    >
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}
      <div className="space-y-4">
        <InspectionVehicleStateCard
          mileageLabel="Kilométrage final"
          mileage={mileageInput}
          mileageMin={departureMileage ?? 0}
          mileageMax={MAX_VEHICLE_MILEAGE}
          mileageHint={
            reservationQuery.isSuccess
              ? typeof departureMileage === 'number'
                ? `Dernier kilométrage enregistré : ${departureMileage} km`
                : 'Kilométrage précédent indisponible'
              : undefined
          }
          mileageError={mileageFieldError}
          onMileageChange={setMileageInput}
          energy={energyInput}
          onEnergyChange={setEnergyInput}
          anomalyPresent={hasDamage}
          onAnomalyPresentChange={(value) => {
            setHasDamage(value)
            if (!value) {
              setDamageDescription('')
              setDamageSeverity('')
              setAnomalyPhotoState((current) => {
                Object.values(current).forEach((slot) => revokePreviewUrl(slot.previewUrl))
                return buildInitialAnomalyPhotoState()
              })
            }
          }}
          anomalyDescription={damageDescription}
          onAnomalyDescriptionChange={setDamageDescription}
          anomalySeverity={damageSeverity === 'ACCEPTABLE' || damageSeverity === 'GRAVE' ? damageSeverity : ''}
          onAnomalySeverityChange={(value) => setDamageSeverity(value as Severity | '')}
          anomalyPhotos={anomalyPhotoFields}
        />

          {missingFields.length > 0 ? (
            <Alert variant="warning" title="Champs requis" message={<ul className="list-disc pl-5">{missingFields.map((item) => <li key={item}>{item}</li>)}</ul>} />
          ) : null}

          <div className="flex justify-center">
            <Button className="w-full sm:w-auto" disabled={!canContinue || saveStateMutation.isPending} onClick={onSaveVehicleState}>
              {saveStateMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" aria-label="Enregistrement en cours" />
                  Enregistrement...
                </span>
              ) : (
                'Enregistrer l\'etat du vehicule'
              )}
            </Button>
          </div>
      </div>
    </ReturnInspectionLayout>
  )
}

export function ReturnInspectionLockPage() {
  return <ReturnInspectionCompletionPage isLockStep />
}

export function ReturnInspectionConfirmationPage() {
  return <ReturnInspectionCompletionPage isLockStep={false} />
}

function ReturnInspectionCompletionPage({ isLockStep }: { isLockStep: boolean }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0
  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const inspection = reservationQuery.data?.return_inspection ?? null
  const reservation = reservationQuery.data
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [demoKeyCheckResult, setDemoKeyCheckResult] = useState<{ inspectionId: number, completedAt: string } | null>(null)
  const [invoiceDownloadError, setInvoiceDownloadError] = useState<string | null>(null)
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false)
  const finalizationInFlightRef = useRef(false)
  const keyCheckInFlightRef = useRef(false)
  const vehicleLabel = reservation ? `${reservation.vehicle.brand} ${reservation.vehicle.model_name}` : 'Non disponible'
  const effectiveMileage = inspection?.mileage ?? null
  const effectiveEnergyLevelPercent = inspection?.energy_level_percent ?? null
  const isInspectionCompleted = isReturnCompleted(reservation)
  const needsReturnAccessRecovery = reservation?.status === 'A_CONTROLER'
    && inspection?.status === 'TERMINE' && !inspection.return_access_secured

  const currentVehicleQuery = useQuery({
    queryKey: ['client-return-confirmation-vehicle', reservation?.vehicle.id],
    queryFn: () => getVehicleById(reservation!.vehicle.id),
    enabled: Boolean(reservation?.vehicle.id),
  })

  const invoiceQuery = useQuery({
    queryKey: ['client-return-confirmation-invoice', reservationId],
    enabled: isReservationIdValid && isInspectionCompleted && Boolean(reservation?.invoice_pdf_available),
    queryFn: async () => {
      let page = 1
      let hasNextPage = true

      while (hasNextPage) {
        const pageData = await getInvoices({ page, ordering: '-issue_date' })
        const matchedInvoice = pageData.results.find((invoice) => invoice.reservation_id === reservationId)
        if (matchedInvoice) {
          return matchedInvoice
        }

        hasNextPage = Boolean(pageData.next)
        page += 1
      }

      return null
    },
  })

  const downloadInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceQuery.data) {
        throw new Error('Facture indisponible pour cette reservation.')
      }

      const pdfBlob = await getInvoiceDownload(invoiceQuery.data.id)
      return {
        invoiceNumber: invoiceQuery.data.number,
        pdfBlob,
      }
    },
  })

  const demoKeyCheckMutation = useMutation({
    mutationFn: async () => {
      if (!inspection) {
        throw new Error("L'état des lieux de retour est introuvable.")
      }

      return completeDemoReturnKeyCheck(inspection.id)
    },
    onSuccess: async (checkedInspection) => {
      if (checkedInspection.demo_key_check_completed_at) {
        setDemoKeyCheckResult({
          inspectionId: checkedInspection.id,
          completedAt: checkedInspection.demo_key_check_completed_at,
        })
      }
      setGlobalError(null)
      await reservationQuery.refetch()
    },
    onError: (error) => {
      setGlobalError(toErrorMessage(error))
    },
  })

  const readFreshReservation = async () => {
    await queryClient.cancelQueries({ queryKey: ['client-reservation', reservationId], exact: true })
    const fresh = await getReservationById(reservationId)
    await queryClient.cancelQueries({ queryKey: ['client-reservation', reservationId], exact: true })
    queryClient.setQueryData(['client-reservation', reservationId], fresh)
    return fresh
  }

  const verificationMutation = useMutation({
    mutationFn: readFreshReservation,
    onSuccess: (fresh) => {
      setGlobalError(null)
      setVerificationRequired(false)
      if (isReturnCompleted(fresh)) {
        navigate(`/client/reservations/${reservationId}/return-inspection/confirmation`, { replace: true })
      } else {
        setGlobalError("La restitution n'est pas encore confirmée. Vérifiez les informations avant de réessayer.")
      }
    },
    onError: () => {
      setVerificationRequired(true)
      setGlobalError("Impossible de vérifier l'état de la restitution. Vérifiez votre connexion puis réessayez la vérification.")
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => finalizeReturnAndRead(async () => {
      if (!inspection || effectiveMileage == null || effectiveEnergyLevelPercent == null) {
        throw new Error('Inspection ou donnees de restitution incompletes.')
      }

      const payload: CompleteInspectionRequest = {
        mileage: effectiveMileage,
        energy_level_percent: effectiveEnergyLevelPercent,
      }

      if (inspection.comments?.trim()) {
        payload.comments = inspection.comments.trim()
      }

      await completeInspection(inspection.id, payload)
    }, readFreshReservation),
    onSuccess: (result) => {
      if (result.kind === 'unverified') {
        setVerificationRequired(true)
        setGlobalError("Impossible de vérifier l'état de la restitution. Vérifiez votre connexion puis réessayez la vérification.")
        return
      }

      if (!isReturnCompleted(result.reservation)) {
        setVerificationRequired(true)
        setGlobalError(result.submissionError
          ? toErrorMessage(result.submissionError)
          : "La restitution n'a pas encore pu être confirmée. Vérifiez son état avant de réessayer.")
        return
      }
      setVerificationRequired(false)
      setGlobalError(null)
      navigate(`/client/reservations/${reservationId}/return-inspection/confirmation`, { replace: true })
    },
  })

  useEffect(() => {
    if (isLockStep && isInspectionCompleted) {
      navigate(`/client/reservations/${reservationId}/return-inspection/confirmation`, { replace: true })
    }
  }, [isInspectionCompleted, isLockStep, navigate, reservationId])

  const returnPhotoTypes = new Set(inspection?.photos.map((photo) => photo.photo_type) ?? [])
  const missingReturnPhotoTypes = REQUIRED_RETURN_PHOTO_TYPES
    .filter((photoType) => !returnPhotoTypes.has(photoType))
  const canLockVehicle = Boolean(
    inspection
    && ((reservation?.status === 'EN_COURS' && inspection.status !== 'TERMINE') || needsReturnAccessRecovery)
    && effectiveMileage !== null
    && effectiveEnergyLevelPercent !== null
    && missingReturnPhotoTypes.length === 0,
  )
  const isDemoKeyCheckCompleted = Boolean(
    inspection?.demo_key_check_completed_at
    || (inspection && demoKeyCheckResult?.inspectionId === inspection.id && demoKeyCheckResult.completedAt),
  )
  const canFinalizeReturn = canLockVehicle && isDemoKeyCheckCompleted

  const handleDemoKeyCheck = () => {
    if (!canLockVehicle || demoKeyCheckMutation.isPending || keyCheckInFlightRef.current) {
      return
    }

    keyCheckInFlightRef.current = true
    demoKeyCheckMutation.mutate(undefined, {
      onSettled: () => {
        keyCheckInFlightRef.current = false
      },
    })
  }

  const handleLockVehicle = () => {
    if (!canFinalizeReturn || verificationRequired || completeMutation.isPending || finalizationInFlightRef.current) {
      return
    }

    setGlobalError(null)
    finalizationInFlightRef.current = true
    completeMutation.mutate(undefined, {
      onSettled: () => {
        finalizationInFlightRef.current = false
      },
    })
  }

  const handleDownloadInvoice = async () => {
    setInvoiceDownloadError(null)
    setIsDownloadingInvoice(true)
    try {
      const { invoiceNumber, pdfBlob } = await downloadInvoiceMutation.mutateAsync()
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = buildInvoicePdfFilename(reservation?.reference ?? invoiceNumber, reservationId)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(downloadUrl)
      setInvoiceDownloadError(null)
    } catch (error) {
      setInvoiceDownloadError(await toInvoiceErrorMessage(error))
    } finally {
      setIsDownloadingInvoice(false)
    }
  }

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  return (
    <ReturnInspectionLayout
      stepIndex={isLockStep || !isInspectionCompleted ? 5 : 6}
      inspection={inspection}
      progress={isLockStep ? 80 : 100}
      showInspectionSummary={false}
      allStepsDone={!isLockStep && isInspectionCompleted}
    >
      {isLockStep && globalError ? (
        <div className="mb-4">
          <Alert variant="danger" title="Vérification de la restitution" message={globalError} />
          {verificationRequired ? (
            <Button className="mt-3" disabled={verificationMutation.isPending} onClick={() => verificationMutation.mutate()}>
              {verificationMutation.isPending ? 'Vérification en cours...' : 'Vérifier la restitution'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {reservationQuery.isLoading || (isLockStep && reservationQuery.isFetching) ? (
        <Card>
          <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-600">
            <LoadingSpinner size="sm" aria-label="Chargement de la restitution" />
            <p>Chargement des informations de restitution...</p>
          </div>
        </Card>
      ) : null}

      {reservationQuery.isError ? (
        <Alert variant="danger" title="Chargement impossible" message="Les informations de la restitution n'ont pas pu être chargées." />
      ) : null}

      {isLockStep && !reservationQuery.isLoading && !reservationQuery.isFetching && !reservationQuery.isError && !isInspectionCompleted ? (
        <div className="mx-auto w-full max-w-xl space-y-4">
          {inspection && !canLockVehicle ? (
            <Alert
              variant="warning"
              title="État des lieux incomplet"
              message={
                missingReturnPhotoTypes.length > 0
                  ? 'Les photos obligatoires de l’état des lieux doivent être enregistrées avant le verrouillage.'
                  : 'Enregistrez le kilométrage final et le niveau de carburant ou de batterie pour continuer.'
              }
            />
          ) : null}
          {!inspection && reservation ? (
            <Alert variant="warning" title="État des lieux introuvable" message="Reprenez l’état des lieux de retour avant de verrouiller le véhicule." />
          ) : null}

          <Card>
            <h1 className="text-center text-2xl font-semibold text-[#1F2937] sm:text-3xl">
              Verrouillage du véhicule
            </h1>
            <p className="mt-2 text-center text-base leading-7 text-slate-600">
              Veuillez replacer la clé dans son boîtier situé dans la boîte à gants.
            </p>

            <div className="relative mx-auto flex h-72 w-full max-w-sm items-center justify-center overflow-hidden sm:h-80">
              <div aria-hidden="true" className="absolute h-64 w-64 rounded-full border border-violet-200 sm:h-72 sm:w-72" />
              <div aria-hidden="true" className="absolute h-52 w-52 rounded-full border-2 border-violet-300 sm:h-60 sm:w-60" />
              <div aria-hidden="true" className="absolute h-40 w-40 rounded-full border-2 border-violet-400 sm:h-48 sm:w-48" />
              <div className="relative flex h-48 w-32 flex-col items-center rounded-[2rem] border-[6px] border-[#5B21B6] bg-[#F5F3FF] px-3 py-4 shadow-[0_20px_50px_rgba(91,33,182,0.22)]">
                <span className="mb-3 h-1.5 w-10 rounded-full bg-[#A78BFA]" />
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#6D28D9] text-white shadow-lg">
                    <LockKeyhole aria-hidden="true" size={36} />
                  </div>
                </div>
                <Smartphone aria-hidden="true" className="absolute -bottom-3 -right-4 rounded-full bg-white p-2 text-[#6D28D9] shadow-md" size={36} />
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
              <Button
                className={`w-full ${isDemoKeyCheckCompleted
                  ? 'bg-[#16A34A] text-white hover:bg-[#15803D] focus-visible:ring-[#16A34A]'
                  : 'bg-[#6D28D9] text-white hover:bg-[#5B21B6] focus-visible:ring-[#6D28D9]'}`}
                disabled={!canLockVehicle || demoKeyCheckMutation.isPending || isDemoKeyCheckCompleted}
                onClick={handleDemoKeyCheck}
              >
                {demoKeyCheckMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Vérification de démonstration en cours" />
                    Vérification en cours...
                  </span>
                ) : isDemoKeyCheckCompleted ? (
                  <>
                    <Check aria-hidden="true" size={18} />
                    Clé détectée
                  </>
                ) : (
                  'Détecter la clé'
                )}
              </Button>
              <p className="text-center text-xs text-slate-500">
                Vérification de démonstration : aucun capteur physique n’est utilisé.
              </p>
              <Button
                className={`w-full ${canFinalizeReturn
                  ? 'bg-[#6D28D9] text-white hover:bg-[#5B21B6] focus-visible:ring-[#6D28D9]'
                  : 'cursor-not-allowed bg-slate-300 text-slate-600 hover:bg-slate-300 focus-visible:ring-slate-300'}`}
                disabled={!canFinalizeReturn || verificationRequired || completeMutation.isPending || verificationMutation.isPending}
                onClick={handleLockVehicle}
              >
                {completeMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Verrouillage en cours" />
                    Verrouillage en cours...
                  </span>
                ) : (
                  <>
                    <LockKeyhole aria-hidden="true" size={18} />
                    Verrouiller le véhicule
                  </>
                )}
              </Button>
            </div>
          </Card>

          <div className="flex justify-center">
            <Button
              variant="secondary"
              className="w-full max-w-sm"
              onClick={() => navigate(`/client/reservations/${reservationId}/return-inspection/vehicle-state`)}
            >
              Retour à l’état du véhicule
            </Button>
          </div>
        </div>
      ) : null}

      {!isLockStep && !reservationQuery.isLoading && !reservationQuery.isError && !isInspectionCompleted ? (
        <Card>
          <div className="space-y-4 text-center">
            <Alert
              variant="warning"
              title="Restitution non terminée"
              message="La confirmation finale s’affichera après la confirmation du verrouillage."
            />
            <Button
              className="w-full bg-[#6D28D9] text-white hover:bg-[#5B21B6] focus-visible:ring-[#6D28D9] sm:w-auto"
              onClick={() => navigate(`/client/reservations/${reservationId}/return-inspection/lock`)}
            >
              Continuer vers le verrouillage
            </Button>
          </div>
        </Card>
      ) : null}

      {!isLockStep && isInspectionCompleted ? (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-full bg-[#16A34A] shadow-[0_16px_40px_rgba(22,163,74,0.3)]">
                <Check aria-hidden="true" className="text-white" size={60} strokeWidth={3} />
              </div>
              <h1 className="text-3xl font-semibold text-[#0F172A] sm:text-4xl">Véhicule restitué</h1>
              <p className="mt-3 text-base text-slate-700">
                Votre véhicule a bien été verrouillé et restitué. Le gestionnaire vérifiera les frais avant la clôture financière.
              </p>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="h-24 w-36 overflow-hidden rounded-2xl bg-[#F1F5F9]">
                  {currentVehicleQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <LoadingSpinner size="sm" aria-label="Chargement de la photo du véhicule" />
                    </div>
                  ) : resolveMediaUrl(currentVehicleQuery.data?.main_photo?.file) ? (
                    <img
                      src={resolveMediaUrl(currentVehicleQuery.data?.main_photo?.file) ?? ''}
                      alt={vehicleLabel}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">
                      Photo indisponible
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xl font-semibold text-[#0F172A]">{vehicleLabel}</p>
                  <p className="mt-1 text-sm text-slate-600">Référence {reservation?.reference ?? '-'}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-[#F8FAFC] px-4 py-3 text-left lg:text-right">
                <p className="text-sm font-medium text-slate-600">Véhicule restitué le</p>
                <p className="mt-1 text-base font-semibold text-[#0F172A]">
                  {reservation?.actual_return_at || inspection?.completed_at
                    ? formatDateTime(reservation?.actual_return_at ?? inspection!.completed_at!)
                    : 'Date réelle indisponible'}
                </p>
              </div>
            </div>
          </Card>

          {invoiceDownloadError ? (
            <Alert className="mb-2" variant="danger" title="Telechargement impossible" message={invoiceDownloadError} />
          ) : null}

          {invoiceQuery.isError ? (
            <Alert className="mb-2" variant="warning" title="Facture indisponible" message="La facture n'a pas pu etre chargee pour le moment. Vous pouvez reessayer plus tard depuis la section Mes factures." />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {reservation?.invoice_pdf_available ? <Button
              className="w-full sm:w-auto"
              disabled={isDownloadingInvoice || invoiceQuery.isLoading || !invoiceQuery.data}
              onClick={() => {
                void handleDownloadInvoice()
              }}
            >
              {isDownloadingInvoice ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" aria-label="Telechargement de la facture" />
                  Telechargement...
                </span>
              ) : invoiceQuery.isLoading && !invoiceQuery.data ? (
                'Preparation de la facture...'
              ) : (
                'Télécharger ma facture'
              )}
            </Button> : null}

            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate('/client/reservations')}>
              Retour à mes réservations
            </Button>
          </div>
        </div>
      ) : null}
    </ReturnInspectionLayout>
  )
}
