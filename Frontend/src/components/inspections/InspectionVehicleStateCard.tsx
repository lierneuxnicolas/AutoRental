import type { ReactNode } from 'react'
import Card from '../ui/Card'
import type { WorkflowAnomalySeverity } from './inspectionVehicleState'

interface InspectionVehicleStateCardProps {
  title?: string
  mileageLabel: string
  mileage: string
  onMileageChange: (value: string) => void
  energy: string
  onEnergyChange: (value: string) => void
  anomalyPresent: boolean | null
  onAnomalyPresentChange: (value: boolean) => void
  anomalyDescription: string
  onAnomalyDescriptionChange: (value: string) => void
  anomalySeverity: WorkflowAnomalySeverity
  onAnomalySeverityChange: (value: WorkflowAnomalySeverity) => void
  anomalyPhotos?: ReactNode
  disabled?: boolean
}

const fieldClassName = 'block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]'

export default function InspectionVehicleStateCard({
  title = 'État du véhicule',
  mileageLabel,
  mileage,
  onMileageChange,
  energy,
  onEnergyChange,
  anomalyPresent,
  onAnomalyPresentChange,
  anomalyDescription,
  onAnomalyDescriptionChange,
  anomalySeverity,
  onAnomalySeverityChange,
  anomalyPhotos,
  disabled = false,
}: InspectionVehicleStateCardProps) {
  return (
    <Card header={<h2 className="text-2xl font-semibold text-[#1F2937] sm:text-3xl">{title}</h2>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]">{mileageLabel}</label>
            <input type="number" min={0} step={1} value={mileage} onChange={(event) => onMileageChange(event.target.value)} disabled={disabled} className={fieldClassName} />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]">Niveau carburant / batterie (%)</label>
            <input type="number" min={0} max={100} step={1} value={energy} onChange={(event) => onEnergyChange(event.target.value)} disabled={disabled} className={fieldClassName} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-[#1F2937]">Avez-vous constaté une anomalie ?</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name={`${title}-anomaly-present`} checked={anomalyPresent === true} onChange={() => onAnomalyPresentChange(true)} disabled={disabled} />
              Oui
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name={`${title}-anomaly-present`} checked={anomalyPresent === false} onChange={() => onAnomalyPresentChange(false)} disabled={disabled} />
              Non
            </label>
          </div>
        </div>

        {anomalyPresent ? (
          <div className="space-y-4 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">Description de l’anomalie</label>
              <textarea rows={4} value={anomalyDescription} onChange={(event) => onAnomalyDescriptionChange(event.target.value)} disabled={disabled} className={fieldClassName} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]">Gravité</label>
              <select value={anomalySeverity} onChange={(event) => onAnomalySeverityChange(event.target.value as WorkflowAnomalySeverity)} disabled={disabled} className={fieldClassName}>
                <option value="">Sélectionner</option>
                <option value="ACCEPTABLE">Acceptable</option>
                <option value="GRAVE">Grave</option>
              </select>
            </div>
            {anomalyPhotos}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
