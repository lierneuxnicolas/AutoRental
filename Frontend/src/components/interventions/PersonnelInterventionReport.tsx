import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import StatusBadge from '../ui/StatusBadge'
import Card from '../ui/Card'
import type { ManagementInterventionResponse } from '../../types/managementIntervention'
import type { WorkerInterventionResponse } from '../../types/workerIntervention'
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
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(clientLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function formatCurrency(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? new Intl.NumberFormat(clientLocale(), { style: 'currency', currency: 'EUR' }).format(amount) : null
}

function personLabel(person: WorkerInterventionResponse['assigned_to'] | WorkerInterventionResponse['created_by']): string {
  if (!person) return 'Non renseigné'
  return `${person.first_name} ${person.last_name}`.trim() || person.email
}

function SummaryField({ label, value }: { label: string; value: unknown }) {
  const text = asText(value)
  if (!text) return null
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-line [overflow-wrap:anywhere] text-sm font-medium text-[#1F2937]">{text}</dd></div>
}

type ReportPhoto = { url: string; caption: string }

function reportPhotos(...sources: unknown[]): ReportPhoto[] {
  const photos = new Map<string, ReportPhoto>()
  for (const source of sources) {
    if (!Array.isArray(source)) continue
    for (const item of source) {
      const photo = asRecord(item)
      const url = resolveMediaUrl(asText(photo.file))
      if (url && !photos.has(url)) photos.set(url, { url, caption: asText(photo.caption) ?? '' })
    }
  }
  return [...photos.values()]
}

function PhotoGroup({ title, photos }: { title: string; photos: ReportPhoto[] }) {
  const { t } = useTranslation()
  return (
    <div>
      <h4 className="text-xs font-medium text-slate-600">{title}</h4>
      {photos.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => <img key={photo.url} src={photo.url} alt={photo.caption || title} className="aspect-4/3 w-full rounded-lg border border-slate-200 object-cover" loading="lazy" />)}
        </div>
      ) : <p className="mt-2 text-xs text-slate-500">{t("professional.aucune_photo")}</p>}
    </div>
  )
}

