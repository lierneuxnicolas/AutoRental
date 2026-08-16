import { useEffect, useMemo, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  createDepartureInspection,
  createReturnInspection,
  uploadInspectionPhoto,
} from '../../services/inspectionService'
import { getReservationById } from '../../services/reservationService'
import { getVehicleById } from '../../services/vehicleService'
import type {
  CompleteInspectionRequest,
  Inspection,
  InspectionPhoto,
  PhotoType,
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

  const fieldEntries = Object.entries(payload).filter(
    ([key, value]) => key !== 'detail' && key !== 'non_field_errors' && Array.isArray(value) && value.length > 0,
  )

  if (fieldEntries.length > 0) {
    const [field, messages] = fieldEntries[0]
    return `${field}: ${String((messages as unknown[])[0])}`
  }

  return fallback
}

function toErrorCode(error: unknown): string | null {
  const axiosError = error as AxiosError<ApiErrorPayload>
  const payload = axiosError.response?.data
  const rawCode = payload?.code

  if (typeof rawCode === 'string' && rawCode.trim().length > 0) {
    return rawCode.trim()
  }

  return null
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

function buildReturnCommentBlock(
  userComment: string,
  hasDamage: boolean,
  damageDescription: string,
): string {
  const lines: string[] = [
    `Dommage constate: ${hasDamage ? 'Oui' : 'Non'}`,
  ]

  if (hasDamage) {
    lines.push(`Description dommage: ${damageDescription.trim()}`)
  }

  if (userComment.trim().length > 0) {
    lines.push(`Commentaire client: ${userComment.trim()}`)
  }

  return lines.join('\n')
}

export type InspectionWorkflowMode = 'departure' | 'return'
export type DepartureStepView = 'exterior' | 'interior'

type ReservationInspectionWorkflowPageProps = {
  mode?: InspectionWorkflowMode
  stepView?: DepartureStepView
}

export function ReservationInspectionWorkflowPage({ mode = 'departure', stepView = 'exterior' }: ReservationInspectionWorkflowPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isReturnMode = mode === 'return'
  const isDepartureInteriorStep = !isReturnMode && stepView === 'interior'
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const reservationInspection = isReturnMode
    ? reservationQuery.data?.return_inspection ?? null
    : reservationQuery.data?.departure_inspection ?? null

  const vehicleId = reservationQuery.data?.vehicle.id
  const vehicleQuery = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicleById(vehicleId!),
    enabled: typeof vehicleId === 'number' && vehicleId > 0,
  })

  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [backendMissingFields, setBackendMissingFields] = useState<string[]>([])
  const [photoState, setPhotoState] = useState<Record<string, PhotoSlotState>>(buildInitialPhotoState)

  const [mileageInput] = useState('')
  const [energyLevelInput] = useState('')
  const [commentsInput, setCommentsInput] = useState('')

  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isExteriorStepCompleted, setIsExteriorStepCompleted] = useState(false)
  const [isInteriorStepCompleted, setIsInteriorStepCompleted] = useState(false)
  const [isRequiredFieldsStepCompleted, setIsRequiredFieldsStepCompleted] = useState(false)
  const [hasDeclaredDamage, setHasDeclaredDamage] = useState(false)
  const [hasReturnDamage, setHasReturnDamage] = useState<boolean | null>(null)
  const [returnDamageDescription, setReturnDamageDescription] = useState('')
  const [hasCriticalIssue, setHasCriticalIssue] = useState<boolean | null>(null)
  const [criticalIssueDescription, setCriticalIssueDescription] = useState('')
  const [isReturnConfirmationSubmitting, setIsReturnConfirmationSubmitting] = useState(false)
  const uploadingSlotKeysRef = useRef<Set<string>>(new Set())
  const hasAttemptedAutoInitRef = useRef(false)

  useEffect(() => {
    if (!reservationInspection) {
      return
    }

    setInspection(reservationInspection)
    setPhotoState(buildPhotoStateFromInspection(reservationInspection))
    setGlobalError(null)
    setBackendMissingFields([])
  }, [reservationInspection])

  useEffect(() => {
    hasAttemptedAutoInitRef.current = false
  }, [reservationId, isReturnMode])

  useEffect(() => {
    return () => {
      Object.values(photoState).forEach((slot) => {
        revokePreviewUrl(slot.previewUrl)
      })
    }
  }, [photoState])

  const startInspectionMutation = useMutation({
    mutationFn: () => (isReturnMode ? createReturnInspection(reservationId) : createDepartureInspection(reservationId)),
    onSuccess: (response) => {
      setInspection(response.inspection)
      setBackendMissingFields(response.missing_fields)

      if (isReturnMode && response.inspection.inspection_type !== 'FINAL') {
        setGlobalSuccess(null)
        setGlobalError("Type d'inspection inattendu pour le retour. Inspection FINAL attendue.")
        return
      }

      setGlobalError(null)
      setGlobalSuccess(isReturnMode ? 'Etat des lieux de retour initialise. Completez les etapes Exterieur puis Interieur.' : null)
    },
    onError: (error) => {
      setGlobalSuccess(null)
      setGlobalError(toErrorMessage(error))
    },
  })

  useEffect(() => {
    if (isReturnMode || !isReservationIdValid || inspection || reservationInspection) {
      return
    }

    if (reservationQuery.isLoading || reservationQuery.isFetching || startInspectionMutation.isPending) {
      return
    }

    if (hasAttemptedAutoInitRef.current) {
      return
    }

    hasAttemptedAutoInitRef.current = true
    setGlobalSuccess(null)
    setGlobalError(null)
    startInspectionMutation.mutate()
  }, [
    inspection,
    isReservationIdValid,
    isReturnMode,
    reservationInspection,
    reservationQuery.isFetching,
    reservationQuery.isLoading,
    startInspectionMutation,
  ])

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

  const completeInspectionMutation = useMutation({
    mutationFn: (payload: CompleteInspectionRequest) => {
      if (!inspection) {
        throw new Error('Inspection non initialisee.')
      }

      return completeInspection(inspection.id, payload)
    },
    onSuccess: (response) => {
      setInspection(response)
      setGlobalError(null)
      setGlobalSuccess(
        isReturnMode
          ? 'Vehicule restitue.'
          : 'Etat des lieux termine avec succes. La location peut demarrer.',
      )
      setBackendMissingFields([])
      setIsReturnConfirmationSubmitting(false)
    },
    onError: (error) => {
      const code = toErrorCode(error)

      if (isReturnMode && code === 'INSPECTION_ALREADY_COMPLETED') {
        setGlobalError(null)
        setGlobalSuccess('Vehicule restitue.')
        setIsReturnConfirmationSubmitting(false)
        void reservationQuery.refetch()
        return
      }

      setGlobalSuccess(null)
      setGlobalError(toErrorMessage(error))
      setIsReturnConfirmationSubmitting(false)
    },
  })

  const completedExteriorPhotos = useMemo(
    () => EXTERIOR_PHOTO_SLOTS.filter((slot) => photoState[slot.key]?.uploadedPhoto !== null).length,
    [photoState],
  )

  const missingExteriorPhotos = useMemo(
    () => EXTERIOR_PHOTO_SLOTS.filter((slot) => photoState[slot.key]?.uploadedPhoto === null),
    [photoState],
  )

  const completedInteriorPhotos = useMemo(
    () => INTERIOR_PHOTO_SLOTS.filter((slot) => photoState[slot.key]?.uploadedPhoto !== null).length,
    [photoState],
  )

  const missingInteriorPhotos = useMemo(
    () => INTERIOR_PHOTO_SLOTS.filter((slot) => photoState[slot.key]?.uploadedPhoto === null),
    [photoState],
  )

  const mileageValue = parsePositiveInteger(mileageInput)
  const energyLevelValue = parsePositiveInteger(energyLevelInput)

  const isMileageValid = mileageValue !== null
  const isEnergyValid = energyLevelValue !== null && energyLevelValue >= 0 && energyLevelValue <= 100

  const localMissingFields = useMemo(() => {
    const missing: string[] = []

    if (!isMileageValid) {
      missing.push('mileage')
    }

    if (!isEnergyValid) {
      missing.push('energy_level_percent')
    }

    if (isReturnMode) {
      if (hasReturnDamage === null) {
        missing.push('has_damage')
      }

      if (hasReturnDamage && returnDamageDescription.trim().length === 0) {
        missing.push('damage_description')
      }

      if (hasCriticalIssue === null) {
        missing.push('has_critical_issue')
      }

      if (hasCriticalIssue && criticalIssueDescription.trim().length === 0) {
        missing.push('critical_issue_description')
      }
    }

    return missing
  }, [
    criticalIssueDescription,
    hasCriticalIssue,
    hasReturnDamage,
    isEnergyValid,
    isMileageValid,
    isReturnMode,
    returnDamageDescription,
  ])

  const missingDataSummary = useMemo(() => {
    const missing: string[] = []

    if (missingExteriorPhotos.length > 0) {
      missing.push(`Photos exterieures: ${missingExteriorPhotos.map((item) => item.label).join(', ')}`)
    }

    if (missingInteriorPhotos.length > 0) {
      missing.push(`Photos interieures: ${missingInteriorPhotos.map((item) => item.label).join(', ')}`)
    }

    if (localMissingFields.includes('mileage')) {
      missing.push('Kilometrage')
    }

    if (localMissingFields.includes('energy_level_percent')) {
      missing.push('Niveau energie/carburant')
    }

    if (isReturnMode && localMissingFields.includes('has_damage')) {
      missing.push('Dommage constate (Oui/Non)')
    }

    if (isReturnMode && localMissingFields.includes('damage_description')) {
      missing.push('Description du dommage')
    }

    if (isReturnMode && localMissingFields.includes('has_critical_issue')) {
      missing.push('Anomalie critique (Oui/Non)')
    }

    if (isReturnMode && localMissingFields.includes('critical_issue_description')) {
      missing.push('Description anomalie critique')
    }

    return missing
  }, [isReturnMode, localMissingFields, missingExteriorPhotos, missingInteriorPhotos])

  const progress = useMemo(() => {
    const totalItems = EXTERIOR_PHOTO_SLOTS.length + INTERIOR_PHOTO_SLOTS.length + 2
    const completedItems = completedExteriorPhotos + completedInteriorPhotos + (isMileageValid ? 1 : 0) + (isEnergyValid ? 1 : 0)

    if (totalItems <= 0) {
      return 0
    }

    return Math.round((completedItems / totalItems) * 100)
  }, [completedExteriorPhotos, completedInteriorPhotos, isEnergyValid, isMileageValid])

  const isReturnPhotosPersisted =
    completedExteriorPhotos === EXTERIOR_PHOTO_SLOTS.length
    && completedInteriorPhotos === INTERIOR_PHOTO_SLOTS.length

  const canCompleteInspection = Boolean(
    inspection
    && inspection.status !== 'TERMINE'
    && isRequiredFieldsStepCompleted
    && localMissingFields.length === 0
    && (!isReturnMode || isReturnPhotosPersisted)
    && !completeInspectionMutation.isPending,
  )

  const canContinueExteriorStep = Boolean(inspection) && completedExteriorPhotos === EXTERIOR_PHOTO_SLOTS.length
  const canContinueInteriorStep = Boolean(inspection) && completedInteriorPhotos === INTERIOR_PHOTO_SLOTS.length

  const canContinueRequiredFieldsStep = Boolean(inspection)
    && localMissingFields.length === 0
    && (!isReturnMode || isReturnPhotosPersisted)
  const isSlotUploading = (slotKey: string) => uploadingSlotKeysRef.current.has(slotKey)
  const shouldShowExteriorStep = isReturnMode || !isDepartureInteriorStep
  const shouldShowInteriorStep = isReturnMode ? isExteriorStepCompleted : isDepartureInteriorStep
  const firstStepLabel = isReturnMode ? 'Restitution' : 'Deverrouillage'

  useEffect(() => {
    if (isReturnMode || !isDepartureInteriorStep || !inspection) {
      return
    }

    if (completedExteriorPhotos < EXTERIOR_PHOTO_SLOTS.length) {
      navigate(`/client/reservations/${reservationId}/departure-inspection`, { replace: true })
    }
  }, [
    completedExteriorPhotos,
    inspection,
    isDepartureInteriorStep,
    isReturnMode,
    navigate,
    reservationId,
  ])

  const departureFlowSteps = useMemo(() => {
    const isInspectionCompleted = inspection?.status === 'TERMINE'

    if (!isReturnMode) {
      if (isInspectionCompleted) {
        return [
          { index: 1, label: firstStepLabel, status: 'done' as const },
          { index: 2, label: 'Exterieur', status: 'done' as const },
          { index: 3, label: 'Interieur', status: 'done' as const },
          { index: 4, label: 'Etat du vehicule', status: 'done' as const },
          { index: 5, label: 'Confirmation', status: 'done' as const },
        ]
      }

      if (isDepartureInteriorStep) {
        return [
          { index: 1, label: firstStepLabel, status: 'done' as const },
          { index: 2, label: 'Exterieur', status: 'done' as const },
          { index: 3, label: 'Interieur', status: 'active' as const },
          { index: 4, label: 'Etat du vehicule', status: 'future' as const },
          { index: 5, label: 'Confirmation', status: 'future' as const },
        ]
      }

      return [
        { index: 1, label: firstStepLabel, status: 'done' as const },
        { index: 2, label: 'Exterieur', status: 'active' as const },
        { index: 3, label: 'Interieur', status: 'future' as const },
        { index: 4, label: 'Etat du vehicule', status: 'future' as const },
        { index: 5, label: 'Confirmation', status: 'future' as const },
      ]
    }

    if (isInspectionCompleted) {
      return [
        { index: 1, label: firstStepLabel, status: 'done' as const },
        { index: 2, label: 'Exterieur', status: 'done' as const },
        { index: 3, label: 'Interieur', status: 'done' as const },
        { index: 4, label: 'Confirmation', status: 'done' as const },
      ]
    }

    if (isInteriorStepCompleted) {
      return [
        { index: 1, label: firstStepLabel, status: 'done' as const },
        { index: 2, label: 'Exterieur', status: 'done' as const },
        { index: 3, label: 'Interieur', status: 'done' as const },
        { index: 4, label: 'Confirmation', status: 'active' as const },
      ]
    }

    if (isExteriorStepCompleted) {
      return [
        { index: 1, label: firstStepLabel, status: 'done' as const },
        { index: 2, label: 'Exterieur', status: 'done' as const },
        { index: 3, label: 'Interieur', status: 'active' as const },
        { index: 4, label: 'Confirmation', status: 'future' as const },
      ]
    }

    return [
      { index: 1, label: firstStepLabel, status: 'done' as const },
      { index: 2, label: 'Exterieur', status: 'active' as const },
      { index: 3, label: 'Interieur', status: 'future' as const },
      { index: 4, label: 'Confirmation', status: 'future' as const },
    ]
  }, [firstStepLabel, inspection?.status, isDepartureInteriorStep, isExteriorStepCompleted, isInteriorStepCompleted, isReturnMode])

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  if (inspection?.status === 'TERMINE') {
    const reservation = reservationQuery.data
    const vehicle = vehicleQuery.data
    const vehiclePhoto = resolveMediaUrl(vehicle?.main_photo?.file)
    const restitutionLocationParts = [vehicle?.parking_name, vehicle?.parking_space_number, vehicle?.parking_address]
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item!.trim())
    const restitutionLocation = restitutionLocationParts.length > 0 ? restitutionLocationParts.join(' - ') : 'Lieu non renseigne'

    return (
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card className="border border-[#D1FAE5] bg-linear-to-br from-[#ECFDF5] via-white to-[#DBEAFE]">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#047857]">Etat des lieux valide</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#065F46]">
                {isReturnMode ? 'Vehicule restitue' : 'Location demarree !'}
              </h1>
              {isReturnMode ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#166534]">
                  Votre etat des lieux a ete enregistre. Le vehicule est maintenant verrouille et le retour est en attente de verification par GetACar.
                </p>
              ) : null}
            </div>

            {vehiclePhoto ? (
              <div className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-sm">
                <img
                  src={vehiclePhoto}
                  alt={reservation ? `${reservation.vehicle.brand} ${reservation.vehicle.model_name}` : 'Vehicule'}
                  className="h-64 w-full object-cover"
                />
              </div>
            ) : null}

            <div className="grid gap-4 rounded-2xl border border-[#D1FAE5] bg-white p-4 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <p className="font-medium text-[#1F2937]">Modele</p>
                <p className="mt-1">{reservation ? `${reservation.vehicle.brand} ${reservation.vehicle.model_name}` : 'Non disponible'}</p>
              </div>
              <div>
                <p className="font-medium text-[#1F2937]">Reference reservation</p>
                <p className="mt-1">{reservation?.reference ?? 'Non disponible'}</p>
              </div>
              <div>
                <p className="font-medium text-[#1F2937]">{isReturnMode ? 'Fin reelle de location' : 'Debut reel de location'}</p>
                <p className="mt-1">{formatDateTime(inspection.completed_at)}</p>
              </div>
              <div>
                <p className="font-medium text-[#1F2937]">Fin prevue</p>
                <p className="mt-1">{formatDateTime(reservation?.end_at)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="font-medium text-[#1F2937]">Lieu de restitution</p>
                <p className="mt-1">{restitutionLocation}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to={`/client/reservations/${reservationId}`}>
                <Button className="w-full sm:w-auto">{isReturnMode ? 'Voir ma reservation' : 'Voir ma location en cours'}</Button>
              </Link>
              <Link to="/client">
                <Button variant="secondary" className="w-full sm:w-auto">Retour au tableau de bord</Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
        {isReturnMode ? (
          <DepartureFlowProgress steps={departureFlowSteps} />
        ) : (
          <ReservationProgressBanner
            className="mb-6 sm:mb-8"
            steps={departureFlowSteps.map((step) => ({
              order: step.index,
              label: step.label,
              status: step.status,
            }))}
          />
        )}
      </div>

      {globalSuccess ? <Alert className="mb-4" variant="success" title="Succes" message={globalSuccess} /> : null}
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}

      {!inspection ? (
        isReturnMode ? (
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Lancez l'inspection de retour pour obtenir les photos obligatoires et l'identifiant d'etat des lieux.
              </p>
              <Button onClick={() => void startInspectionMutation.mutate()} disabled={startInspectionMutation.isPending}>
                {startInspectionMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Initialisation" />
                    Initialisation...
                  </span>
                ) : (
                  "Commencer l'etat des lieux de retour"
                )}
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <LoadingSpinner size="sm" aria-label="Initialisation automatique" />
                <p>Initialisation automatique de l'etat des lieux...</p>
              </div>

              {startInspectionMutation.isError ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-700">
                    L'etat des lieux n'a pas pu etre initialise automatiquement. Verifiez votre connexion puis reessayez.
                  </p>
                  <Button
                    onClick={() => {
                      hasAttemptedAutoInitRef.current = true
                      setGlobalError(null)
                      void startInspectionMutation.mutate()
                    }}
                    disabled={startInspectionMutation.isPending}
                  >
                    Reessayer l'initialisation
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>
        )
      ) : (
        <div className="space-y-6">
          {isReturnMode ? (
            <>
              <Card
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inspection</p>
                      <p className="text-base font-semibold text-[#0F172A]">#{inspection.id}</p>
                    </div>
                    <StatusBadge variant={inspectionStatusToBadge(inspection.status).variant} label={inspectionStatusToBadge(inspection.status).label} />
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#1F2937]">Progression</p>
                    <p className="text-sm font-semibold text-[#0F172A]">{progress}%</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#E5E7EB]">
                    <div className="h-full rounded-full bg-[#2563EB] transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                  </div>

                  {backendMissingFields.length > 0 ? (
                    <Alert
                      variant="info"
                      title="Champs signales par le backend"
                      message={
                        <ul className="list-disc pl-5">
                          {backendMissingFields.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      }
                    />
                  ) : null}
                </div>
              </Card>

              <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Champs backend requis avant cloture</h2>}>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li>Kilometrage: requis</li>
                  <li>Niveau carburant/energie: requis</li>
                  <li>Commentaire: optionnel</li>
                  <li>Presence d'un dommage: optionnel (via signalement dommage)</li>
                  <li>Anomalie critique: optionnelle a la saisie, mais bloque la cloture si active</li>
                  <li>Photos obligatoires: requises</li>
                </ul>

                <div className="mt-4">
                  {missingDataSummary.length === 0 ? (
                    <Alert variant="success" title="Donnees manquantes" message="Aucune" />
                  ) : (
                    <Alert
                      variant="warning"
                      title="Donnees manquantes"
                      message={
                        <ul className="list-disc pl-5">
                          {missingDataSummary.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                </div>

                {backendMissingFields.length > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Champs retournes par l'API au demarrage: {backendMissingFields.join(', ')}
                  </p>
                ) : null}
              </Card>
            </>
          ) : null}

          {shouldShowExteriorStep ? (
            <Card
              header={isReturnMode ? (
                <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Exterieur</h2>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Exterieur</h2>
                  <Link to={`/client/reservations/${reservationId}`}>
                    <Button variant="secondary">Retour a la reservation</Button>
                  </Link>
                </div>
              )}
            >
              <p className="mb-4 text-base text-slate-600 sm:text-lg">
                {isReturnMode
                  ? `${completedExteriorPhotos}/${EXTERIOR_PHOTO_SLOTS.length} photo(s) exterieure(s) obligatoire(s) envoyee(s).`
                  : "Ajoutez les 4 photos exterieures obligatoires pour valider l'etat des lieux."}
              </p>

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
                    isUploading={isSlotUploading(slotConfig.key)}
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
                <Button
                  className="w-full sm:w-auto"
                  disabled={!canContinueExteriorStep}
                  onClick={() => {
                    if (isReturnMode) {
                      setIsExteriorStepCompleted(true)
                      return
                    }

                    navigate(`/client/reservations/${reservationId}/departure-inspection/interior`)
                  }}
                >
                  Continuer
                </Button>
              </div>
            </Card>
          ) : null}

          {shouldShowInteriorStep ? (
            <Card
              header={isReturnMode ? (
                <h2 className="text-lg font-semibold text-[#1F2937]">Etat des lieux - Interieur</h2>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">Etat des lieux - Interieur</h2>
                  <Link to={`/client/reservations/${reservationId}`}>
                    <Button variant="secondary">Retour a la reservation</Button>
                  </Link>
                </div>
              )}
            >
              <p className={isReturnMode ? 'mb-4 text-sm text-slate-600' : 'mb-4 text-base text-slate-600 sm:text-lg'}>
                {isReturnMode
                  ? `${completedInteriorPhotos}/${INTERIOR_PHOTO_SLOTS.length} photo(s) interieure(s) obligatoire(s) envoyee(s).`
                  : "Ajoutez les 4 photos interieures obligatoires pour valider l'etat des lieux."}
              </p>

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
                      isUploading={isSlotUploading(slotConfig.key)}
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

              <div className={isReturnMode ? 'mt-4' : 'mt-4 flex justify-center'}>
                <Button
                  className="w-full sm:w-auto"
                  disabled={!canContinueInteriorStep}
                  onClick={() => {
                    if (isReturnMode) {
                      setIsInteriorStepCompleted(true)
                      return
                    }

                    navigate(`/client/reservations/${reservationId}/departure-inspection/vehicle-state`)
                  }}
                >
                  Continuer
                </Button>
              </div>
            </Card>
          ) : null}

          {isInteriorStepCompleted ? (
          <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Champs requis</h2>}>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={hasDeclaredDamage}
                  onChange={(event) => setHasDeclaredDamage(event.target.checked)}
                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB]"
                />
                Dommages declares
              </label>

              {isReturnMode ? (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-[#1F2937]">Dommage constate</p>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="return-damage"
                          checked={hasReturnDamage === true}
                          onChange={() => setHasReturnDamage(true)}
                        />
                        Oui
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="return-damage"
                          checked={hasReturnDamage === false}
                          onChange={() => setHasReturnDamage(false)}
                        />
                        Non
                      </label>
                    </div>
                  </div>

                  {hasReturnDamage ? (
                    <div className="space-y-2">
                      <label htmlFor="return-damage-description" className="block text-sm font-medium text-[#1F2937]">
                        Description du dommage <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="return-damage-description"
                        value={returnDamageDescription}
                        onChange={(event) => setReturnDamageDescription(event.target.value)}
                        rows={3}
                        className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                        placeholder="Decrivez le dommage constate"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-[#1F2937]">Anomalie critique</p>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="critical-issue"
                          checked={hasCriticalIssue === true}
                          onChange={() => setHasCriticalIssue(true)}
                        />
                        Oui
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="critical-issue"
                          checked={hasCriticalIssue === false}
                          onChange={() => setHasCriticalIssue(false)}
                        />
                        Non
                      </label>
                    </div>
                  </div>

                  {hasCriticalIssue ? (
                    <div className="space-y-2">
                      <label htmlFor="critical-issue-description" className="block text-sm font-medium text-[#1F2937]">
                        Description anomalie critique <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="critical-issue-description"
                        value={criticalIssueDescription}
                        onChange={(event) => setCriticalIssueDescription(event.target.value)}
                        rows={3}
                        className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                        placeholder="Decrivez l'anomalie critique"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="inspection-comments" className="block text-sm font-medium text-[#1F2937]">
                  Commentaires
                </label>
                <textarea
                  id="inspection-comments"
                  value={commentsInput}
                  onChange={(event) => setCommentsInput(event.target.value)}
                  rows={4}
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  placeholder="Observations eventuelles"
                />
              </div>

              {localMissingFields.length > 0 ? (
                <Alert
                  variant="warning"
                  title="Cloture impossible pour le moment"
                  message={
                    <ul className="list-disc pl-5">
                      {localMissingFields.length > 0 ? <li>Champs manquants: {localMissingFields.join(', ')}</li> : null}
                    </ul>
                  }
                />
              ) : null}

              <Button
                className="w-full sm:w-auto"
                disabled={!canContinueRequiredFieldsStep}
                onClick={() => {
                  if (!canContinueRequiredFieldsStep) {
                    return
                  }

                  setIsRequiredFieldsStepCompleted(true)
                }}
              >
                {isReturnMode ? 'Continuer vers la confirmation' : 'Continuer'}
              </Button>
            </div>
          </Card>
          ) : null}

          {isRequiredFieldsStepCompleted ? (
          <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">{isReturnMode ? 'Confirmation du retour' : 'Confirmation'}</h2>}>
            <div className="space-y-4">
              <ul className="space-y-2 text-sm text-slate-700">
                {isReturnMode ? (
                  <>
                    <li>4 photos exterieures ✓</li>
                    <li>4 photos interieures ✓</li>
                    <li>Kilometrage retour: {mileageValue ?? '-'}</li>
                    <li>Niveau carburant / energie: {energyLevelValue ?? '-'}%</li>
                    <li>Dommage declare: {hasReturnDamage ? 'Oui' : 'Non'}</li>
                    <li>Anomalie critique: {hasCriticalIssue ? 'Oui' : 'Non'}</li>
                    <li>Commentaire eventuel: {commentsInput.trim().length > 0 ? commentsInput.trim() : 'Aucun'}</li>
                  </>
                ) : (
                  <>
                    <li>4 photos exterieures ✓</li>
                    <li>4 photos interieures ✓</li>
                    <li>dommages declares : {hasDeclaredDamage ? 'Oui' : 'Non'}</li>
                  </>
                )}
              </ul>

              {isReturnMode && localMissingFields.length > 0 ? (
                <Alert
                  variant="warning"
                  title="Confirmation impossible"
                  message={`Veuillez finaliser les champs requis: ${localMissingFields.join(', ')}`}
                />
              ) : null}

              {isReturnMode ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={isReturnConfirmationSubmitting || completeInspectionMutation.isPending}
                    onClick={() => setIsRequiredFieldsStepCompleted(false)}
                  >
                    Retour
                  </Button>

                  <Button
                    className="w-full sm:w-auto"
                    disabled={
                      !canCompleteInspection
                      || isReturnConfirmationSubmitting
                      || completeInspectionMutation.isPending
                    }
                    onClick={() => {
                      if (
                        !inspection
                        || mileageValue === null
                        || energyLevelValue === null
                        || completeInspectionMutation.isPending
                        || isReturnConfirmationSubmitting
                      ) {
                        return
                      }

                      const payload: CompleteInspectionRequest = {
                        mileage: mileageValue,
                        energy_level_percent: energyLevelValue,
                      }

                      if (hasCriticalIssue !== null) {
                        payload.has_critical_issue = hasCriticalIssue
                      }

                      if (hasCriticalIssue) {
                        payload.critical_issue_description = criticalIssueDescription.trim()
                      }

                      if (hasReturnDamage !== null) {
                        payload.comments = buildReturnCommentBlock(
                          commentsInput,
                          hasReturnDamage,
                          returnDamageDescription,
                        )
                      } else if (commentsInput.trim().length > 0) {
                        payload.comments = commentsInput.trim()
                      }

                      setIsReturnConfirmationSubmitting(true)
                      void completeInspectionMutation.mutateAsync(payload)
                    }}
                  >
                    {isReturnConfirmationSubmitting || completeInspectionMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <LoadingSpinner size="sm" aria-label="Confirmation en cours" />
                        Confirmation en cours...
                      </span>
                    ) : (
                      'Confirmer la restitution'
                    )}
                  </Button>
                </div>
              ) : null}

              {!isReturnMode ? (
                <Button
                  className="w-full sm:w-auto"
                  disabled={!canCompleteInspection}
                  onClick={() => {
                    if (!inspection || mileageValue === null || energyLevelValue === null || completeInspectionMutation.isPending) {
                      return
                    }

                    const payload: CompleteInspectionRequest = {
                      mileage: mileageValue,
                      energy_level_percent: energyLevelValue,
                    }

                    if (commentsInput.trim().length > 0) {
                      payload.comments = commentsInput.trim()
                    }

                    void completeInspectionMutation.mutateAsync(payload)
                  }}
                >
                  {completeInspectionMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" aria-label="Cloture en cours" />
                      Cloture en cours...
                    </span>
                  ) : (
                    "Valider l'etat des lieux et demarrer la location"
                  )}
                </Button>
              ) : null}
            </div>
          </Card>
          ) : null}
        </div>
      )}
    </section>
  )
}

export default function DepartureInspectionPage() {
  return <ReservationInspectionWorkflowPage mode="departure" stepView="exterior" />
}

export function DepartureInspectionInteriorPage() {
  return <ReservationInspectionWorkflowPage mode="departure" stepView="interior" />
}
