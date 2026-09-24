import { useState } from 'react'
import Alert from '../feedback/Alert'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Select from '../ui/Select'
import type { InterventionAssignableUser, InterventionPlanningConflictReservation } from '../../types/managementIntervention'
import type { ManagementInterventionResponse } from '../../types/managementIntervention'
import type { ReservationManagementDetail } from '../../types/managementReservation'
import type { VehicleManagementStatus, VehicleManagementStatusUpdateRequest } from '../../types/managementVehicle'

const statusOptions: Array<{ value: VehicleManagementStatus; label: string }> = [
  { value: 'DISPONIBLE', label: 'Disponible' },
  { value: 'RESERVE', label: 'Reserve' },
  { value: 'LOUE', label: 'Loue' },
  { value: 'A_CONTROLER', label: 'A controler' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'NETTOYAGE', label: 'Nettoyage' },
  { value: 'ACCIDENTE', label: 'Accidente' },
  { value: 'INDISPONIBLE', label: 'Indisponible' },
]

export interface VehicleStatusFormProps {
  currentStatus: VehicleManagementStatus
  vehicleLabel: string
  assignees?: InterventionAssignableUser[]
  isLoadingAssignees?: boolean
  onSubmit: (payload: VehicleManagementStatusUpdateRequest & {
    assigned_user_id?: number
    planned_start_at?: string
    planned_end_at?: string
  }) => Promise<void> | void
  onCancel: () => void
  isSubmitting?: boolean
  apiError?: string | null
  conflictReservation?: InterventionPlanningConflictReservation | null
  reservationBasePath?: string
  forcedStatus?: Extract<VehicleManagementStatus, 'MAINTENANCE' | 'NETTOYAGE'>
  vehicleId?: number
  reservations?: ReservationManagementDetail[]
  interventions?: ManagementInterventionResponse[]
}

function getPersonLabel(person: InterventionAssignableUser): string {
  const fullName = `${person.first_name} ${person.last_name}`.trim()
  return fullName.length > 0 ? fullName : person.email
}

const halfHourOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, '0')
  const minute = index % 2 === 0 ? '00' : '30'
  return { value: `${hour}:${minute}`, label: `${hour}:${minute}` }
})

