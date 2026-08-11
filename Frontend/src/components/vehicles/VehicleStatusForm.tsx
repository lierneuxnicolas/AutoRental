import { useState } from 'react'
import Alert from '../feedback/Alert'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Select from '../ui/Select'
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
  onSubmit: (payload: VehicleManagementStatusUpdateRequest) => Promise<void> | void
  onCancel: () => void
  isSubmitting?: boolean
  apiError?: string | null
}

export default function VehicleStatusForm({
  currentStatus,
  vehicleLabel,
  onSubmit,
  onCancel,
  isSubmitting = false,
  apiError,
}: VehicleStatusFormProps) {
  const [status, setStatus] = useState<VehicleManagementStatus>(currentStatus)
  const [reason, setReason] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    await onSubmit({
      status,
      reason: reason.trim() || undefined,
    })
  }

  return (
    <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Changer le statut</h2>}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-[#1F2937]">{vehicleLabel}</p>
          <p className="mt-1 text-sm text-slate-600">Choisissez un nouveau statut. Le motif est optionnel.</p>
        </div>

        {apiError ? <Alert variant="danger" title="Mise a jour impossible" message={apiError} /> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Nouveau statut"
            options={statusOptions}
            value={status}
            onChange={(event) => setStatus(event.target.value as VehicleManagementStatus)}
            disabled={isSubmitting}
          />

          <Input
            label="Motif (optionnel)"
            placeholder="Ex: vehicule nettoye, retour atelier..."
            maxLength={500}
            helperText="Champ supporte par l'API, longueur maximale 500 caracteres."
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