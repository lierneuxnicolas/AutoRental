import { useRef, useState, type FormEvent } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import InterventionPhotoUpload, { type InterventionPhotoUploadHandle } from './InterventionPhotoUpload'
import type { WorkerInterventionRole, WorkerInterventionWorkData, WorkerInterventionWorkValues } from '../../types/workerIntervention'

interface InterventionWorkFormProps {
  interventionId: number
  role: WorkerInterventionRole
  initialWorkData?: WorkerInterventionWorkData | null
  initialEstimatedCost?: string | number | null
  workRequest?: string
  embedded?: boolean
  disabled?: boolean
  isSubmitting?: boolean
  onSubmit: (values: WorkerInterventionWorkValues) => Promise<void> | void
  onPhotoUploadSuccess: () => void
}

const mechanicAnomalyTypes = [
  { value: '', label: 'Aucune anomalie' },
  { value: 'dommage', label: 'Dommage' },
  { value: 'securite', label: 'Problème de sécurité' },
  { value: 'nettoyage', label: 'Besoin de nettoyage' },
  { value: 'autre', label: 'Autre' },
]

const cleaningAnomalyTypes = [
  { value: '', label: 'Aucune anomalie' },
  { value: 'dommage', label: 'Dommage' },
  { value: 'technique', label: 'Problème technique' },
  { value: 'objet_trouve', label: 'Objet trouvé' },
  { value: 'salissure_exceptionnelle', label: 'Salissure exceptionnelle' },
  { value: 'autre', label: 'Autre' },
]

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toBoolean(value: unknown): boolean {
  return value === true
}

export default function InterventionWorkForm({
  interventionId,
  role,
  initialWorkData,
  initialEstimatedCost,
  workRequest,
  embedded = false,
  disabled = false,
  isSubmitting = false,
  onSubmit,
  onPhotoUploadSuccess,
}: InterventionWorkFormProps) {
  const initialData = initialWorkData ?? {}
  const [diagnostic, setDiagnostic] = useState(() => toText(initialData.diagnostic))
  const [estimatedCost, setEstimatedCost] = useState(() => initialEstimatedCost !== null && initialEstimatedCost !== undefined ? String(initialEstimatedCost) : '')
  const [cleaningWork, setCleaningWork] = useState(() => toText(initialData.cleaning_work) || toText(initialData.diagnostic))
  const [isWorkFinished, setIsWorkFinished] = useState(() => toBoolean(initialData.work_finished))
  const [anomalyType, setAnomalyType] = useState(() => toText(initialData.anomaly_type))
  const [anomalyComment, setAnomalyComment] = useState(() => toText(initialData.anomaly_comment))
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const photoUploadRef = useRef<InterventionPhotoUploadHandle | null>(null)

  const anomalyOptions = role === 'mechanic' ? mechanicAnomalyTypes : cleaningAnomalyTypes

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled || isSubmitting || isSaving) {
      return
    }

    const parsedCost = estimatedCost.trim() ? Number(estimatedCost.replace(',', '.')) : null
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setLocalError('Le coût éventuel doit être un montant positif ou vide.')
      return
    }

    setLocalError(null)
    const workText = (role === 'mechanic' ? diagnostic : cleaningWork).trim()
    const workData: WorkerInterventionWorkData = role === 'mechanic'
      ? { diagnostic: workText, work_finished: isWorkFinished, anomaly_type: anomalyType, anomaly_comment: anomalyComment.trim() }
      : { cleaning_work: workText, work_finished: isWorkFinished, anomaly_type: anomalyType, anomaly_comment: anomalyComment.trim() }

    setIsSaving(true)
    try {
      await photoUploadRef.current?.uploadSelected()
      await onSubmit({
        work_data: workData,
        estimated_cost: parsedCost,
      })
    } catch {
      setLocalError('L’enregistrement du travail ou l’envoi de la photo a échoué. Veuillez réessayer.')
    } finally {
      setIsSaving(false)
    }
  }

  const content = (
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {localError ? <Alert variant="danger" title="Saisie invalide" message={localError} /> : null}

        {workRequest?.trim() ? (
          <div>
            <p className="text-sm font-medium text-[#1F2937]">Travail demandé</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{workRequest}</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#1F2937]">Travail effectué</label>
          <textarea
            value={role === 'mechanic' ? diagnostic : cleaningWork}
            onChange={(event) => role === 'mechanic' ? setDiagnostic(event.target.value) : setCleaningWork(event.target.value)}
            rows={6}
            disabled={disabled || isSubmitting}
            className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
          />
        </div>
        <Input label="Coût éventuel" value={estimatedCost} inputMode="decimal" onChange={(event) => setEstimatedCost(event.target.value)} disabled={disabled || isSubmitting} />

        <div className="grid gap-3 md:grid-cols-2">
          {role === 'cleaning' ? (
            <label className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#1F2937]">
              <input type="checkbox" checked={isWorkFinished} onChange={(event) => setIsWorkFinished(event.target.checked)} disabled={disabled || isSubmitting} className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-2 focus:ring-blue-100" />
              Intervention terminée
            </label>
          ) : <div />}
          <label className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#1F2937]">
            <input type="checkbox" checked={Boolean(anomalyType)} onChange={(event) => setAnomalyType(event.target.checked ? 'autre' : '')} disabled={disabled || isSubmitting} className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-2 focus:ring-blue-100" />
            Anomalie constatée
          </label>
        </div>

        {anomalyType ? (
          <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-end">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">Type d’anomalie</label>
              <select value={anomalyType} onChange={(event) => setAnomalyType(event.target.value)} disabled={disabled || isSubmitting} className="block h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100">
                {anomalyOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <Input label="Commentaire anomalie" value={anomalyComment} onChange={(event) => setAnomalyComment(event.target.value)} disabled={disabled || isSubmitting} />
          </div>
        ) : null}

        <div className="w-full space-y-3">
          <p className="text-sm font-medium text-[#1F2937]">{role === 'mechanic' ? 'Photos de l’intervention' : 'Photos du nettoyage'}</p>
          <InterventionPhotoUpload ref={photoUploadRef} interventionId={interventionId} role={role} showSubmitButton={false} onUploadSuccess={onPhotoUploadSuccess} />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={disabled || isSubmitting || isSaving}>
            {isSubmitting || isSaving ? <span className="flex items-center justify-center gap-2"><LoadingSpinner size="sm" aria-label="Enregistrement du travail" />Enregistrement...</span> : 'Enregistrer le travail'}
          </Button>
        </div>
      </form>
  )

  if (embedded) {
    return content
  }

  return <Card className="border-slate-200" header={<p className="text-sm font-semibold text-[#2563EB]">Travail en cours</p>}>{content}</Card>
}