export default function VehicleStatusForm({
  currentStatus,
  vehicleLabel,
  assignees = [],
  isLoadingAssignees = false,
  onSubmit,
  onCancel,
  isSubmitting = false,
  apiError,
  conflictReservation,
  reservationBasePath = '/manager/reservations',
  forcedStatus,
  vehicleId,
  reservations = [],
  interventions = [],
}: VehicleStatusFormProps) {
  const [status, setStatus] = useState<VehicleManagementStatus>(forcedStatus ?? currentStatus)
  const [reason, setReason] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [plannedTime, setPlannedTime] = useState('')
  const [plannedEndDate, setPlannedEndDate] = useState('')
  const [plannedEndTime, setPlannedEndTime] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const requiredRole = status === 'MAINTENANCE'
    ? 'MECANICIEN'
    : status === 'NETTOYAGE'
      ? 'NETTOYEUR'
      : null
  const assignmentLabel = status === 'MAINTENANCE'
    ? 'Technicien / mécano affecté'
    : status === 'NETTOYAGE'
      ? 'Agent de nettoyage affecté'
      : null
  const filteredAssignees = requiredRole
    ? assignees.filter((assignee) => assignee.role === requiredRole)
    : []
  const assigneeOptions = [
    { value: '', label: isLoadingAssignees ? 'Chargement...' : 'Sélectionner une personne' },
    ...filteredAssignees.map((assignee) => ({ value: String(assignee.id), label: getPersonLabel(assignee) })),
  ]
  const plannedStartAt = plannedDate && plannedTime ? `${plannedDate}T${plannedTime}` : ''
  const plannedEndAt = plannedEndDate && plannedEndTime ? `${plannedEndDate}T${plannedEndTime}` : ''
  const selectedVehicleId = vehicleId === undefined ? null : Number(vehicleId)
  const vehicleReservations = reservations.filter((reservation) => selectedVehicleId !== null && Number(reservation.vehicle.id) === selectedVehicleId)
  const vehicleInterventions = interventions.filter((intervention) => selectedVehicleId !== null && Number(intervention.vehicle.id) === selectedVehicleId)
  const conflictingReservation = plannedStartAt && plannedEndAt
    ? vehicleReservations.find((reservation) => reservation.status !== 'ANNULEE' && new Date(reservation.start_at) < new Date(plannedEndAt) && new Date(reservation.end_at) > new Date(plannedStartAt))
    : undefined
  const conflictingIntervention = !conflictingReservation && plannedStartAt && plannedEndAt
    ? vehicleInterventions.find((intervention) => intervention.status !== 'ANNULEE' && intervention.planned_start_at && intervention.planned_end_at && new Date(intervention.planned_start_at) < new Date(plannedEndAt) && new Date(intervention.planned_end_at) > new Date(plannedStartAt))
    : undefined
  const hasImmediateConflict = Boolean(conflictingReservation || conflictingIntervention)
  const conflictStart = conflictingReservation?.start_at ?? conflictingIntervention?.planned_start_at
  const conflictEnd = conflictingReservation?.end_at ?? conflictingIntervention?.planned_end_at
  const conflictLabel = conflictingReservation?.reference ?? conflictingIntervention?.reference ?? 'Intervention planifiée'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (requiredRole) {
      if (!assignedUserId) {
        setLocalError('L’intervenant est obligatoire.')
        return
      }
      if (!plannedStartAt || !plannedEndAt) {
        setLocalError('Le début prévu et la fin prévue sont obligatoires.')
        return
      }
      if (!plannedEndAt || new Date(plannedEndAt).getTime() <= new Date(plannedStartAt).getTime()) {
        setLocalError('La fin prévue doit être après le début prévu.')
        return
      }
      if (hasImmediateConflict) {
        setLocalError('Ce créneau entre en conflit avec une réservation ou une intervention.')
        return
      }
      if (!reason.trim()) {
        setLocalError('Le motif est obligatoire.')
        return
      }
    }

    setLocalError(null)

    await onSubmit({
      status,
      reason: reason.trim() || undefined,
      assigned_user_id: assignedUserId ? Number(assignedUserId) : undefined,
      planned_start_at: plannedStartAt ? new Date(plannedStartAt).toISOString() : undefined,
      planned_end_at: plannedEndAt ? new Date(plannedEndAt).toISOString() : undefined,
    })
  }

  return (
    <Card className="border-[#DBEAFE] bg-[#F8FAFC]" header={<h2 className="text-base font-semibold text-[#1F2937]">Changer le statut</h2>}>
      <div className="space-y-3">
        <div className="text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Véhicule</p>
            <p className="mt-1 font-medium text-[#1F2937]">{vehicleLabel}</p>
          </div>
        </div>

        {apiError ? <Alert variant="danger" title="Mise a jour impossible" message={apiError} /> : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {forcedStatus ? (
              <div className="space-y-2">
                <Select
                  label="Service"
                  options={[{ value: 'MAINTENANCE', label: 'Maintenance' }, { value: 'NETTOYAGE', label: 'Nettoyage' }]}
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as VehicleManagementStatus)
                    setAssignedUserId('')
                    setPlannedDate('')
                    setPlannedTime('')
                    setPlannedEndDate('')
                    setPlannedEndTime('')
                    setLocalError(null)
                  }}
                  disabled={isSubmitting}
                />
              </div>
            ) : (
              <Select
                label="Nouveau statut"
                options={statusOptions}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as VehicleManagementStatus)
                  setAssignedUserId('')
                  setPlannedDate('')
                  setPlannedTime('')
                  setPlannedEndDate('')
                  setPlannedEndTime('')
                  setLocalError(null)
                }}
                disabled={isSubmitting}
              />
            )}

            {assignmentLabel ? (
              <Select
                label={assignmentLabel}
                options={assigneeOptions}
                value={assignedUserId}
                onChange={(event) => setAssignedUserId(event.target.value)}
                disabled={isSubmitting || isLoadingAssignees}
              />
            ) : null}
          </div>

          {requiredRole ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="block text-sm font-medium text-[#1F2937]">Début prévu</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="date"
                    aria-label="Date de début prévue"
                    value={plannedDate}
                    onChange={(event) => setPlannedDate(event.target.value)}
                    disabled={isSubmitting}
                  />
                  <Select
                    aria-label="Heure de début prévue"
                    options={[{ value: '', label: 'Heure' }, ...halfHourOptions]}
                    value={plannedTime}
                    onChange={(event) => setPlannedTime(event.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="block text-sm font-medium text-[#1F2937]">Fin prévue</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="date"
                    aria-label="Date de fin prévue"
                    value={plannedEndDate}
                    onChange={(event) => setPlannedEndDate(event.target.value)}
                    disabled={isSubmitting}
                  />
                  <Select
                    aria-label="Heure de fin prévue"
                    options={[{ value: '', label: 'Heure' }, ...halfHourOptions]}
                    value={plannedEndTime}
                    onChange={(event) => setPlannedEndTime(event.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {requiredRole ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="font-semibold text-[#1F2937]">Agenda du véhicule</p>
              {vehicleReservations.length === 0 && vehicleInterventions.filter((item) => item.planned_start_at && item.planned_end_at).length === 0 ? (
                <p className="mt-2 text-slate-500">Aucune période réservée. Libre sur la période affichée.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {vehicleReservations.filter((item) => item.status !== 'ANNULEE').map((reservation) => (
                    <p key={`reservation-${reservation.id}`} className="text-slate-600">Réservé · {reservation.reference} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(reservation.start_at))} → {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(reservation.end_at))}</p>
                  ))}
                  {vehicleInterventions.filter((item) => item.planned_start_at && item.planned_end_at).map((intervention) => (
                    <p key={`intervention-${intervention.id}`} className="text-slate-600">Intervention · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(intervention.planned_start_at as string))} → {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(intervention.planned_end_at as string))}</p>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {plannedEndAt && !hasImmediateConflict ? <p className="text-sm font-medium text-emerald-700">Créneau disponible · fin prévue : {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(plannedEndAt))}</p> : null}
          {hasImmediateConflict ? (
            <Alert
              variant="warning"
              title="Créneau indisponible"
              message={(
                <span>
                  {conflictLabel} · {conflictStart ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(conflictStart)) : ''} → {conflictEnd ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(conflictEnd)) : ''}
                </span>
              )}
            />
          ) : null}

          <Input
            label="Motif"
            placeholder="Ex: vehicule nettoye, retour atelier..."
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSubmitting}
          />

          {localError ? <Alert variant="danger" title="Valeurs invalides" message={localError} /> : null}

          {conflictReservation ? (
            <Alert
              variant="warning"
              title="Ce véhicule possède une réservation pendant cette période."
              message={(
                <div className="space-y-3">
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <p><span className="text-slate-500">Référence :</span> {conflictReservation.reference}</p>
                    <p><span className="text-slate-500">Client :</span> {conflictReservation.client || '—'}</p>
                    <p><span className="text-slate-500">Période :</span> {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(conflictReservation.start_at))} → {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(conflictReservation.end_at))}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`${reservationBasePath}/${conflictReservation.id}`}><Button type="button" size="sm">Voir réservation</Button></a>
                    <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Annuler</Button>
                  </div>
                </div>
              )}
            />
          ) : null}

          {!conflictReservation ? <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting || hasImmediateConflict}>
              {isSubmitting ? 'Mise a jour...' : 'Enregistrer le statut'}
            </Button>
          </div> : null}
        </form>
      </div>
    </Card>
  )
}