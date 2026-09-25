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
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
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
  return (
    <Card
      className="border-slate-200"
      header={(
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-3">
            <p className="text-sm font-semibold text-[#2563EB]">{intervention.reference || `#${intervention.id}`}</p>
            <p className="text-sm text-slate-600">Date de création : {formatDate(intervention.created_at)}</p>
          </div>
          <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
        </div>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">Véhicule</p>
          <div className="mt-1 space-y-1 text-sm">
            <p className="text-slate-700">{intervention.vehicle.brand} {intervention.vehicle.model_name}</p>
            <p className="text-slate-600">{intervention.vehicle.registration_number || 'Immatriculation non renseignée'}</p>
            <p className="text-slate-600">Couleur : {intervention.vehicle.color || 'Non renseignée'}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">Localisation</p>
          <p className="mt-1 text-sm text-slate-700">Parking : {intervention.vehicle.parking_name ?? 'Non renseigné'}</p>
          <p className="mt-1 text-sm text-slate-700">Place : {intervention.vehicle.parking_space_number ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">Responsable</p>
          <p className="mt-1 text-sm text-slate-700">Gestionnaire : {personLabel(intervention.created_by)}</p>
          <p className="mt-1 text-sm text-slate-700">Attribuée à : {personLabel(intervention.assigned_to)}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">Travail demandé</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{intervention.description?.trim() || 'Aucune consigne fournie.'}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">Planification</p>
          <p className="mt-1 text-sm text-slate-700">Début : {intervention.planned_start_at ? formatDateTime(intervention.planned_start_at) : 'Non renseigné'}</p>
          <p className="mt-1 text-sm text-slate-700">Fin : {intervention.planned_end_at ? formatDateTime(intervention.planned_end_at) : 'Non renseignée'}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1F2937]">Réalisation</p>
          <p className="mt-1 text-sm text-slate-700">Prise en charge : {intervention.started_at ? formatDateTime(intervention.started_at) : '—'}</p>
          <p className="mt-1 text-sm text-slate-700">Remise : {intervention.completed_at ? formatDateTime(intervention.completed_at) : '—'}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">{action}</div>
    </Card>
  )
}
