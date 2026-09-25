import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import InspectionPhotoSlot from '../inspections/InspectionPhotoSlot'
import InspectionVehicleStateCard from '../inspections/InspectionVehicleStateCard'
import { validateInspectionVehicleState, type WorkflowAnomalySeverity } from '../inspections/inspectionVehicleState'
import StandardInspectionPhotoGrid from '../inspections/StandardInspectionPhotoGrid'
import { STANDARD_INSPECTION_PHOTO_SLOTS } from '../inspections/standardInspectionPhotos'
import type { WorkerInterventionCheckInValues, WorkerInterventionInterruptValues } from '../../types/workerIntervention'

interface InterventionCheckInFormProps {
  initialMileage?: number | null
  embedded?: boolean
  disabled?: boolean
  isSubmitting?: boolean
  onSubmit: (values: WorkerInterventionCheckInValues) => void
  onInterrupt?: (values: WorkerInterventionInterruptValues) => void
}

function buildEmptyPhotoState() {
  return [...STANDARD_INSPECTION_PHOTO_SLOTS, { key: 'anomaly_1' }, { key: 'anomaly_2' }].reduce<Record<string, { file: File | null; previewUrl: string | null }>>((state, slot) => {
    state[slot.key] = { file: null, previewUrl: null }
    return state
  }, {})
}

