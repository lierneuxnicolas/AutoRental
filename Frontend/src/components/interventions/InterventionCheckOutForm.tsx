import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import InspectionPhotoSlot from '../inspections/InspectionPhotoSlot'
import InspectionVehicleStateCard from '../inspections/InspectionVehicleStateCard'
import { validateInspectionVehicleState, type WorkflowAnomalySeverity } from '../inspections/inspectionVehicleState'
import StandardInspectionPhotoGrid from '../inspections/StandardInspectionPhotoGrid'
import { STANDARD_INSPECTION_PHOTO_SLOTS } from '../inspections/standardInspectionPhotos'
import type { WorkerInterventionCheckOutValues } from '../../types/workerIntervention'

interface InterventionCheckOutFormProps {
  initialMileage?: number | null
  initialEnergyLevel?: number | null
  embedded?: boolean
  disabled?: boolean
  isSubmitting?: boolean
  onSubmit: (values: WorkerInterventionCheckOutValues) => void
}

function buildEmptyPhotoState() {
  return [...STANDARD_INSPECTION_PHOTO_SLOTS, { key: 'anomaly_1' }, { key: 'anomaly_2' }].reduce<Record<string, { file: File | null; previewUrl: string | null }>>((state, slot) => {
    state[slot.key] = { file: null, previewUrl: null }
    return state
  }, {})
}

export default function InterventionCheckOutForm({ initialMileage, initialEnergyLevel, embedded = false, disabled = false, isSubmitting = false, onSubmit }: InterventionCheckOutFormProps) {
  const [finalMileage, setFinalMileage] = useState(initialMileage !== null && initialMileage !== undefined ? String(initialMileage) : '')
  const [finalEnergyLevel, setFinalEnergyLevel] = useState(initialEnergyLevel !== null && initialEnergyLevel !== undefined ? String(initialEnergyLevel) : '')
  const [anomalyPresent, setAnomalyPresent] = useState<boolean | null>(null)
  const [anomalyDescription, setAnomalyDescription] = useState('')
  const [anomalySeverity, setAnomalySeverity] = useState<WorkflowAnomalySeverity>('')
  const [photoState, setPhotoState] = useState(buildEmptyPhotoState)
  const [localError, setLocalError] = useState<string | null>(null)
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
    const validation = validateInspectionVehicleState({ mileage: finalMileage, energy: finalEnergyLevel, anomalyPresent, anomalyDescription, anomalySeverity })
    if (validation.error) {
      setLocalError(validation.error)
      return
    }
    if (initialMileage !== null && initialMileage !== undefined && validation.data.mileage < initialMileage) {
      setLocalError('Le kilométrage final doit être supérieur ou égal au kilométrage initial.')
      return
    }
    if (standardPhotos.length !== STANDARD_INSPECTION_PHOTO_SLOTS.length) {
      setLocalError('Les 8 photos standard sont obligatoires.')
      return
    }
    setLocalError(null)
    onSubmit({
      final_mileage: validation.data.mileage,
      final_energy_level_percent: validation.data.energy,
      anomaly_present: validation.data.anomalyPresent,
      anomaly_description: validation.data.anomalyDescription,
      anomaly_severity: validation.data.anomalySeverity,
      photos: [...standardPhotos, ...anomalyPhotos],
    })
  }

  const content = (
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {localError ? <Alert variant="danger" title="Check-out incomplet" message={localError} /> : null}

        <InspectionVehicleStateCard
          title="État final du véhicule"
          mileageLabel="Kilométrage final"
          mileage={finalMileage}
          onMileageChange={setFinalMileage}
          energy={finalEnergyLevel}
          onEnergyChange={setFinalEnergyLevel}
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
                <InspectionPhotoSlot key={position} photoType="DOMMAGE" label={`Photo de l’anomalie ${position}`} previewUrl={photoState[`anomaly_${position}`]?.previewUrl ?? null} uploadedUrl={photoState[`anomaly_${position}`]?.previewUrl ?? null} isUploading={false} errorMessage={null} onFileChange={(file) => setSlotFile(`anomaly_${position}`, file)} />
              ))}
            </div>
          )}
        />

        <StandardInspectionPhotoGrid
          title="Photos de check-out"
          photoState={photoState}
          disabled={disabled || isSubmitting}
          onFileChange={setSlotFile}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={disabled || isSubmitting}>{isSubmitting ? <span className="flex items-center gap-2"><LoadingSpinner size="sm" aria-label="Clôture" />Clôture...</span> : "Terminer l’intervention"}</Button>
        </div>
      </form>
  )

  if (embedded) {
    return content
  }

  return <Card className="border-slate-200" header={<p className="text-sm font-semibold text-[#2563EB]">Check-out</p>}>{content}</Card>
}
