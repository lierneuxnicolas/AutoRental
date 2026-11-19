import { useMemo, useState } from 'react'
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
    planned_start_date?: string
    planned_end_date?: string
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

const blockingInterventionStatuses = new Set([
  'A_ATTRIBUER',
  'ATTRIBUEE',
  'PLANIFIEE',
  'EN_COURS',
  'EN_PAUSE',
])

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
  const [plannedEndDate, setPlannedEndDate] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [agendaReferenceTime] = useState(() => Date.now())

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
  const plannedStartAt = plannedDate ? new Date(`${plannedDate}T10:00:00`) : null
  const plannedEndAt = plannedEndDate ? new Date(`${plannedEndDate}T22:00:00`) : null
  const selectedVehicleId = vehicleId === undefined ? null : Number(vehicleId)
  const agendaItems = useMemo(() => {
    if (selectedVehicleId === null) {
      return []
    }

    const reservationItems = reservations
      .filter((reservation) => (
        Number(reservation.vehicle.id) === selectedVehicleId
        && (reservation.status === 'EN_COURS' || reservation.status === 'CONFIRMEE')
        && new Date(reservation.end_at).getTime() > agendaReferenceTime
      ))
      .map((reservation) => ({
        key: `reservation-${reservation.id}`,
        kind: 'reservation' as const,
        label: reservation.reference,
        startAt: reservation.start_at,
        endAt: reservation.end_at,
        reservation,
      }))
    const interventionItems = interventions
      .filter((intervention) => (
        Number(intervention.vehicle.id) === selectedVehicleId
        && blockingInterventionStatuses.has(intervention.status)
        && intervention.planned_start_at
        && intervention.planned_end_at
        && new Date(intervention.planned_end_at).getTime() > agendaReferenceTime
      ))
      .map((intervention) => ({
        key: `intervention-${intervention.id}`,
        kind: 'intervention' as const,
        label: intervention.reference,
        startAt: intervention.planned_start_at as string,
        endAt: intervention.planned_end_at as string,
        intervention,
      }))

    return [...reservationItems, ...interventionItems]
      .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
  }, [agendaReferenceTime, interventions, reservations, selectedVehicleId])
  const agendaConflict = plannedStartAt && plannedEndAt
    ? agendaItems.find((item) => new Date(item.startAt) < plannedEndAt && new Date(item.endAt) > plannedStartAt)
    : undefined
  const conflictingReservation = agendaConflict?.kind === 'reservation' ? agendaConflict.reservation : undefined
  const conflictingIntervention = agendaConflict?.kind === 'intervention' ? agendaConflict.intervention : undefined
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
      if (plannedEndDate < plannedDate) {
        setLocalError('La date de fin prévue ne peut pas être antérieure à la date de début.')
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
      planned_start_date: plannedDate || undefined,
      planned_end_date: plannedEndDate || undefined,
    })
  }

  return (
    <Card className="border-[#DBEAFE] bg-[#F8FAFC]" header={<h2 className="text-base font-semibold text-[#1F2937]">Planifier une intervention</h2>}>
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
                    setPlannedEndDate('')
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
                  setPlannedEndDate('')
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
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Input
                    type="date"
                    aria-label="Date de début prévue"
                    value={plannedDate}
                    onChange={(event) => setPlannedDate(event.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="pb-3 text-sm font-medium text-slate-600">Heure fixe : 10 h 00</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="block text-sm font-medium text-[#1F2937]">Fin prévue</p>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Input
                    type="date"
                    aria-label="Date de fin prévue"
                    value={plannedEndDate}
                    onChange={(event) => setPlannedEndDate(event.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="pb-3 text-sm font-medium text-slate-600">Heure fixe : 22 h 00</p>
                </div>
              </div>
            </div>
          ) : null}

          {requiredRole ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="font-semibold text-[#1F2937]">Agenda du véhicule</p>
              {agendaItems.length === 0 ? (
                <p className="mt-2 text-slate-500">Aucune période réservée. Libre sur la période affichée.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {agendaItems.map((item) => (
                    <p key={item.key} className="text-slate-600">
                      {item.kind === 'reservation' ? `Réservé · ${item.label}` : `Intervention · ${item.label}`} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.startAt))} → {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.endAt))}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {plannedEndAt && !hasImmediateConflict && plannedEndDate >= plannedDate ? <p className="text-sm font-medium text-emerald-700">Créneau disponible · fin prévue : {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(plannedEndAt)}</p> : null}
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
            <Button type="submit" className="min-w-[13rem] whitespace-nowrap" disabled={isSubmitting || hasImmediateConflict}>
              {isSubmitting ? 'Planification...' : 'Planifier une intervention'}
            </Button>
          </div> : null}
        </form>
      </div>
    </Card>
  )
}