export default function InterventionCheckInForm({
  initialMileage,
  embedded = false,
  disabled = false,
  isSubmitting = false,
  onSubmit,
  onInterrupt,
}: InterventionCheckInFormProps) {
  const [mileage, setMileage] = useState(initialMileage !== null && initialMileage !== undefined ? String(initialMileage) : '')
  const [energyLevel, setEnergyLevel] = useState('')
  const [anomalyPresent, setAnomalyPresent] = useState<boolean | null>(null)
  const [anomalyDescription, setAnomalyDescription] = useState('')
  const [anomalySeverity, setAnomalySeverity] = useState<WorkflowAnomalySeverity>('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [photoState, setPhotoState] = useState(buildEmptyPhotoState)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isInterruptOpen, setIsInterruptOpen] = useState(false)
  const [interruptReasonType, setInterruptReasonType] = useState<WorkerInterventionInterruptValues['reason_type']>('vehicule_inaccessible')
  const [interruptReasonDetail, setInterruptReasonDetail] = useState('')
  const [interruptPhoto, setInterruptPhoto] = useState<File | null>(null)
  const previewUrlsRef = useRef(new Set<string>())

  useEffect(() => () => {
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl))
  }, [])

  const standardPhotos = useMemo(
    () => STANDARD_INSPECTION_PHOTO_SLOTS.map((slot) => photoState[slot.key].file).filter((file): file is File => file !== null),
    [photoState],
  )
  const anomalyPhotos = useMemo(
    () => [photoState.anomaly_1.file, photoState.anomaly_2.file].filter((file): file is File => file !== null),
    [photoState],
  )

  const setSlotFile = (slotKey: string, file: File | null) => {
    setPhotoState((current) => {
      const currentSlot = current[slotKey]
      if (currentSlot?.previewUrl) {
        URL.revokeObjectURL(currentSlot.previewUrl)
        previewUrlsRef.current.delete(currentSlot.previewUrl)
      }

      const previewUrl = file ? URL.createObjectURL(file) : null
      if (previewUrl) previewUrlsRef.current.add(previewUrl)

      return {
        ...current,
        [slotKey]: {
          file,
          previewUrl,
        },
      }
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (disabled || isSubmitting) {
      return
    }

    const validation = validateInspectionVehicleState({ mileage, energy: energyLevel, anomalyPresent, anomalyDescription, anomalySeverity })
    if (validation.error) {
      setLocalError(validation.error)
      return
    }
    if (standardPhotos.length !== STANDARD_INSPECTION_PHOTO_SLOTS.length) {
      setLocalError('Les 8 photos standard sont obligatoires.')
      return
    }

    setLocalError(null)
    onSubmit({
      mileage: validation.data.mileage,
      energy_level_percent: validation.data.energy,
      anomaly_present: validation.data.anomalyPresent,
      anomaly_description: validation.data.anomalyDescription,
      anomaly_severity: validation.data.anomalySeverity,
      photos: [...standardPhotos, ...anomalyPhotos],
    })
  }

  const content = (
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {localError ? <Alert variant="danger" title="Check-in incomplet" message={localError} /> : null}

        {!isUnlocked ? (
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5">
            <p className="text-sm font-semibold text-[#1F2937]">Déverrouillage du véhicule</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => {
                setIsUnlocked(true)
              }}>Déverrouiller le véhicule</Button>
            </div>
          </div>
        ) : null}

        {onInterrupt ? (
          <div className="border-t border-[#E5E7EB] pt-3">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 transition hover:text-red-600"
              onClick={() => setIsInterruptOpen((current) => !current)}
            >
              Annuler l’intervention
            </button>
            {isInterruptOpen ? (
              <div className="mt-3 grid gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[#1F2937]">Motif obligatoire</label>
                  <select value={interruptReasonType} onChange={(event) => setInterruptReasonType(event.target.value as WorkerInterventionInterruptValues['reason_type'])} className="block h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937]">
                    <option value="vehicule_accidente">Véhicule accidenté</option>
                    <option value="probleme_securite">Problème de sécurité</option>
                    <option value="vehicule_inaccessible">Véhicule inaccessible</option>
                    <option value="vehicule_non_deplacable">Véhicule non déplaçable</option>
                    <option value="mauvais_vehicule">Mauvais véhicule</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <Input label="Précision" value={interruptReasonDetail} onChange={(event) => setInterruptReasonDetail(event.target.value)} />
                <input type="file" accept="image/*" onChange={(event) => setInterruptPhoto(event.target.files?.[0] ?? null)} className="text-sm" />
                <div className="flex justify-end md:col-span-2">
                  <Button type="button" variant="danger" onClick={() => onInterrupt({ reason_type: interruptReasonType, reason_detail: interruptReasonDetail.trim() || undefined, photo: interruptPhoto })}>
                    Confirmer l’annulation
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {isUnlocked ? (
          <>
          <InspectionVehicleStateCard
            mileageLabel="Kilométrage actuel"
            mileage={mileage}
            onMileageChange={setMileage}
            energy={energyLevel}
            onEnergyChange={setEnergyLevel}
            anomalyPresent={anomalyPresent}
            onAnomalyPresentChange={setAnomalyPresent}
            anomalyDescription={anomalyDescription}
            onAnomalyDescriptionChange={setAnomalyDescription}
            anomalySeverity={anomalySeverity}
            onAnomalySeverityChange={setAnomalySeverity}
            disabled={disabled || isSubmitting}
            anomalyPhotos={(
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((position) => (
                  <InspectionPhotoSlot
                    key={position}
                    photoType="DOMMAGE"
                    label={`Photo de l’anomalie ${position}`}
                    previewUrl={photoState[`anomaly_${position}`]?.previewUrl ?? null}
                    uploadedUrl={photoState[`anomaly_${position}`]?.previewUrl ?? null}
                    isUploading={false}
                    errorMessage={null}
                    onFileChange={(file) => setSlotFile(`anomaly_${position}`, file)}
                  />
                ))}
              </div>
            )}
          />

          <StandardInspectionPhotoGrid
            title="Photos de check-in"
            photoState={photoState}
            disabled={disabled || isSubmitting}
            onFileChange={setSlotFile}
          />
          </>
        ) : null}

        {isUnlocked ? (
          <div className="flex justify-end">
          <Button type="submit" disabled={disabled || isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" aria-label="Check-in" />
                Check-in en cours...
              </span>
            ) : (
              'Confirmer le check-in'
            )}
          </Button>
          </div>
        ) : null}
      </form>
  )

  if (embedded) {
    return content
  }

  return <Card className="border-slate-200" header={<p className="text-sm font-semibold text-[#2563EB]">Check-in</p>}>{content}</Card>
}
