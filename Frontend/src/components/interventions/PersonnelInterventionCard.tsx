import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import Card from '../ui/Card'
import StatusBadge, { type StatusVariant } from '../ui/StatusBadge'
import type { WorkerInterventionResponse } from '../../types/workerIntervention'

interface PersonnelInterventionCardProps {
  intervention: WorkerInterventionResponse
  statusBadge: { label: string; variant: StatusVariant }
  action: ReactNode
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(clientLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(clientLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function personLabel(person: WorkerInterventionResponse['assigned_to'] | WorkerInterventionResponse['created_by']): string {
  if (!person) return 'Non renseigné'
  return `${person.first_name} ${person.last_name}`.trim() || person.email
}

export default function PersonnelInterventionCard({ intervention, statusBadge, action }: PersonnelInterventionCardProps) {
  const { t } = useTranslation()
  return (
    <Card
      className="border-slate-200"
      header={(
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-3">
            <p className="text-sm font-semibold text-[#2563EB]">{intervention.reference || `#${intervention.id}`}</p>
            <p className="text-sm text-slate-600">{t("client.date_de_creation")} {formatDate(intervention.created_at)}</p>
          </div>
          <StatusBadge label={professionalDisplay(t, statusBadge.label)} variant={statusBadge.variant} />
        </div>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">{t("client.vehicule_alt")}</p>
          <div className="mt-1 space-y-1 text-sm">
            <p className="text-slate-700">{intervention.vehicle.brand} {intervention.vehicle.model_name}</p>
            <p className="text-slate-600">{intervention.vehicle.registration_number || t("professional.immatriculation_non_renseignee")}</p>
            <p className="text-slate-600">{t("professional.couleur_2")} {intervention.vehicle.color || t("professional.non_renseignee")}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">{t("client.localisation")}</p>
          <p className="mt-1 text-sm text-slate-700">{t("professional.parking")} {intervention.vehicle.parking_name ?? t("public.non_renseigne")}</p>
          <p className="mt-1 text-sm text-slate-700">{t("professional.place")} {intervention.vehicle.parking_space_number ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">{t("professional.responsable")}</p>
          <p className="mt-1 text-sm text-slate-700">{t("professional.gestionnaire")} {personLabel(intervention.created_by)}</p>
          <p className="mt-1 text-sm text-slate-700">{t("professional.attribuee_a")} {personLabel(intervention.assigned_to)}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">{t("professional.travail_demande")}</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{intervention.description?.trim() || t("professional.aucune_consigne_fournie")}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">{t("professional.planification")}</p>
          <p className="mt-1 text-sm text-slate-700">{t("client.debut")} {intervention.planned_start_at ? formatDateTime(intervention.planned_start_at) : t("public.non_renseigne")}</p>
          <p className="mt-1 text-sm text-slate-700">{t("client.fin")} {intervention.planned_end_at ? formatDateTime(intervention.planned_end_at) : t("public.non_renseignee")}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">{t("professional.realisation")}</p>
          <p className="mt-1 text-sm text-slate-700">{t("client.prise_en_charge")} {intervention.started_at ? formatDateTime(intervention.started_at) : '—'}</p>
          <p className="mt-1 text-sm text-slate-700">{t("professional.remise")} {intervention.completed_at ? formatDateTime(intervention.completed_at) : '—'}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">{action}</div>
    </Card>
  )
}
