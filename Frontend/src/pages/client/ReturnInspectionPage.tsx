import { useMemo, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import DamageForm from '../../components/inspections/DamageForm'
import InspectionPhotoSlot from '../../components/inspections/InspectionPhotoSlot'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  completeInspection,
  createReturnInspection,
  lockVehicle,
  uploadInspectionPhoto,
} from '../../services/inspectionService'
import type {
  CompleteInspectionRequest,
  Inspection,
  InspectionDamage,
  InspectionPhoto,
  LockVehicleResponse,
  PhotoType,
} from '../../types/inspection'

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

const MANDATORY_PHOTO_ORDER: PhotoType[] = [
  'AVANT',
  'ARRIERE',
  'COTE_GAUCHE',
  'COTE_DROIT',
  'INTERIEUR',
  'TABLEAU_DE_BORD',
]

const PHOTO_LABELS: Record<PhotoType, string> = {
  AVANT: 'Avant',
  ARRIERE: 'Arriere',
  COTE_GAUCHE: 'Cote gauche',
  COTE_DROIT: 'Cote droit',
  INTERIEUR: 'Interieur',
  TABLEAU_DE_BORD: 'Tableau de bord',
  DOMMAGE: 'Dommage',
  AUTRE: 'Autre',
}

function isPhotoType(value: string): value is PhotoType {
  return ['AVANT', 'ARRIERE', 'COTE_GAUCHE', 'COTE_DROIT', 'INTERIEUR', 'TABLEAU_DE_BORD', 'DOMMAGE', 'AUTRE'].includes(value)
}

