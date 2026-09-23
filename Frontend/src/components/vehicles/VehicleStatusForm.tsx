import { useState } from 'react'
import Alert from '../feedback/Alert'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Select from '../ui/Select'
import type { InterventionAssignableUser } from '../../types/managementIntervention'
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
  onSubmit: (payload: VehicleManagementStatusUpdateRequest & { assigned_user_id?: number }) => Promise<void> | void
  onCancel: () => void
  isSubmitting?: boolean
  apiError?: string | null
}

function getPersonLabel(person: InterventionAssignableUser): string {
  const fullName = `${person.first_name} ${person.last_name}`.trim()
  return fullName.length > 0 ? fullName : person.email
}

function getStatusLabel(status: VehicleManagementStatus): string {
  return statusOptions.find((option) => option.value === status)?.label ?? status
}

export default function VehicleStatusForm({
  currentStatus,
  vehicleLabel,
  assignees = [],
  isLoadingAssignees = false,
  onSubmit,
  onCancel,
  isSubmitting = false,
  apiError,
}: VehicleStatusFormProps) {
  const [status, setStatus] = useState<VehicleManagementStatus>(currentStatus)
  const [reason, setReason] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    await onSubmit({
      status,
      reason: reason.trim() || undefined,
      assigned_user_id: assignedUserId ? Number(assignedUserId) : undefined,
    })
  }

  return (
    <Card className="border-[#DBEAFE] bg-[#F8FAFC]" header={<h2 className="text-base font-semibold text-[#1F2937]">Changer le statut</h2>}>
      <div className="space-y-3">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Véhicule</p>
            <p className="mt-1 font-medium text-[#1F2937]">{vehicleLabel}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Statut actuel</p>
            <p className="mt-1 font-medium text-[#1F2937]">{getStatusLabel(currentStatus)}</p>
          </div>
        </div>

        {apiError ? <Alert variant="danger" title="Mise a jour impossible" message={apiError} /> : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Nouveau statut"
              options={statusOptions}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as VehicleManagementStatus)
                setAssignedUserId('')
              }}
              disabled={isSubmitting}
            />

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

          <Input
            label="Motif"
            placeholder="Ex: vehicule nettoye, retour atelier..."
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSubmitting}
          />

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Mise a jour...' : 'Enregistrer le statut'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}