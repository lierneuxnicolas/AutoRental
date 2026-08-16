import { useEffect, useMemo, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import DepartureFlowProgress from '../../components/inspections/DepartureFlowProgress'
import ReservationProgressBanner from '../../components/reservations/ReservationProgressBanner'
import InspectionPhotoSlot from '../../components/inspections/InspectionPhotoSlot'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  completeInspection,
  createReturnInspection,
  lockVehicle,
  saveDepartureVehicleState,
  uploadInspectionPhoto,
} from '../../services/inspectionService'
import { getReservationById } from '../../services/reservationService'
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

type ApiErrorPayload = {
  detail?: string
  non_field_errors?: string[]
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

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string }> = [
  { value: 'MINEUR', label: 'Mineure' },
  { value: 'MODERE', label: 'Moderee' },
  { value: 'MAJEUR', label: 'Majeure' },
  { value: 'CRITIQUE', label: 'Critique' },
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

  return fallback
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

function ReturnInspectionLayout({
  children,
  stepIndex,
  inspection,
  progress,
  useDepartureProgressBanner = false,
  showInspectionSummary = true,
}: {
  children: React.ReactNode
  stepIndex: number
  inspection: Inspection | null
  progress: number
  useDepartureProgressBanner?: boolean
  showInspectionSummary?: boolean
}) {
  const steps = [
    { index: 1, label: 'Extérieur', status: 'done' as const },
    { index: 2, label: 'Intérieur', status: 'future' as const },
    { index: 3, label: 'État du véhicule', status: 'future' as const },
    { index: 4, label: 'Confirmation', status: 'future' as const },
  ] as Array<{ index: number; label: string; status: 'done' | 'active' | 'future' }>

  steps[stepIndex - 1] = { ...steps[stepIndex - 1], status: 'active' }
  for (let i = 0; i < stepIndex - 1; i += 1) {
    steps[i] = { ...steps[i], status: 'done' }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
        {useDepartureProgressBanner ? (
          <ReservationProgressBanner
            className="mb-6 sm:mb-8"
            steps={steps.map((step) => ({
              order: step.index,
              label: step.label,
              status: step.status,
            }))}
          />
        ) : (
          <DepartureFlowProgress steps={steps} />
        )}
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
  return <ReturnInspectionStepOne />
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

  const inspection = reservationQuery.data?.return_inspection ?? null

  const [photoState, setPhotoState] = useState<Record<string, PhotoSlotState>>(buildInitialPhotoState)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const uploadingSlotKeysRef = useRef<Set<string>>(new Set())
  const hasAttemptedInitializationRef = useRef(false)

  const startMutation = useMutation({
    mutationFn: () => createReturnInspection(reservationId),
    onSuccess: (response) => {
      const nextInspection = response.inspection
      setPhotoState(buildPhotoStateFromInspection(response.inspection as unknown as ReservationInspectionDetail))
      if (nextInspection && nextInspection.id) {
        void reservationQuery.refetch()
      }
      setGlobalError(null)
    },
    onError: (error) => {
      setGlobalError(toErrorMessage(error))
    },
  })

  useEffect(() => {
    hasAttemptedInitializationRef.current = false
  }, [reservationId])

  useEffect(() => {
    if (!isReservationIdValid || reservationQuery.isLoading || reservationQuery.isFetching || reservationQuery.isError) {
      return
    }
    if (inspection || startMutation.isPending || hasAttemptedInitializationRef.current) {
      return
    }

    hasAttemptedInitializationRef.current = true
    void startMutation.mutate()
  }, [inspection, isReservationIdValid, reservationQuery.isFetching, reservationQuery.isLoading, startMutation, startMutation.isPending])

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
  const initializationErrorMessage = !inspection && globalError
    ? `Impossible d'initialiser automatiquement l'etat des lieux de retour. ${globalError}`
    : null

  return (
    <ReturnInspectionLayout
      stepIndex={1}
      inspection={inspection}
      progress={progress}
      useDepartureProgressBanner
      showInspectionSummary={false}
    >
      {reservationLoadErrorMessage ? <Alert className="mb-4" variant="danger" title="Chargement impossible" message={reservationLoadErrorMessage} /> : null}
      {initializationErrorMessage ? <Alert className="mb-4" variant="danger" title="Initialisation impossible" message={initializationErrorMessage} /> : null}

      {isInitializingInspection ? (
        <Card>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <LoadingSpinner size="sm" aria-label="Initialisation" />
            <p>Initialisation automatique de l'etat des lieux de retour...</p>
          </div>
        </Card>
      ) : null}

      {inspection ? (
        <Card
          header={(
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Extérieur</h2>
              <Link to={`/client/reservations/${reservationId}`}>
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
      stepIndex={2}
      inspection={inspection}
      progress={Math.round((completedInteriorPhotos / INTERIOR_PHOTO_SLOTS.length) * 100)}
      useDepartureProgressBanner
      showInspectionSummary={false}
    >
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}
      <Card
        header={(
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Intérieur</h2>
            <Link to={`/client/reservations/${reservationId}`}>
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
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const inspection = reservationQuery.data?.return_inspection ?? null
  const [mileageInput, setMileageInput] = useState('')
  const [energyInput, setEnergyInput] = useState('')
  const [hasDamage, setHasDamage] = useState<boolean | null>(null)
  const [damageDescription, setDamageDescription] = useState('')
  const [damageSeverity, setDamageSeverity] = useState<Severity | ''>('')
  const [anomalyPhotoState, setAnomalyPhotoState] = useState<Record<AnomalyPhotoSlotKey, AnomalyPhotoSlotState>>(
    buildInitialAnomalyPhotoState,
  )
  const [globalError, setGlobalError] = useState<string | null>(null)
  const anomalyPhotoInputRefs = useRef<Record<AnomalyPhotoSlotKey, HTMLInputElement | null>>({
    slot1: null,
    slot2: null,
  })

  const mileageValue = parsePositiveInteger(mileageInput)
  const energyValue = parsePositiveInteger(energyInput)
  const isMileageValid = mileageValue !== null
  const isEnergyValid = energyValue !== null && energyValue >= 0 && energyValue <= 100

  const missingFields = useMemo(() => {
    const missing: string[] = []
    if (!isMileageValid) missing.push('Kilometrage')
    if (!isEnergyValid) missing.push('Niveau carburant/batterie')
    if (hasDamage === null) missing.push('Anomalie constatee')
    if (hasDamage && damageDescription.trim().length === 0) missing.push('Description anomalie')
    if (hasDamage && damageSeverity === '') missing.push('Gravite anomalie')
    return missing
  }, [damageDescription, damageSeverity, hasDamage, isEnergyValid, isMileageValid])

  const canContinue = Boolean(inspection) && missingFields.length === 0

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
    onSuccess: async (response) => {
      setGlobalError(null)
      await reservationQuery.refetch()

      navigate(`/client/reservations/${reservationId}/return-inspection/confirmation`, {
        state: {
          inspectionId: inspection?.id,
          mileage: mileageValue,
          energyLevelPercent: energyValue,
          hasDamage: Boolean(response.damage),
          damageDescription: response.damage?.description ?? '',
          criticalIssue: response.inspection.has_critical_issue ?? false,
          criticalIssueDescription: response.inspection.critical_issue_description ?? '',
        },
      })
    },
    onError: (error) => {
      setGlobalError(toErrorMessage(error))
    },
  })

  const onSaveVehicleState = () => {
    if (!inspection || !canContinue || mileageValue === null || energyValue === null || hasDamage === null) {
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
    void saveStateMutation.mutateAsync(payload)
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
      stepIndex={3}
      inspection={inspection}
      progress={50}
      useDepartureProgressBanner
      showInspectionSummary={false}
    >
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}
      <Card header={<h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">État du véhicule</h2>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="return-mileage" className="block text-sm font-medium text-[#1F2937]">Kilometrage final</label>
              <input id="return-mileage" type="number" min={0} step={1} value={mileageInput} onChange={(event) => setMileageInput(event.target.value)} className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" placeholder="Ex: 24510" />
            </div>
            <div className="space-y-2">
              <label htmlFor="return-energy" className="block text-sm font-medium text-[#1F2937]">Niveau carburant / batterie final (%)</label>
              <input id="return-energy" type="number" min={0} max={100} step={1} value={energyInput} onChange={(event) => setEnergyInput(event.target.value)} className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" placeholder="Ex: 75" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[#1F2937]">Anomalie constatée</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="return-damage" checked={hasDamage === true} onChange={() => setHasDamage(true)} />Oui</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="return-damage" checked={hasDamage === false} onChange={() => {
                setHasDamage(false)
                setDamageDescription('')
                setDamageSeverity('')
                setAnomalyPhotoState((current) => {
                  Object.values(current).forEach((slot) => revokePreviewUrl(slot.previewUrl))
                  return buildInitialAnomalyPhotoState()
                })
              }} />Non</label>
            </div>
          </div>

          {hasDamage ? (
            <>
              <div className="space-y-2">
                <label htmlFor="return-anomaly-description" className="block text-sm font-medium text-[#1F2937]">Description</label>
                <textarea
                  id="return-anomaly-description"
                  value={damageDescription}
                  onChange={(event) => setDamageDescription(event.target.value)}
                  rows={4}
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  placeholder="Decrivez precisement l'anomalie constatee"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="return-anomaly-severity" className="block text-sm font-medium text-[#1F2937]">Gravite</label>
                <select
                  id="return-anomaly-severity"
                  value={damageSeverity}
                  onChange={(event) => setDamageSeverity(event.target.value as Severity)}
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Selectionner une gravite</option>
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-[#1F2937]">Photos de l'anomalie (2 maximum)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ANOMALY_PHOTO_SLOTS.map((slot) => {
                    const slotState = anomalyPhotoState[slot.key]
                    return (
                      <Card key={slot.key} className="h-full">
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-[#1F2937]">{slot.label}</p>

                          <input
                            ref={(input) => {
                              anomalyPhotoInputRefs.current[slot.key] = input
                            }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={slotState.isUploading}
                            className="hidden"
                            onChange={(event) => {
                              const selectedFile = event.target.files?.[0] ?? null
                              if (selectedFile) {
                                void uploadAnomalyPhoto(slot.key, selectedFile)
                              }
                            }}
                          />

                          {slotState.previewUrl ? (
                            <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]">
                              <img src={slotState.previewUrl} alt={slot.label} className="h-44 w-full object-cover" />
                            </div>
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-center text-sm text-slate-500">
                              Emplacement vide
                            </div>
                          )}

                          {slotState.errorMessage ? <Alert variant="danger" message={slotState.errorMessage} /> : null}

                          <div className="flex flex-col gap-2">
                            <Button
                              className="w-full"
                              disabled={slotState.isUploading}
                              onClick={() => anomalyPhotoInputRefs.current[slot.key]?.click()}
                            >
                              {slotState.isUploading ? (
                                <span className="flex items-center gap-2">
                                  <LoadingSpinner size="sm" aria-label="Envoi de photo" />
                                  Envoi en cours...
                                </span>
                              ) : slotState.photoId ? (
                                'Remplacer la photo'
                              ) : (
                                'Ajouter une photo'
                              )}
                            </Button>

                            {slotState.photoId ? (
                              <Button
                                variant="secondary"
                                className="w-full"
                                disabled={slotState.isUploading}
                                onClick={() => removeAnomalyPhoto(slot.key)}
                              >
                                Supprimer la photo
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}

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
      </Card>
    </ReturnInspectionLayout>
  )
}

export function ReturnInspectionConfirmationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
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
  const [isReturnCompleted, setIsReturnCompleted] = useState(false)
  const anomalyPhotos = useMemo(
    () => (inspection?.photos ?? []).filter((photo) => photo.photo_type === 'DOMMAGE' && Boolean(photo.file)),
    [inspection?.photos],
  )
  const vehicleLabel = reservation ? `${reservation.vehicle.brand} ${reservation.vehicle.model_name}` : 'Non disponible'

  const state = location.state as {
    inspectionId?: number
    mileage?: number | null
    energyLevelPercent?: number | null
    hasDamage?: boolean | null
    damageDescription?: string
    damageSeverity?: Severity | null
    criticalIssue?: boolean | null
    criticalIssueDescription?: string
    comments?: string
  } | undefined

  const effectiveMileage = state?.mileage ?? inspection?.mileage ?? null
  const effectiveEnergyLevelPercent = state?.energyLevelPercent ?? inspection?.energy_level_percent ?? null
  const hasAnomalyFromInspection = anomalyPhotos.length > 0 || Boolean(inspection?.has_critical_issue)
  const hasAnomaly = hasAnomalyFromInspection || Boolean(state?.hasDamage)
  const anomalyDescription = inspection?.critical_issue_description?.trim() || state?.damageDescription?.trim() || ''
  const isInspectionCompleted = inspection?.status === 'TERMINE'
  const shouldShowCompletedState = isReturnCompleted || isInspectionCompleted

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!inspection || effectiveMileage == null || effectiveEnergyLevelPercent == null) {
        throw new Error('Inspection ou donnees de restitution incompletes.')
      }

      const payload: CompleteInspectionRequest = {
        mileage: effectiveMileage,
        energy_level_percent: effectiveEnergyLevelPercent,
      }

      if (state?.comments && state.comments.trim().length > 0) {
        payload.comments = state.comments.trim()
      }
      if (state?.criticalIssue !== null && state?.criticalIssue !== undefined) {
        payload.has_critical_issue = state.criticalIssue
      }
      if (state?.criticalIssue) {
        payload.critical_issue_description = state.criticalIssueDescription?.trim() ?? ''
      }

      if (inspection.status === 'TERMINE') {
        return reservationQuery.refetch()
      }

      await completeInspection(inspection.id, payload)
      await lockVehicle(reservationId)
      return reservationQuery.refetch()
    },
    onSuccess: () => {
      setGlobalError(null)
      setIsReturnCompleted(true)
    },
    onError: (error) => {
      setGlobalError(toErrorMessage(error))
    },
  })

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  return (
    <ReturnInspectionLayout
      stepIndex={4}
      inspection={inspection}
      progress={100}
      useDepartureProgressBanner
      showInspectionSummary={false}
    >
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}
      {shouldShowCompletedState ? (
        <Card>
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">✓ Véhicule restitué</h2>
            <p className="text-sm text-slate-700 sm:text-base">Votre location est terminée. Merci d’avoir utilisé GetaCar.</p>
            <ul className="space-y-2 text-sm text-slate-700">
              <li>Vehicule : {vehicleLabel}</li>
              <li>Kilométrage final : {effectiveMileage ?? '-'}</li>
              <li>Niveau carburant / batterie final : {effectiveEnergyLevelPercent ?? '-'}%</li>
              <li>Anomalie éventuelle : {hasAnomaly ? 'Oui' : 'Non'}</li>
              {hasAnomaly && anomalyDescription ? <li>Description : {anomalyDescription}</li> : null}
            </ul>

            {anomalyPhotos.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#1F2937]">Photos de l'anomalie</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {anomalyPhotos.map((photo) => {
                    const photoUrl = resolveMediaUrl(photo.file)
                    if (!photoUrl) {
                      return null
                    }

                    return (
                      <div key={photo.id} className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]">
                        <img src={photoUrl} alt={`Anomalie ${photo.position ?? photo.id}`} className="h-44 w-full object-cover" />
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex justify-center">
              <Button className="w-full sm:w-auto" onClick={() => navigate('/client')}>Retour au tableau de bord</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {!shouldShowCompletedState ? (
      <Card header={<h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Confirmation</h2>}>
        <div className="space-y-4 text-sm text-slate-700">
          <ul className="space-y-2">
            <li>Vehicule : {vehicleLabel}</li>
            <li>Kilométrage final : {effectiveMileage ?? '-'}</li>
            <li>Niveau carburant / batterie final : {effectiveEnergyLevelPercent ?? '-'}%</li>
            <li>Anomalie éventuelle : {hasAnomaly ? 'Oui' : 'Non'}</li>
            {hasAnomaly && anomalyDescription ? <li>Description : {anomalyDescription}</li> : null}
            {state?.hasDamage ? <li>Gravite : {state.damageSeverity || '—'}</li> : null}
          </ul>

          {anomalyPhotos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#1F2937]">Photos de l'anomalie</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {anomalyPhotos.map((photo) => {
                  const photoUrl = resolveMediaUrl(photo.file)
                  if (!photoUrl) {
                    return null
                  }

                  return (
                    <div key={photo.id} className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]">
                      <img src={photoUrl} alt={`Anomalie ${photo.position ?? photo.id}`} className="h-44 w-full object-cover" />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="flex justify-center pt-2">
            <Button
              className="w-full sm:w-auto"
              disabled={completeMutation.isPending || effectiveMileage == null || effectiveEnergyLevelPercent == null}
              onClick={() => void completeMutation.mutateAsync()}
            >
              {completeMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" aria-label="Confirmation de la restitution" />
                  Confirmation en cours...
                </span>
              ) : (
                'Confirmer la restitution'
              )}
            </Button>
          </div>
        </div>
      </Card>
      ) : null}
    </ReturnInspectionLayout>
  )
}