function toErrorMessage(error: unknown): string {
  const fallback = 'Une erreur est survenue. Veuillez reessayer.'
  const axiosError = error as AxiosError<ApiErrorPayload>
  const payload = axiosError.response?.data
  if (!payload) return fallback
  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) return payload.detail
  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length > 0) return payload.non_field_errors.join(' ')
  const fieldEntries = Object.entries(payload).filter(
    ([key, value]) => key !== 'detail' && key !== 'non_field_errors' && Array.isArray(value) && value.length > 0,
  )
  if (fieldEntries.length > 0) {
    const [field, messages] = fieldEntries[0]
    return `${field}: ${String((messages as unknown[])[0])}`
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

function buildInitialPhotoState(): Record<PhotoType, PhotoSlotState> {
  return {
    AVANT: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    ARRIERE: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    COTE_GAUCHE: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    COTE_DROIT: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    INTERIEUR: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    TABLEAU_DE_BORD: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    DOMMAGE: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
    AUTRE: { selectedFile: null, previewUrl: null, uploadedPhoto: null, errorMessage: null },
  }
}

function parsePositiveInteger(value: string): number | null {
  if (value.trim().length === 0) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

export default function ReturnInspectionPage() {
  const { id } = useParams<{ id: string }>()
  const reservationId = Number(id)
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0

  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [mandatoryPhotoTypes, setMandatoryPhotoTypes] = useState<PhotoType[]>([])
  const [backendMissingFields, setBackendMissingFields] = useState<string[]>([])
  const [photoState, setPhotoState] = useState<Record<PhotoType, PhotoSlotState>>(buildInitialPhotoState)
  const [damages, setDamages] = useState<InspectionDamage[]>([])

  const [mileageInput, setMileageInput] = useState('')
  const [energyLevelInput, setEnergyLevelInput] = useState('')
  const [commentsInput, setCommentsInput] = useState('')

  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [lockResult, setLockResult] = useState<LockVehicleResponse | null>(null)
  const [lockError, setLockError] = useState<string | null>(null)

  // Gather all successfully uploaded photos for DamageForm photo linking
  const allUploadedPhotos = useMemo(() => {
    return Object.values(photoState)
      .map((slot) => slot.uploadedPhoto)
      .filter((photo): photo is InspectionPhoto => photo !== null)
  }, [photoState])

  const startInspectionMutation = useMutation({
    mutationFn: () => createReturnInspection(reservationId),
    onSuccess: (response) => {
      setInspection(response.inspection)
      setBackendMissingFields(response.missing_fields)
      setMandatoryPhotoTypes(
        MANDATORY_PHOTO_ORDER.filter((photoType) =>
          response.mandatory_photo_types.some((item) => isPhotoType(item) && item === photoType),
        ),
      )
      setGlobalError(null)
      setGlobalSuccess("Etat des lieux de retour initialise. Ajoutez les photos et renseignez les donnees de cloture.")
    },
    onError: (error) => {
      setGlobalSuccess(null)
      setGlobalError(toErrorMessage(error))
    },
  })

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ photoType, file }: { photoType: PhotoType; file: File }) => {
      if (!inspection) throw new Error('Inspection non initialisee.')
      const photo = await uploadInspectionPhoto(inspection.id, { file, photo_type: photoType })
      return { photoType, photo }
    },
    onSuccess: ({ photoType, photo }) => {
      setPhotoState((currentState) => ({
        ...currentState,
        [photoType]: { ...currentState[photoType], uploadedPhoto: photo, errorMessage: null },
      }))
      setGlobalError(null)
    },
    onError: (error, variables) => {
      setPhotoState((currentState) => ({
        ...currentState,
        [variables.photoType]: { ...currentState[variables.photoType], errorMessage: toErrorMessage(error) },
      }))
    },
  })

  const completeInspectionMutation = useMutation({
    mutationFn: (payload: CompleteInspectionRequest) => {
      if (!inspection) throw new Error('Inspection non initialisee.')
      return completeInspection(inspection.id, payload)
    },
    onSuccess: (response) => {
      setInspection(response)
      setGlobalError(null)
      setGlobalSuccess("Etat des lieux de retour termine. Vous pouvez maintenant verrouiller le vehicule.")
      setBackendMissingFields([])
    },
    onError: (error) => {
      setGlobalSuccess(null)
      setGlobalError(toErrorMessage(error))
    },
  })

  const lockMutation = useMutation({
    mutationFn: () => lockVehicle(reservationId),
    onSuccess: (response) => {
      setLockResult(response)
      setLockError(null)
    },
    onError: (error) => {
      setLockResult(null)
      setLockError(toErrorMessage(error))
    },
  })

  const requiredPhotoTypes = mandatoryPhotoTypes

  const completedRequiredPhotos = useMemo(
    () => requiredPhotoTypes.filter((photoType) => photoState[photoType].uploadedPhoto !== null).length,
    [photoState, requiredPhotoTypes],
  )

  const missingRequiredPhotos = useMemo(
    () => requiredPhotoTypes.filter((photoType) => photoState[photoType].uploadedPhoto === null),
    [photoState, requiredPhotoTypes],
  )

  const mileageValue = parsePositiveInteger(mileageInput)
  const energyLevelValue = parsePositiveInteger(energyLevelInput)

  const isMileageValid = mileageValue !== null
  const isEnergyValid = energyLevelValue !== null && energyLevelValue >= 0 && energyLevelValue <= 100

  const localMissingFields = useMemo(() => {
    const missing: string[] = []
    if (!isMileageValid) missing.push('mileage')
    if (!isEnergyValid) missing.push('energy_level_percent')
    return missing
  }, [isEnergyValid, isMileageValid])

  const progress = useMemo(() => {
    const totalItems = requiredPhotoTypes.length + 2
    const completedItems = completedRequiredPhotos + (isMileageValid ? 1 : 0) + (isEnergyValid ? 1 : 0)
    if (totalItems <= 0) return 0
    return Math.round((completedItems / totalItems) * 100)
  }, [completedRequiredPhotos, isEnergyValid, isMileageValid, requiredPhotoTypes.length])

  const canCompleteInspection = Boolean(
    inspection &&
      missingRequiredPhotos.length === 0 &&
      localMissingFields.length === 0 &&
      !completeInspectionMutation.isPending,
  )

  const canLockVehicle = inspection?.status === 'TERMINE' && !lockMutation.isPending && lockResult === null

  if (!isReservationIdValid) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Inspection de retour</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Etat des lieux de retour</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Reservation #{reservationId}. Prenez les photos obligatoires, signalez les dommages eventuels puis renseignez le kilometrage et l'energie.
          </p>
        </div>
        <Link to={`/client/reservations/${reservationId}`}>
          <Button variant="secondary">Retour a la reservation</Button>
        </Link>
      </div>

      {globalSuccess ? <Alert className="mb-4" variant="success" title="Succes" message={globalSuccess} /> : null}
      {globalError ? <Alert className="mb-4" variant="danger" title="Action impossible" message={globalError} /> : null}

      {!inspection ? (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Lancez l'inspection pour obtenir les photos obligatoires et l'identifiant d'etat des lieux de retour.
            </p>
            <Button
              onClick={() => void startInspectionMutation.mutate()}
              disabled={startInspectionMutation.isPending}
            >
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
        <div className="space-y-6">
          {/* Inspection header */}
          <Card
            header={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inspection</p>
                  <p className="text-base font-semibold text-[#0F172A]">#{inspection.id}</p>
                </div>
                <StatusBadge
                  variant={inspectionStatusToBadge(inspection.status).variant}
                  label={inspectionStatusToBadge(inspection.status).label}
                />
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#1F2937]">Progression</p>
                <p className="text-sm font-semibold text-[#0F172A]">{progress}%</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[#E5E7EB]">
                <div
                  className="h-full rounded-full bg-[#2563EB] transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
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

          {/* Mandatory photos */}
          <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Photos obligatoires</h2>}>
            {requiredPhotoTypes.length === 0 ? (
              <Alert
                variant="warning"
                title="Aucune photo obligatoire"
                message="Le backend n'a pas retourne de photos obligatoires pour cette inspection."
              />
            ) : (
              <>
                <p className="mb-4 text-sm text-slate-600">
                  {completedRequiredPhotos}/{requiredPhotoTypes.length} photo(s) obligatoire(s) envoyee(s).
                </p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {requiredPhotoTypes.map((photoType) => {
                    const slot = photoState[photoType]
                    return (
                      <InspectionPhotoSlot
                        key={photoType}
                        photoType={photoType}
                        label={PHOTO_LABELS[photoType]}
                        previewUrl={slot.previewUrl}
                        uploadedUrl={slot.uploadedPhoto?.file ?? null}
                        isUploading={
                          uploadPhotoMutation.isPending &&
                          uploadPhotoMutation.variables?.photoType === photoType
                        }
                        errorMessage={slot.errorMessage}
                        hasSelectedFile={slot.selectedFile !== null}
                        onFileChange={(file) => {
                          setPhotoState((currentState) => {
                            const existingPreviewUrl = currentState[photoType].previewUrl
                            if (existingPreviewUrl) URL.revokeObjectURL(existingPreviewUrl)
                            return {
                              ...currentState,
                              [photoType]: {
                                ...currentState[photoType],
                                selectedFile: file,
                                previewUrl: file ? URL.createObjectURL(file) : null,
                                errorMessage: null,
                              },
                            }
                          })
                        }}
                        onUpload={() => {
                          const selectedFile = photoState[photoType].selectedFile
                          if (!selectedFile) {
                            setPhotoState((currentState) => ({
                              ...currentState,
                              [photoType]: {
                                ...currentState[photoType],
                                errorMessage: 'Selectionnez un fichier avant envoi.',
                              },
                            }))
                            return
                          }
                          void uploadPhotoMutation.mutateAsync({ photoType, file: selectedFile })
                        }}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </Card>

          {/* Damage reporting */}
          <DamageForm
            inspectionId={inspection.id}
            uploadedPhotos={allUploadedPhotos}
            damages={damages}
            onDamageAdded={(damage) => setDamages((prev) => [...prev, damage])}
          />

          {/* Completion form */}
          <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Cloture de l'etat des lieux de retour</h2>}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  label="Kilometrage"
                  required
                  value={mileageInput}
                  onChange={(event) => setMileageInput(event.target.value)}
                  error={
                    mileageInput.length > 0 && !isMileageValid
                      ? 'Entrez un kilometrage entier superieur ou egal a 0.'
                      : undefined
                  }
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  label="Niveau d'energie (%)"
                  required
                  value={energyLevelInput}
                  onChange={(event) => setEnergyLevelInput(event.target.value)}
                  error={
                    energyLevelInput.length > 0 && !isEnergyValid
                      ? 'Entrez une valeur entre 0 et 100.'
                      : undefined
                  }
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="return-inspection-comments"
                  className="block text-sm font-medium text-[#1F2937]"
                >
                  Commentaires
                </label>
                <textarea
                  id="return-inspection-comments"
                  value={commentsInput}
                  onChange={(event) => setCommentsInput(event.target.value)}
                  rows={4}
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  placeholder="Observations eventuelles"
                />
              </div>

              {missingRequiredPhotos.length > 0 || localMissingFields.length > 0 ? (
                <Alert
                  variant="warning"
                  title="Cloture impossible pour le moment"
                  message={
                    <ul className="list-disc pl-5">
                      {missingRequiredPhotos.length > 0 ? (
                        <li>
                          Photos manquantes:{' '}
                          {missingRequiredPhotos.map((item) => PHOTO_LABELS[item]).join(', ')}
                        </li>
                      ) : null}
                      {localMissingFields.length > 0 ? (
                        <li>Champs manquants: {localMissingFields.join(', ')}</li>
                      ) : null}
                    </ul>
                  }
                />
              ) : null}

              <Button
                className="w-full sm:w-auto"
                disabled={!canCompleteInspection}
                onClick={() => {
                  if (!inspection || mileageValue === null || energyLevelValue === null) return
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
                  "Terminer l'etat des lieux de retour"
                )}
              </Button>
            </div>
          </Card>

          {/* Lock vehicle — shown only after inspection is complete */}
          {inspection.status === 'TERMINE' ? (
            <Card>
              <div className="space-y-4">
                {lockResult ? (
                  /* Lock success — final state */
                  <div className="space-y-4">
                    <Alert variant="success" title="Vehicule verrouille" message={lockResult.message} />
                    <div className="rounded-2xl border border-[#D1FAE5] bg-[#ECFDF5] p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge variant="success" label="Acces ferme" />
                        <p className="text-sm text-[#065F46]">
                          Etat: <span className="font-semibold">{lockResult.state}</span>
                        </p>
                      </div>
                      {lockResult.timestamp ? (
                        <p className="text-sm text-[#065F46]">
                          Horodatage: {new Date(lockResult.timestamp).toLocaleString('fr-FR')}
                        </p>
                      ) : null}
                    </div>

                    <Alert
                      variant="info"
                      title="Retour termine"
                      message="Votre retour est termine. Le vehicule est maintenant en cours de controle."
                    />

                    <Link to={`/client/reservations/${reservationId}`}>
                      <Button variant="secondary" className="w-full sm:w-auto">
                        Voir ma reservation
                      </Button>
                    </Link>
                  </div>
                ) : (
                  /* Lock pending state */
                  <div className="space-y-4">
                    <p className="text-sm text-slate-700">
                      L'etat des lieux de retour est termine. Verrouillez le vehicule pour finaliser votre retour.
                    </p>
                    {lockError ? (
                      <Alert variant="danger" title="Verrouillage impossible" message={lockError} />
                    ) : null}
                    <Button
                      disabled={!canLockVehicle}
                      onClick={() => {
                        if (lockMutation.isPending) return
                        setLockError(null)
                        void lockMutation.mutateAsync()
                      }}
                    >
                      {lockMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <LoadingSpinner size="sm" aria-label="Verrouillage en cours" />
                          Verrouillage en cours...
                        </span>
                      ) : (
                        'Verrouiller le vehicule'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </section>
  )
}
