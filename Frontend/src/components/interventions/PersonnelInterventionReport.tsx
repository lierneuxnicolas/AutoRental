import StatusBadge from '../ui/StatusBadge'
import type { ManagementInterventionResponse } from '../../types/managementIntervention'
import type { WorkerInterventionCheckInPhoto, WorkerInterventionResponse } from '../../types/workerIntervention'
import { resolveMediaUrl } from '../../utils/media'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function formatDateTime(value: unknown): string | null {
  const text = asText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function formatCurrency(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount) : null
}

function personLabel(person: WorkerInterventionResponse['assigned_to'] | WorkerInterventionResponse['created_by']): string {
  if (!person) return 'Non renseigné'
  return `${person.first_name} ${person.last_name}`.trim() || person.email
}

function SummaryField({ label, value }: { label: string; value: unknown }) {
  const text = asText(value)
  if (!text) return null
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-line text-sm font-medium text-[#1F2937]">{text}</dd></div>
}

function PhotoGroup({ title, photos }: { title: string; photos: WorkerInterventionCheckInPhoto[] }) {
  const visiblePhotos = photos.filter((photo) => Boolean(resolveMediaUrl(photo.file)))
  return (
    <div>
      <h4 className="text-xs font-medium text-slate-600">{title}</h4>
      {visiblePhotos.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {visiblePhotos.map((photo) => <img key={photo.id} src={resolveMediaUrl(photo.file) ?? undefined} alt={photo.caption || title} className="aspect-4/3 w-full rounded-lg border border-slate-200 object-cover" loading="lazy" />)}
        </div>
      ) : <p className="mt-2 text-xs text-slate-500">Aucune photo</p>}
    </div>
  )
}

export default function PersonnelInterventionReport({ intervention }: { intervention: WorkerInterventionResponse | ManagementInterventionResponse }) {
  const finalReport = asRecord(intervention.final_report)
  const reportCheckIn = asRecord(finalReport.check_in)
  const work = intervention.work_data ?? asRecord(finalReport.work)
  const checkOut = asRecord(finalReport.check_out)
  const checkInPhotos = intervention.check_in?.photos ?? []
  const checkOutPhotos = intervention.check_out?.photos ?? []
  const beforePhotos = checkInPhotos.filter((photo) => (photo.caption || '').toLocaleLowerCase('fr-FR').includes('avant intervention'))
  const duringPhotos = checkInPhotos.filter((photo) => !(photo.caption || '').toLocaleLowerCase('fr-FR').includes('avant intervention'))
  const hasPhotos = beforePhotos.length > 0 || duringPhotos.length > 0 || checkOutPhotos.length > 0
  const workDone = work.diagnostic ?? work.cleaning_work ?? work.repairs_done

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3"><p className="text-sm font-semibold text-[#2563EB]">{intervention.reference || `#${intervention.id}`}</p><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{intervention.intervention_type}</p></div>
          <StatusBadge label="Terminée" variant="success" />
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-3">
          <div><p className="text-sm font-semibold text-[#1F2937]">Véhicule</p><div className="mt-1 space-y-1 text-sm"><p className="text-slate-700">{intervention.vehicle.brand} {intervention.vehicle.model_name}</p><p className="text-slate-600">{intervention.vehicle.registration_number}</p><p className="text-slate-600">Couleur : {intervention.vehicle.color || 'Non renseignée'}</p></div></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">Localisation</p><p className="mt-1 text-sm text-slate-700">Parking : {intervention.vehicle.parking_name ?? 'Non renseigné'}</p><p className="mt-1 text-sm text-slate-700">Place : {intervention.vehicle.parking_space_number ?? '—'}</p></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">Responsable</p><p className="mt-1 text-sm text-slate-700">Gestionnaire : {personLabel(intervention.created_by)}</p><p className="mt-1 text-sm text-slate-700">Attribuée à : {personLabel(intervention.assigned_to)}</p></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">Travail demandé</p><p className="mt-1 text-sm leading-6 text-slate-700">{intervention.description?.trim() || 'Aucune consigne fournie.'}</p></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">Planification</p><p className="mt-1 text-sm text-slate-700">Début : {formatDateTime(intervention.planned_start_at) ?? 'Non renseigné'}</p><p className="mt-1 text-sm text-slate-700">Fin : {formatDateTime(intervention.planned_end_at) ?? 'Non renseignée'}</p></div>
        </div>
      </section>
      <section>
        <h2 className="text-base font-semibold text-[#1F2937]">Intervention</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-3">
          <SummaryField label="Travail effectué" value={workDone} />
          <SummaryField label="Prise en charge réelle" value={formatDateTime(intervention.started_at ?? finalReport.started_at)} />
          <SummaryField label="Remise du véhicule" value={formatDateTime(intervention.completed_at ?? finalReport.completed_at)} />
          <SummaryField label="Kilométrage initial" value={reportCheckIn.mileage ?? intervention.check_in?.mileage} />
          <SummaryField label="Kilométrage final" value={checkOut.mileage ?? intervention.check_out?.mileage} />
          <SummaryField label="Coût éventuel" value={formatCurrency(finalReport.estimated_cost ?? intervention.estimated_cost)} />
        </dl>
      </section>
      {hasPhotos ? <section><h2 className="text-base font-semibold text-[#1F2937]">Photos</h2><div className="mt-4 grid gap-5 lg:grid-cols-3"><PhotoGroup title="Avant intervention" photos={beforePhotos} /><PhotoGroup title="Pendant intervention" photos={duringPhotos} /><PhotoGroup title="Après intervention" photos={checkOutPhotos} /></div></section> : null}
    </div>
  )
}
