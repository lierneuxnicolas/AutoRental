import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import InspectionPhotoSlot from '../inspections/InspectionPhotoSlot'
import type { WorkerInterventionCheckOutValues, WorkerInterventionRole } from '../../types/workerIntervention'
import type { PhotoType } from '../../types/inspection'

interface InterventionCheckOutFormProps {
  role: WorkerInterventionRole
  initialMileage?: number | null
  embedded?: boolean
  disabled?: boolean
  isSubmitting?: boolean
  onSubmit: (values: WorkerInterventionCheckOutValues) => void
}

type WorkerPhotoSlot = {
  key: string
  label: string
  photoType: PhotoType
}

const exteriorSlots: WorkerPhotoSlot[] = [
  { key: 'front_left', label: 'Avant gauche', photoType: 'AVANT' },
  { key: 'front_right', label: 'Avant droit', photoType: 'COTE_DROIT' },
  { key: 'rear_left', label: 'Arrière gauche', photoType: 'COTE_GAUCHE' },
  { key: 'rear_right', label: 'Arrière droit', photoType: 'ARRIERE' },
]

const interiorSlots: WorkerPhotoSlot[] = [
  { key: 'dashboard', label: 'Tableau de bord', photoType: 'TABLEAU_DE_BORD' },
  { key: 'front_seats', label: 'Sièges avant', photoType: 'INTERIEUR' },
  { key: 'rear_seats', label: 'Sièges arrière', photoType: 'INTERIEUR' },
  { key: 'trunk', label: 'Coffre', photoType: 'AUTRE' },
]

function buildEmptyPhotoState() {
  return [...exteriorSlots, ...interiorSlots].reduce<Record<string, { file: File | null; previewUrl: string | null }>>((state, slot) => {
    state[slot.key] = { file: null, previewUrl: null }
    return state
  }, {})
}

export default function InterventionCheckOutForm({ role, initialMileage, embedded = false, disabled = false, isSubmitting = false, onSubmit }: InterventionCheckOutFormProps) {
  const [finalMileage, setFinalMileage] = useState(initialMileage !== null && initialMileage !== undefined ? String(initialMileage) : '')
  const [finalObservation, setFinalObservation] = useState('')
  const [finalVehicleState, setFinalVehicleState] = useState('')
  const [conclusions, setConclusions] = useState('')
  const [vehicleClean, setVehicleClean] = useState(true)
  const [newInterventionNeeded, setNewInterventionNeeded] = useState(false)
  const [finalComment, setFinalComment] = useState('')
  const [photoState, setPhotoState] = useState(buildEmptyPhotoState)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      Object.values(photoState).forEach((slot) => {
        if (slot.previewUrl) {
          URL.revokeObjectURL(slot.previewUrl)
        }
      })
    }
  }, [photoState])

  const selectedPhotos = useMemo(
    () => Object.values(photoState).map((slot) => slot.file).filter((file): file is File => file !== null),
    [photoState],
  )

  const setSlotFile = (slotKey: string, file: File | null) => {
    setPhotoState((current) => {
      const currentSlot = current[slotKey]
      if (currentSlot?.previewUrl) {
        URL.revokeObjectURL(currentSlot.previewUrl)
      }
      return {
        ...current,
        [slotKey]: {
          file,
          previewUrl: file ? URL.createObjectURL(file) : null,
        },
      }
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedMileage = Number(finalMileage)
    if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
      setLocalError('Le kilométrage final doit être valide.')
      return
    }
    if (initialMileage !== null && initialMileage !== undefined && parsedMileage < initialMileage) {
      setLocalError('Le kilométrage final doit être supérieur ou égal au kilométrage initial.')
      return
    }
    if (role === 'mechanic' && !finalObservation.trim()) {
      setLocalError('L’observation finale est obligatoire.')
      return
    }
    if (role === 'mechanic' && !finalVehicleState.trim()) {
      setLocalError('L’état général du véhicule est obligatoire.')
      return
    }
    if (role === 'cleaning' && !finalVehicleState.trim()) {
      setLocalError('L’état final du véhicule est obligatoire.')
      return
    }
    if (role === 'cleaning' && !conclusions.trim()) {
      setLocalError('Les conclusions sont obligatoires.')
      return
    }
    if (role === 'cleaning' && !vehicleClean && !finalComment.trim()) {
      setLocalError('Un commentaire est obligatoire si le véhicule n’est pas propre.')
      return
    }
    if (selectedPhotos.length === 0) {
      setLocalError('Ajoutez au moins une photo finale.')
      return
    }
    setLocalError(null)
    const mechanicObservation = finalObservation.trim()
    onSubmit({
      final_mileage: parsedMileage,
      final_vehicle_state: role === 'mechanic' ? finalVehicleState.trim() : finalVehicleState.trim(),
      conclusions: role === 'mechanic' ? mechanicObservation : conclusions.trim(),
      vehicle_operational: undefined,
      vehicle_clean: role === 'cleaning' ? vehicleClean : undefined,
      new_intervention_needed: role === 'cleaning' ? newInterventionNeeded : undefined,
      final_comment: role === 'mechanic' ? mechanicObservation : finalComment.trim() || undefined,
      photos: selectedPhotos,
    })
  }

  const content = (
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {localError ? <Alert variant="danger" title="Check-out incomplet" message={localError} /> : null}

        {role === 'mechanic' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Kilométrage final" inputMode="numeric" value={finalMileage} onChange={(event) => setFinalMileage(event.target.value)} disabled={disabled || isSubmitting} />
            <Input label="État général du véhicule" value={finalVehicleState} onChange={(event) => setFinalVehicleState(event.target.value)} disabled={disabled || isSubmitting} />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Kilométrage final" inputMode="numeric" value={finalMileage} onChange={(event) => setFinalMileage(event.target.value)} disabled={disabled || isSubmitting} />
            <Input label="État final du véhicule" value={finalVehicleState} onChange={(event) => setFinalVehicleState(event.target.value)} disabled={disabled || isSubmitting} />
            <label className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#1F2937]">
              <input type="checkbox" checked={vehicleClean} onChange={(event) => setVehicleClean(event.target.checked)} disabled={disabled || isSubmitting} />
              Véhicule propre
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#1F2937]">
              <input type="checkbox" checked={newInterventionNeeded} onChange={(event) => setNewInterventionNeeded(event.target.checked)} disabled={disabled || isSubmitting} />
              Nouvelle intervention nécessaire
            </label>
          </div>
        )}
        {role === 'mechanic' ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]">Observations finales</label>
            <textarea rows={4} value={finalObservation} onChange={(event) => setFinalObservation(event.target.value)} disabled={disabled || isSubmitting} className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">Conclusions</label>
              <textarea rows={4} value={conclusions} onChange={(event) => setConclusions(event.target.value)} disabled={disabled || isSubmitting} className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">Commentaire final</label>
              <textarea rows={4} value={finalComment} onChange={(event) => setFinalComment(event.target.value)} disabled={disabled || isSubmitting} className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium text-[#1F2937]">Photos finales</p>
          <div className="grid gap-4 md:grid-cols-2">
            {[...exteriorSlots, ...interiorSlots].map((slot) => (
              <InspectionPhotoSlot
                key={slot.key}
                photoType={slot.photoType}
                label={slot.label}
                previewUrl={photoState[slot.key]?.previewUrl ?? null}
                uploadedUrl={photoState[slot.key]?.previewUrl ?? null}
                isUploading={false}
                errorMessage={null}
                onFileChange={(file) => setSlotFile(slot.key, file)}
              />
            ))}
          </div>
        </div>

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