export default function PersonnelInterventionReport({ intervention, heading }: {
  intervention: WorkerInterventionResponse | ManagementInterventionResponse
  heading?: 'h1' | 'h2'
}) {
  const { t } = useTranslation()
  const finalReport = asRecord(intervention.final_report)
  const reportCheckIn = asRecord(finalReport.check_in)
  const work = intervention.work_data ?? asRecord(finalReport.work)
  const checkOut = asRecord(finalReport.check_out)
  const reportWork = asRecord(finalReport.work)
  const checkInPhotos = reportPhotos(intervention.check_in?.photos, reportCheckIn.photos)
  const snapshotCheckInUrls = new Set(reportPhotos(reportCheckIn.photos).map((photo) => photo.url))
  const workPhotos = reportPhotos(reportWork.photos, work.photos)
  const workPhotoUrls = new Set(workPhotos.map((photo) => photo.url))
  const checkOutPhotos = reportPhotos(intervention.check_out?.photos, checkOut.photos)
  const beforePhotos = checkInPhotos.filter(({ url, caption }) => {
    const normalizedCaption = caption.toLocaleLowerCase('fr-FR')
    return !workPhotoUrls.has(url) && (normalizedCaption.includes('avant intervention')
      || (!normalizedCaption.includes('pendant intervention') && snapshotCheckInUrls.has(url)))
  })
  const beforePhotoUrls = new Set(beforePhotos.map((photo) => photo.url))
  const duringPhotos = [...workPhotos, ...checkInPhotos.filter((photo) =>
    !beforePhotoUrls.has(photo.url) && !workPhotoUrls.has(photo.url))]
  const hasPhotos = beforePhotos.length > 0 || duringPhotos.length > 0 || checkOutPhotos.length > 0
  const workDone = work.diagnostic ?? work.cleaning_work ?? work.repairs_done
  const finalObservation = checkOut.final_comment ?? checkOut.conclusions ?? checkOut.final_vehicle_state
    ?? checkOut.observations ?? intervention.check_out?.observations
  const vehicleReady = checkOut.vehicle_operational ?? checkOut.vehicle_clean
  const periods = intervention.work_periods ?? []
  const SectionHeading = heading === 'h2' ? 'h3' : 'h2'
  const summary = (

    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-3"><p className="text-sm font-semibold text-[#2563EB]">{intervention.reference || `#${intervention.id}`}</p><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{intervention.intervention_type}</p></div>
          <StatusBadge label={t("client.terminee")} variant="success" />
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-3">
          <div><p className="text-sm font-semibold text-[#1F2937]">{t("client.vehicule_alt")}</p><div className="mt-1 space-y-1 text-sm"><p className="text-slate-700">{intervention.vehicle.brand} {intervention.vehicle.model_name}</p><p className="text-slate-600">{intervention.vehicle.registration_number}</p><p className="text-slate-600">{t("professional.couleur_2")} {intervention.vehicle.color || t("professional.non_renseignee")}</p></div></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">{t("client.localisation")}</p><p className="mt-1 text-sm text-slate-700">{t("professional.parking")} {intervention.vehicle.parking_name ?? t("public.non_renseigne")}</p><p className="mt-1 text-sm text-slate-700">{t("professional.place")} {intervention.vehicle.parking_space_number ?? '—'}</p></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">{t("professional.responsable")}</p><p className="mt-1 text-sm text-slate-700">{t("professional.gestionnaire")} {personLabel(intervention.created_by)}</p><p className="mt-1 text-sm text-slate-700">{t("professional.attribuee_a")} {personLabel(intervention.assigned_to)}</p></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">{t("professional.travail_demande")}</p><p className="mt-1 text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{intervention.description?.trim() || t("professional.aucune_consigne_fournie")}</p></div>
          <div><p className="text-sm font-semibold text-[#1F2937]">{t("professional.planification")}</p><p className="mt-1 text-sm text-slate-700">{t("client.debut")} {formatDateTime(intervention.planned_start_at) ?? t("public.non_renseigne")}</p><p className="mt-1 text-sm text-slate-700">{t("client.fin")} {formatDateTime(intervention.planned_end_at) ?? t("professional.non_renseignee")}</p></div>
        </div>
      </section>
      <section>
        <SectionHeading className="text-base font-semibold text-[#1F2937]">{t("professional.intervention")}</SectionHeading>
        <dl className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-3">
          <SummaryField label={t("professional.travail_effectue")} value={workDone} />
          <SummaryField label={t("professional.prise_en_charge_reelle")} value={formatDateTime(intervention.started_at ?? finalReport.started_at ?? reportCheckIn.created_at)} />
          <SummaryField label={t("professional.remise_du_vehicule")} value={formatDateTime(intervention.completed_at ?? finalReport.completed_at)} />
          <SummaryField label={t("professional.kilometrage_initial")} value={reportCheckIn.mileage ?? intervention.check_in?.mileage} />
          <SummaryField label={t("professional.kilometrage_final")} value={checkOut.mileage ?? intervention.check_out?.mileage} />
          <SummaryField label={t("professional.cout_eventuel")} value={formatCurrency(finalReport.estimated_cost ?? intervention.estimated_cost)} />
          <SummaryField label={t("professional.observations_au_check_in")} value={reportCheckIn.observations ?? intervention.check_in?.observations} />
          <SummaryField label={t("professional.anomalie")} value={work.anomaly_comment ?? work.anomaly_type} />
          <SummaryField label={t("professional.observation_finale")} value={finalObservation} />
          <SummaryField label={t("professional.vehicule_operationnel_pret")} value={typeof vehicleReady === 'boolean' ? (vehicleReady ? 'Oui' : 'Non') : null} />
          <SummaryField label={t("professional.nouvelle_intervention_necessaire")} value={typeof checkOut.new_intervention_needed === 'boolean' ? (checkOut.new_intervention_needed ? 'Oui' : 'Non') : null} />
        </dl>
      </section>
      {periods.length > 0 ? <section><SectionHeading className="text-base font-semibold text-[#1F2937]">{t("professional.periodes_de_travail")}</SectionHeading><dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {periods.map((period) => <SummaryField key={period.id} label={formatDateTime(period.started_at) ?? 'Début non renseigné'} value={period.ended_at ? `Fin : ${formatDateTime(period.ended_at) ?? '—'}` : 'En cours'} />)}
      </dl></section> : null}
      {hasPhotos ? <section><SectionHeading className="text-base font-semibold text-[#1F2937]">{t("professional.photos")}</SectionHeading><div className="mt-4 grid gap-5 lg:grid-cols-3"><PhotoGroup title={t("professional.avant_intervention")} photos={beforePhotos} /><PhotoGroup title={t("professional.pendant_intervention")} photos={duringPhotos} /><PhotoGroup title={t("professional.apres_intervention")} photos={checkOutPhotos} /></div></section> : null}
    </div>
  )
  if (!heading) return summary

  const Heading = heading
  return (
    <Card contentClassName="min-w-0 px-4 sm:px-6" header={<Heading className="text-2xl font-semibold text-[#1F2937]">{t("professional.rapport_d_intervention")}</Heading>}>
      {summary}
    </Card>
  )
}
