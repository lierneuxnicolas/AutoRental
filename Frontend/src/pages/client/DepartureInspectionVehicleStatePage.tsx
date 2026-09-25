import { useMemo, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import InspectionVehicleStateCard from '../../components/inspections/InspectionVehicleStateCard'
import { validateInspectionVehicleState } from '../../components/inspections/inspectionVehicleState'
import ReservationProgressBanner from '../../components/reservations/ReservationProgressBanner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { saveDepartureVehicleState, uploadInspectionPhoto } from '../../services/inspectionService'
import { cancelReservationForCriticalCheckinAnomaly, getReservationById } from '../../services/reservationService'
import type { DepartureVehicleStateRequest, Severity } from '../../types/inspection'
import { resolveMediaUrl } from '../../utils/media'

type ApiErrorPayload = {
  code?: string
  detail?: string
  message?: string
  non_field_errors?: string[]
  [key: string]: unknown
}

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

const buildVehicleStateSummaryStorageKey = (reservationId: number) => `departure_vehicle_state_summary_${reservationId}`

type DepartureVehicleStateSummary = {
  anomaly_present: boolean
  anomaly_severity: Severity | null
  anomaly_description: string
  photo_ids: number[]
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

function revokePreviewUrl(previewUrl: string | null) {
  if (previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
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

  const fieldEntries = Object.entries(payload).filter(
    ([key, value]) => key !== 'detail' && key !== 'message' && key !== 'non_field_errors' && Array.isArray(value) && value.length > 0,
  )

  if (fieldEntries.length > 0) {
    const [field, messages] = fieldEntries[0]
    return `${field}: ${String((messages as unknown[])[0])}`
  }

  return fallback
}

function isCriticalIssue(inspection: { has_critical_issue?: boolean } | null | undefined): boolean {
  return Boolean(inspection?.has_critical_issue)
}

export default function DepartureInspectionVehicleStatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const reservationQuery = useQuery({
    queryKey: ['client-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isReservationIdValid,
  })

  const inspection = reservationQuery.data?.departure_inspection ?? null

  const [mileageInput, setMileageInput] = useState('')
  const [energyInput, setEnergyInput] = useState('')
  const [anomalyPresent, setAnomalyPresent] = useState<boolean | null>(null)
  const [anomalyDescription, setAnomalyDescription] = useState('')
  const [anomalySeverity, setAnomalySeverity] = useState<Severity | ''>('')
  const [anomalyPhotoState, setAnomalyPhotoState] = useState<Record<AnomalyPhotoSlotKey, AnomalyPhotoSlotState>>(
    buildInitialAnomalyPhotoState,
  )
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isCriticalSaved, setIsCriticalSaved] = useState(false)
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const anomalyPhotoInputRefs = useRef<Record<AnomalyPhotoSlotKey, HTMLInputElement | null>>({
    slot1: null,
    slot2: null,
  })

  const progressSteps = useMemo(
    () => [
      { order: 1, label: 'Deverrouillage', status: 'done' as const },
      { order: 2, label: 'Exterieur', status: 'done' as const },
      { order: 3, label: 'Interieur', status: 'done' as const },
      { order: 4, label: 'Etat du vehicule', status: 'active' as const },
      { order: 5, label: 'Confirmation', status: 'future' as const },
    ],
    [],
  )

  const parsedMileage = useMemo(() => {
    if (mileageInput.trim().length === 0) {
      return null
    }
    const parsed = Number(mileageInput)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
  }, [mileageInput])

  const parsedEnergy = useMemo(() => {
    if (energyInput.trim().length === 0) {
      return null
    }
    const parsed = Number(energyInput)
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null
  }, [energyInput])

  const canSubmit = useMemo(() => {
    if (!inspection) {
      return false
    }
    return validateInspectionVehicleState({
      mileage: mileageInput,
      energy: energyInput,
      anomalyPresent,
      anomalyDescription,
      anomalySeverity: anomalySeverity === 'ACCEPTABLE' || anomalySeverity === 'GRAVE' ? anomalySeverity : '',
    }).error === null
  }, [anomalyDescription, anomalyPresent, anomalySeverity, energyInput, inspection, mileageInput])

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

      const resolvedPreviewUrl = resolveMediaUrl(uploaded.file)

      setAnomalyPhotoState((current) => ({
        ...current,
        [slotKey]: {
          photoId: uploaded.id,
          previewUrl: resolvedPreviewUrl,
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
      const critical = isCriticalIssue(response.inspection)
      setIsCriticalSaved(critical)

      const summaryPayload: DepartureVehicleStateSummary = {
        anomaly_present: Boolean(response.damage),
        anomaly_severity: response.damage?.severity ?? null,
        anomaly_description: response.damage?.description ?? '',
        photo_ids: response.damage?.photo_ids ?? [],
      }
      sessionStorage.setItem(
        buildVehicleStateSummaryStorageKey(reservationId),
        JSON.stringify(summaryPayload),
      )

      await reservationQuery.refetch()

      if (critical) {
        return
      }

      navigate(`/client/reservations/${reservationId}/departure-inspection/confirmation`, {
        state: {
          vehicleStateSummary: summaryPayload,
        },
      })
    },
    onError: (error) => {
      setGlobalError(toErrorMessage(error))
    },
  })

  const cancelForCriticalAnomalyMutation = useMutation({
    mutationFn: () => cancelReservationForCriticalCheckinAnomaly(reservationId),
    onSuccess: () => {
      setCancelError(null)
      navigate('/client/reservations')
    },
    onError: (error) => {
      setCancelError(toErrorMessage(error))
    },
  })

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  const reservation = reservationQuery.data
  const anomalyPhotoFields = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[#1F2937]">Photos de l'anomalie (optionnel)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ANOMALY_PHOTO_SLOTS.map((slot) => {
          const slotState = anomalyPhotoState[slot.key]
          return (
            <Card key={slot.key} className="h-full">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#1F2937]">{slot.label}</p>
                <input
                  ref={(input) => { anomalyPhotoInputRefs.current[slot.key] = input }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={slotState.isUploading}
                  className="hidden"
                  onChange={(event) => {
                    const selectedFile = event.target.files?.[0] ?? null
                    if (selectedFile) void uploadAnomalyPhoto(slot.key, selectedFile)
                  }}
                />
                {slotState.previewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]">
                    <img src={slotState.previewUrl} alt={slot.label} className="h-44 w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-sm text-slate-500">Emplacement vide</div>
                )}
                {slotState.errorMessage ? <Alert variant="danger" message={slotState.errorMessage} /> : null}
                <div className="flex flex-col gap-2">
                  <Button className="w-full" disabled={slotState.isUploading} onClick={() => anomalyPhotoInputRefs.current[slot.key]?.click()}>
                    {slotState.isUploading ? 'Envoi en cours...' : slotState.photoId ? 'Remplacer la photo' : 'Ajouter une photo'}
                  </Button>
                  {slotState.photoId ? <Button variant="secondary" className="w-full" onClick={() => removeAnomalyPhoto(slot.key)}>Supprimer la photo</Button> : null}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative left-1/2 mb-6 w-[min(100vw-2rem,72rem)] -translate-x-1/2 sm:w-[min(100vw-3rem,72rem)] lg:w-[min(100vw-4rem,72rem)]">
        <ReservationProgressBanner className="mb-6 sm:mb-8" steps={progressSteps} />
      </div>

      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}

      {!inspection ? (
        <Card>
          <Alert
            variant="warning"
            title="Inspection de depart introuvable"
            message="Commencez d'abord l'etape Exterieur puis Interieur pour conserver la meme inspection en cours."
          />
          <div className="mt-4">
            <Link to={`/client/reservations/${reservationId}/departure-inspection`}>
              <Button>Aller a l'etape Exterieur</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <InspectionVehicleStateCard
            mileageLabel="Kilométrage actuel"
            mileage={mileageInput}
            onMileageChange={setMileageInput}
            energy={energyInput}
            onEnergyChange={setEnergyInput}
            anomalyPresent={anomalyPresent}
            onAnomalyPresentChange={(value) => {
              setAnomalyPresent(value)
              if (!value) {
                setAnomalyDescription('')
                setAnomalySeverity('')
                setAnomalyPhotoState((current) => {
                  Object.values(current).forEach((slot) => revokePreviewUrl(slot.previewUrl))
                  return buildInitialAnomalyPhotoState()
                })
              }
            }}
            anomalyDescription={anomalyDescription}
            onAnomalyDescriptionChange={setAnomalyDescription}
            anomalySeverity={anomalySeverity === 'ACCEPTABLE' || anomalySeverity === 'GRAVE' ? anomalySeverity : ''}
            onAnomalySeverityChange={(value) => setAnomalySeverity(value as Severity | '')}
            anomalyPhotos={anomalyPhotoFields}
          />

            {isCriticalIssue(inspection) || isCriticalSaved ? (
              <div className="space-y-4">
                <Alert
                  variant="danger"
                  title="Depart bloque"
                  message="L'anomalie signalée empêche l'utilisation du véhicule."
                />

                {cancelError ? <Alert variant="danger" title="Annulation impossible" message={cancelError} /> : null}

                {showCancelConfirmation ? (
                  <Card>
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-[#1F2937]">
                        Voulez-vous annuler cette réservation et effectuer une nouvelle réservation ?
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="danger"
                          disabled={cancelForCriticalAnomalyMutation.isPending}
                          onClick={() => {
                            setCancelError(null)
                            void cancelForCriticalAnomalyMutation.mutateAsync()
                          }}
                        >
                          {cancelForCriticalAnomalyMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <LoadingSpinner size="sm" aria-label="Annulation en cours" />
                              Annulation...
                            </span>
                          ) : (
                            'Annuler la réservation'
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={cancelForCriticalAnomalyMutation.isPending}
                          onClick={() => {
                            setShowCancelConfirmation(false)
                            setCancelError(null)
                          }}
                        >
                          Retour
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <div className="flex justify-center">
                    <Button variant="danger" onClick={() => setShowCancelConfirmation(true)}>
                      Annuler la réservation
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {isCriticalIssue(inspection) || isCriticalSaved ? null : (
            <div className="flex justify-center pt-2">
              <Button
                className="w-full sm:w-auto"
                disabled={!canSubmit || saveStateMutation.isPending}
                onClick={() => {
                  if (!inspection || !canSubmit || parsedMileage === null || parsedEnergy === null || anomalyPresent === null) {
                    return
                  }

                  const payload: DepartureVehicleStateRequest = {
                    mileage: parsedMileage,
                    energy_level_percent: parsedEnergy,
                    anomaly_present: anomalyPresent,
                  }

                  if (anomalyPresent) {
                    payload.anomaly_description = anomalyDescription.trim()
                    payload.anomaly_severity = anomalySeverity as Severity
                    payload.photo_ids = uploadedAnomalyPhotoIds
                  } else {
                    payload.photo_ids = []
                  }

                  setGlobalError(null)
                  void saveStateMutation.mutateAsync(payload)
                }}
              >
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
            )}
        </div>
      )}

      {reservationQuery.isLoading ? (
        <div className="mt-4">
          <LoadingSpinner aria-label="Chargement reservation" />
        </div>
      ) : null}

      {reservation ? null : reservationQuery.isError ? (
        <Alert className="mt-4" variant="danger" title="Chargement impossible" message="Impossible de charger la reservation." />
      ) : null}
    </section>
  )
}
