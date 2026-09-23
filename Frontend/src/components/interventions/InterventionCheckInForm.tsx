import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import InspectionPhotoSlot from '../inspections/InspectionPhotoSlot'
import type { WorkerInterventionCheckInValues, WorkerInterventionInterruptValues, WorkerInterventionRole } from '../../types/workerIntervention'
import type { PhotoType } from '../../types/inspection'

interface InterventionCheckInFormProps {
  role: WorkerInterventionRole
  initialMileage?: number | null
  embedded?: boolean
  disabled?: boolean
  isSubmitting?: boolean
  onSubmit: (values: WorkerInterventionCheckInValues) => void
  onInterrupt?: (values: WorkerInterventionInterruptValues) => void
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

export default function InterventionCheckInForm({
  role,
  initialMileage,
  embedded = false,
  disabled = false,
  isSubmitting = false,
  onSubmit,
  onInterrupt,
}: InterventionCheckInFormProps) {
  const [mileage, setMileage] = useState(initialMileage !== null && initialMileage !== undefined ? String(initialMileage) : '')
  const [observations, setObservations] = useState('')
  const [vehicleCondition, setVehicleCondition] = useState('')
  const [cleanlinessState, setCleanlinessState] = useState('')
  const [cleanlinessNotes, setCleanlinessNotes] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [photoState, setPhotoState] = useState(buildEmptyPhotoState)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isInterruptOpen, setIsInterruptOpen] = useState(false)
  const [interruptReasonType, setInterruptReasonType] = useState<WorkerInterventionInterruptValues['reason_type']>('vehicule_inaccessible')
  const [interruptReasonDetail, setInterruptReasonDetail] = useState('')
  const [interruptPhoto, setInterruptPhoto] = useState<File | null>(null)

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

    if (disabled || isSubmitting) {
      return
    }

    const parsedMileage = Number(mileage)
    if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
      setLocalError('Le kilométrage doit être un nombre positif ou nul.')
      return
    }

    if (!observations.trim()) {
      setLocalError('Les observations sont obligatoires.')
      return
    }

    if (selectedPhotos.length === 0) {
      setLocalError('Ajoutez au moins une photo avant intervention.')
      return
    }

    setLocalError(null)
    onSubmit({
      mileage: parsedMileage,
      observations: observations.trim(),
      vehicle_condition: vehicleCondition.trim() || undefined,
      cleanliness_state: cleanlinessState.trim() || undefined,
      cleanliness_notes: cleanlinessNotes.trim() || undefined,
      photos: selectedPhotos,
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
          <div className="grid gap-4 md:grid-cols-2">
          <Input
            type="text"
            inputMode="numeric"
            label="Kilométrage initial"
            value={mileage}
            onChange={(event) => setMileage(event.target.value)}
            disabled={disabled || isSubmitting}
          />
          {role === 'mechanic' ? (
            <Input
              label="État général du véhicule"
              value={vehicleCondition}
              onChange={(event) => setVehicleCondition(event.target.value)}
              disabled={disabled || isSubmitting}
            />
          ) : (
            <>
              <Input
                label="État de propreté"
                value={cleanlinessState}
                onChange={(event) => setCleanlinessState(event.target.value)}
                disabled={disabled || isSubmitting}
              />
              <Input
                label="Salissures / odeurs / déchets"
                value={cleanlinessNotes}
                onChange={(event) => setCleanlinessNotes(event.target.value)}
                disabled={disabled || isSubmitting}
                className="md:col-span-2"
              />
            </>
          )}
          </div>

          <div className="space-y-2">
          <label htmlFor={`check-in-observations-${role}`} className="block text-sm font-medium text-[#1F2937]">
            Observations
          </label>
          <textarea
            id={`check-in-observations-${role}`}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            disabled={disabled || isSubmitting}
            rows={4}
            className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
          />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-[#1F2937]">Photos de check-in</p>
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
