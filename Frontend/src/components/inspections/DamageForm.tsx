import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { addInspectionDamage } from '../../services/inspectionService'
import type { InspectionDamage, InspectionDamageCreateRequest, InspectionPhoto, Severity } from '../../types/inspection'

type ApiErrorPayload = {
  detail?: string
  non_field_errors?: string[]
  [key: string]: unknown
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

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'MINEUR', label: 'Mineur' },
  { value: 'MODERE', label: 'Modere' },
  { value: 'MAJEUR', label: 'Majeur' },
  { value: 'CRITIQUE', label: 'Critique' },
]

export interface DamageFormProps {
  inspectionId: number
  uploadedPhotos: InspectionPhoto[]
  damages: InspectionDamage[]
  onDamageAdded: (damage: InspectionDamage) => void
}

export default function DamageForm({ inspectionId, uploadedPhotos, damages, onDamageAdded }: DamageFormProps) {
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('MINEUR')
  const [location, setLocation] = useState('')
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  const addDamageMutation = useMutation({
    mutationFn: (payload: InspectionDamageCreateRequest) => addInspectionDamage(inspectionId, payload),
    onSuccess: (damage) => {
      onDamageAdded(damage)
      setDescription('')
      setSeverity('MINEUR')
      setLocation('')
      setSelectedPhotoIds([])
      setFormError(null)
    },
    onError: (error) => {
      setFormError(toErrorMessage(error))
    },
  })

  const canSubmit =
    description.trim().length > 0 &&
    location.trim().length > 0 &&
    !addDamageMutation.isPending

  function togglePhotoId(photoId: number) {
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId],
    )
  }

  return (
    <div className="space-y-6">
      <Card header={<h3 className="text-base font-semibold text-[#1F2937]">Signaler un dommage</h3>}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              placeholder="Decrivez le dommage observe"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">
                Localisation <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                placeholder="Ex: aile avant gauche"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">Gravite</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {uploadedPhotos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#1F2937]">Photos liees (optionnel)</p>
              <div className="flex flex-wrap gap-2">
                {uploadedPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => togglePhotoId(photo.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      selectedPhotoIds.includes(photo.id)
                        ? 'border-[#2563EB] bg-[#DBEAFE] text-[#2563EB]'
                        : 'border-[#E5E7EB] bg-white text-slate-500 hover:border-[#2563EB]'
                    }`}
                  >
                    Photo #{photo.id} — {photo.photo_type}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {formError ? <Alert variant="danger" message={formError} /> : null}

          <Button
            className="w-full sm:w-auto"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              const payload: InspectionDamageCreateRequest = {
                description: description.trim(),
                severity,
                location: location.trim(),
                ...(selectedPhotoIds.length > 0 ? { photo_ids: selectedPhotoIds } : {}),
              }
              void addDamageMutation.mutate(payload)
            }}
          >
            {addDamageMutation.isPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" aria-label="Ajout en cours" />
                Ajout en cours...
              </span>
            ) : (
              'Ajouter le dommage'
            )}
          </Button>
        </div>
      </Card>

      {damages.length > 0 ? (
        <Card header={<h3 className="text-base font-semibold text-[#1F2937]">Dommages signales ({damages.length})</h3>}>
          <ul className="divide-y divide-[#E5E7EB]">
            {damages.map((dmg) => (
              <li key={dmg.id} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#FEF9C3] px-2 py-0.5 text-xs font-semibold text-[#92400E]">{dmg.severity}</span>
                  <span className="text-sm font-medium text-[#1F2937]">{dmg.location}</span>
                </div>
                <p className="text-sm text-slate-600">{dmg.description}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
