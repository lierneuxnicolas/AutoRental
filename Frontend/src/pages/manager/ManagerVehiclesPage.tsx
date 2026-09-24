import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import VehicleStatusForm from '../../components/vehicles/VehicleStatusForm'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  assignManagementIntervention,
  createManagementIntervention,
  getManagementInterventionAssignees,
  getManagementInterventions,
  planManagementIntervention,
} from '../../services/managementInterventionService'
import { getManagementReservations } from '../../services/managementReservationService'
import { getManagementVehicles, updateVehicle, updateVehicleStatus } from '../../services/managementVehicleService'
import type { InterventionPlanningConflictReservation, InterventionType, ManagementInterventionResponse } from '../../types/managementIntervention'
import type { ReservationManagementDetail } from '../../types/managementReservation'
import type { ManagementVehicleListItem, VehicleManagementStatus, VehicleManagementStatusUpdateRequest } from '../../types/managementVehicle'
import { resolveMediaUrl } from '../../utils/media'

interface ManagerVehiclesPageProps {
  basePath?: string
}

type ManagerDecision = 'DISPONIBLE' | 'A_CONTROLER' | 'INDISPONIBLE' | 'RELANCER'

interface PendingValidation {
  intervention: ManagementInterventionResponse
  interventionType: InterventionType
  label: string
}

interface SelectedValidation {
  vehicle: ManagementVehicleListItem
  validation: PendingValidation
}

interface OperationalState {
  label: string
  variant: StatusVariant
  detail: string | null
  reservation: ReservationManagementDetail | null
}

function mapStatusToUi(status: string): { label: string; variant: StatusVariant } {
  const normalized = status.trim().toUpperCase()

  switch (normalized) {
    case 'DISPONIBLE':
      return { label: 'Disponible', variant: 'success' }
    case 'RESERVE':
      return { label: 'Réservé', variant: 'warning' }
    case 'LOUE':
      return { label: 'Loué', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'À contrôler', variant: 'warning' }
    case 'MAINTENANCE':
      return { label: 'Maintenance', variant: 'danger' }
    case 'NETTOYAGE':
      return { label: 'Nettoyage', variant: 'neutral' }
    case 'ACCIDENTE':
      return { label: 'Accidenté', variant: 'danger' }
    case 'INDISPONIBLE':
      return { label: 'Indisponible', variant: 'danger' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

function getPendingValidation(vehicle: ManagementVehicleListItem, interventions: ManagementInterventionResponse[]): PendingValidation | null {
  if (vehicle.public_status.trim().toUpperCase() !== 'A_CONTROLER') {
    return null
  }

  const latest = interventions.find((intervention) => intervention.vehicle.id === vehicle.id && intervention.status === 'TERMINEE')

  if (!latest) {
    return null
  }

  const interventionType = latest.intervention_type
  if (interventionType === 'MECANIQUE') {
    return null
  }
  return {
    intervention: latest,
    interventionType,
    label: 'Nettoyage terminé — à valider',
  }
}

function formatOperationalDateTime(value: unknown, includeAt = false): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return null
  }
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', '')
  return includeAt ? formatted.replace(' ', ' à ') : formatted
}

function getOperationalState(
  vehicle: ManagementVehicleListItem,
  interventions: ManagementInterventionResponse[],
  reservations: ReservationManagementDetail[],
  pendingValidation: PendingValidation | null,
): OperationalState {
  const vehicleReservations = reservations
    .filter((reservation) => reservation.vehicle.id === vehicle.id)
    .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())
  const reassignmentReservation = vehicleReservations.find(
    (reservation) => reservation.status === 'REAFFECTATION_REQUIRED',
  ) ?? null

  const now = Date.now()
  const currentRental = vehicleReservations.find((reservation) => (
    reservation.status === 'EN_COURS'
    && new Date(reservation.start_at).getTime() <= now
    && new Date(reservation.end_at).getTime() > now
  ))
  if (currentRental) {
    const endAt = formatOperationalDateTime(currentRental.end_at, true)
    return {
      label: 'En location',
      variant: 'info',
      detail: endAt ? `Jusqu’au ${endAt}` : null,
      reservation: currentRental,
    }
  }

  const activeIntervention = interventions.find((intervention) => (
    intervention.vehicle.id === vehicle.id && ['EN_COURS', 'EN_PAUSE'].includes(intervention.status)
  ))
  if (activeIntervention) {
    const checkIn = asRecord(activeIntervention.check_in)
    const startedAt = formatOperationalDateTime(checkIn.created_at, true)
    const plannedEndAt = formatOperationalDateTime(activeIntervention.planned_end_at, true)
    const isPaused = activeIntervention.status === 'EN_PAUSE'
    return {
      label: isPaused ? 'En pause' : 'En intervention',
      variant: 'warning',
      detail: isPaused
        ? (activeIntervention.intervention_type === 'MECANIQUE' ? 'Maintenance' : 'Nettoyage')
        : plannedEndAt ? `jusqu’au ${plannedEndAt}` : startedAt ? `depuis le ${startedAt}` : null,
      reservation: reassignmentReservation,
    }
  }

  if (pendingValidation) {
    return {
      label: 'À valider',
      variant: 'warning',
      detail: pendingValidation.interventionType === 'MECANIQUE' ? 'Maintenance terminée' : 'Nettoyage terminé',
      reservation: null,
    }
  }

  const normalizedStatus = vehicle.public_status.trim().toUpperCase()
  const hasCompletedMechanicalIntervention = interventions.some((intervention) => (
    intervention.vehicle.id === vehicle.id
    && intervention.intervention_type === 'MECANIQUE'
    && intervention.status === 'TERMINEE'
  ))
  if (normalizedStatus === 'A_CONTROLER' && hasCompletedMechanicalIntervention) {
    return {
      label: 'Au parc',
      variant: 'success',
      detail: null,
      reservation: reassignmentReservation,
    }
  }
  const fallbackReservation = normalizedStatus === 'RESERVE' || normalizedStatus === 'LOUE'
    ? [...vehicleReservations].sort((left, right) => new Date(right.start_at).getTime() - new Date(left.start_at).getTime())[0] ?? null
    : null
  const isUnavailable = !vehicle.is_active || ['ACCIDENTE', 'INDISPONIBLE', 'A_CONTROLER', 'MAINTENANCE', 'NETTOYAGE'].includes(normalizedStatus)
  if (isUnavailable) {
    return {
      label: 'Indisponible',
      variant: 'danger',
      detail: normalizedStatus === 'ACCIDENTE' ? 'Accidenté' : null,
      reservation: reassignmentReservation ?? fallbackReservation,
    }
  }

  return {
    label: 'Au parc',
    variant: 'success',
    detail: null,
    reservation: reassignmentReservation ?? fallbackReservation,
  }
}

function getRegistrationNumber(vehicle: ManagementVehicleListItem): string | null {
  return vehicle.registration_number.trim() || null
}

function getParkingLabel(vehicle: ManagementVehicleListItem): string {
  return [vehicle.parking_name, vehicle.parking_space_number]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' · ') || '—'
}

interface VehicleCardProps {
  vehicle: ManagementVehicleListItem
  pendingValidation: PendingValidation | null
  operationalState: OperationalState
  onPlanIntervention: (vehicle: ManagementVehicleListItem) => void
  onToggleActive: (vehicle: ManagementVehicleListItem) => void
  onOpenValidation: (selection: SelectedValidation) => void
  basePath: string
  statusForm?: ReactNode
  validationPanel?: ReactNode
}

function OperationalStateDisplay({ state, compact = false }: { state: OperationalState; compact?: boolean }) {
  return (
    <div className="space-y-1">
      <StatusBadge variant={state.variant} label={state.label} />
      {state.detail ? <p className={`text-xs leading-5 text-slate-500${compact ? ' whitespace-nowrap' : ''}`}>{state.detail}</p> : null}
    </div>
  )
}

function canPlanIntervention(vehicle: ManagementVehicleListItem, state: OperationalState): boolean {
  return vehicle.is_active && !['En location', 'En intervention', 'À valider'].includes(state.label)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function asBooleanLabel(value: unknown): string | null {
  if (value === true) {
    return 'Oui'
  }
  if (value === false) {
    return 'Non'
  }
  return null
}

function formatDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function formatInterventionType(value: unknown): string | null {
  const text = asText(value)
  if (text === 'MECANIQUE') {
    return 'Mécanique'
  }
  if (text === 'NETTOYAGE') {
    return 'Nettoyage'
  }
  return text
}

function formatAnomalyType(value: unknown): string | null {
  const text = asText(value)
  if (!text) {
    return null
  }

  const labels: Record<string, string> = {
    autre: 'Autre',
    dommage: 'Dommage',
    nettoyage: 'Besoin de nettoyage',
    objet_trouve: 'Objet trouvé',
    salissure_exceptionnelle: 'Salissure exceptionnelle',
    securite: 'Problème de sécurité',
    technique: 'Problème technique',
  }

  return labels[text] ?? text
}

type ReportPhoto = {
  file: string
  caption: string | null
  id: string
}

function getInspectionPhotos(inspection: unknown): ReportPhoto[] {
  const photos = asRecord(inspection).photos
  if (!Array.isArray(photos)) {
    return []
  }

  return photos
    .map((photo, index) => {
      const record = asRecord(photo)
      const file = asText(record.file)
      if (!file) {
        return null
      }

      return {
        file,
        caption: asText(record.caption),
        id: asText(record.id) ?? `${file}-${index}`,
      }
    })
    .filter((photo): photo is ReportPhoto => photo !== null)
}

function isBeforeInterventionPhoto(photo: ReportPhoto): boolean {
  return (photo.caption ?? '').toLowerCase().includes('avant intervention')
}

function isInterruptPhoto(photo: ReportPhoto): boolean {
  return (photo.caption ?? '').toLowerCase().includes('interruption')
}

function compactJoin(parts: Array<string | null>): string | null {
  const values = parts.filter((part): part is string => Boolean(part))
  return values.length > 0 ? values.join(' - ') : null
}

function ReportField({ label, value }: { label: string; value: unknown }) {
  const text = asText(value)
  if (!text) {
    return null
  }

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-5 text-[#1F2937]">{text}</p>
    </div>
  )
}

function ReportPhotos({ title, photos }: { title: string; photos: ReportPhoto[] }) {
  if (photos.length === 0) {
    return null
  }

  return (
    <div className="md:col-span-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((photo, index) => (
          <img
            key={`${photo.id}-${index}`}
            src={resolveMediaUrl(photo.file) ?? undefined}
            alt={photo.caption ?? `${title} ${index + 1}`}
            className="h-16 w-full rounded-lg border border-[#E5E7EB] object-cover"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2563EB]">{title}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function InterventionReport({ intervention }: { intervention: ManagementInterventionResponse }) {
  const finalReport = asRecord(intervention.final_report)
  const vehicle = asRecord(finalReport.vehicle)
  const checkIn = asRecord(finalReport.check_in)
  const work = asRecord(finalReport.work)
  const checkOut = asRecord(finalReport.check_out)
  const estimatedCost = asText(finalReport.estimated_cost ?? intervention.estimated_cost)
  const checkInPhotos = getInspectionPhotos(intervention.check_in)
  const checkOutPhotos = getInspectionPhotos(intervention.check_out)
  const beforePhotos = checkInPhotos.filter(isBeforeInterventionPhoto)
  const duringPhotos = checkInPhotos.filter((photo) => !isBeforeInterventionPhoto(photo) && !isInterruptPhoto(photo))
  const finalObservations = compactJoin([asText(checkOut.conclusions), asText(checkOut.final_comment)])
  const parkingLabel = compactJoin([asText(vehicle.parking_name), asText(vehicle.parking_space_number)])
  const assigneeLabel = intervention.assigned_to
    ? `${intervention.assigned_to.first_name} ${intervention.assigned_to.last_name}`.trim() || intervention.assigned_to.email
    : asText(finalReport.assignee)
  const hasFinalReport = Object.keys(finalReport).length > 0

  if (!hasFinalReport) {
    return <p className="text-sm text-slate-600">Aucun rapport final disponible.</p>
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <ReportSection title="Résumé intervention">
        <ReportField label="Véhicule" value={`${asText(vehicle.brand) ?? intervention.vehicle.brand} ${asText(vehicle.model_name) ?? intervention.vehicle.model_name}`} />
        <ReportField label="Immatriculation" value={asText(vehicle.registration_number) ?? intervention.vehicle.registration_number} />
        <ReportField label="Intervenant" value={assigneeLabel} />
        <ReportField label="Type d'intervention" value={formatInterventionType(finalReport.intervention_type ?? intervention.intervention_type)} />
        <ReportField label="Motif / consigne" value={asText(finalReport.description) ?? intervention.description} />
        <ReportField label="Date début" value={formatDateTime(finalReport.started_at)} />
        <ReportField label="Date fin" value={formatDateTime(finalReport.completed_at)} />
        <ReportField label="Parking / place" value={parkingLabel} />
      </ReportSection>

      <ReportSection title="Check-in">
        <ReportField label="Kilométrage initial" value={checkIn.mileage} />
        <ReportField label="Observations" value={checkIn.observations} />
        <ReportPhotos title="Photos avant intervention" photos={beforePhotos} />
      </ReportSection>

      <ReportSection title="Travail effectué">
        <ReportField label="Travail effectué" value={work.cleaning_work ?? work.diagnostic ?? work.repairs_done} />
        <ReportField label="Anomalie éventuelle" value={formatAnomalyType(work.anomaly_type)} />
        <ReportField label="Commentaire anomalie" value={work.anomaly_comment} />
        <ReportField label="Coût éventuel" value={estimatedCost ? `${estimatedCost} EUR` : null} />
        <ReportPhotos title="Photos pendant intervention" photos={duringPhotos} />
      </ReportSection>

      <ReportSection title="Check-out">
        <ReportField label="Kilométrage final" value={checkOut.mileage} />
        <ReportField label="État final" value={checkOut.final_vehicle_state ?? checkOut.observations} />
        <ReportField label="Véhicule opérationnel" value={asBooleanLabel(checkOut.vehicle_operational)} />
        <ReportField label="Véhicule propre" value={asBooleanLabel(checkOut.vehicle_clean)} />
        <ReportField label="Nouvelle intervention nécessaire" value={asBooleanLabel(checkOut.new_intervention_needed)} />
        <ReportField label="Observations finales" value={finalObservations} />
        <ReportPhotos title="Photos après intervention" photos={checkOutPhotos} />
      </ReportSection>
    </div>
  )
}

function VehicleMobileCard({ vehicle, operationalState, onPlanIntervention, onToggleActive, basePath, statusForm, validationPanel }: VehicleCardProps) {
  const planningEnabled = canPlanIntervention(vehicle, operationalState)
  const registrationNumber = getRegistrationNumber(vehicle)
  const mainPhotoUrl = resolveMediaUrl(vehicle.main_photo?.file)

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          {mainPhotoUrl ? (
            <img
              src={mainPhotoUrl}
              alt={`${vehicle.brand} ${vehicle.model_name}`}
              className="h-20 w-28 rounded-2xl border border-[#E5E7EB] object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-20 w-28 items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-xs font-medium text-slate-500">
              Pas de photo
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[#0F172A]">
              {vehicle.brand} {vehicle.model_name}
            </p>
            <p className="text-sm text-slate-500">{vehicle.category}</p>
            <div className="mt-2">
              <OperationalStateDisplay state={operationalState} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-[#1F2937]">
          <p className="col-span-2"><span className="text-slate-500">Parking / place :</span> {getParkingLabel(vehicle)}</p>
          {registrationNumber ? (
            <p className="col-span-2"><span className="text-slate-500">Immatriculation :</span> {registrationNumber}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`${basePath}/vehicles/${vehicle.id}/edit`}>
            <Button variant="secondary" size="sm">Modifier</Button>
          </Link>
          <Button variant="secondary" size="sm" disabled={!planningEnabled} onClick={() => onPlanIntervention(vehicle)}>Planifier une intervention</Button>
          <Button variant={vehicle.is_active ? 'danger' : 'success'} className={vehicle.is_active ? 'min-w-[10.5rem] whitespace-nowrap border border-[#EF4444] bg-[#FCA5A5] text-[#111111] hover:bg-[#F87171]' : 'min-w-[10.5rem] whitespace-nowrap border border-[#22C55E] bg-[#86EFAC] text-[#111111] hover:bg-[#4ADE80]'} size="sm" onClick={() => onToggleActive(vehicle)}>{vehicle.is_active ? 'Retirer du service' : 'Réactiver'}</Button>
        </div>
        {statusForm ? <div className="pt-2">{statusForm}</div> : null}
        {validationPanel ? <div className="pt-2">{validationPanel}</div> : null}
      </div>
    </Card>
  )
}

function VehicleDesktopRow({ vehicle, operationalState, onPlanIntervention, onToggleActive, basePath, statusForm, validationPanel }: VehicleCardProps) {
  const planningEnabled = canPlanIntervention(vehicle, operationalState)
  const registrationNumber = getRegistrationNumber(vehicle)
  const mainPhotoUrl = resolveMediaUrl(vehicle.main_photo?.file)

  return (
    <>
    <tr className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB]">
      <td className="px-4 py-3">
        {mainPhotoUrl ? (
          <img
            src={mainPhotoUrl}
            alt={`${vehicle.brand} ${vehicle.model_name}`}
            className="h-14 w-20 rounded-xl border border-[#E5E7EB] object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-14 w-20 items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-xs text-slate-500">
            Sans photo
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">
        <p className="whitespace-nowrap font-medium">{vehicle.brand} {vehicle.model_name}</p>
        <p className="text-slate-500">{vehicle.category}</p>
      </td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">{registrationNumber ?? '—'}</td>
      <td className="px-4 py-3">
        <OperationalStateDisplay state={operationalState} compact />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-[#1F2937]">
        {getParkingLabel(vehicle)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-nowrap gap-2">
          <Link to={`${basePath}/vehicles/${vehicle.id}/edit`}>
            <Button variant="secondary" size="sm">Modifier</Button>
          </Link>
          <Button variant="secondary" size="sm" disabled={!planningEnabled} onClick={() => onPlanIntervention(vehicle)}>Planifier une intervention</Button>
          <Button variant={vehicle.is_active ? 'danger' : 'success'} className={vehicle.is_active ? 'min-w-[10.5rem] whitespace-nowrap border border-[#EF4444] bg-[#FCA5A5] text-[#111111] hover:bg-[#F87171]' : 'min-w-[10.5rem] whitespace-nowrap border border-[#22C55E] bg-[#86EFAC] text-[#111111] hover:bg-[#4ADE80]'} size="sm" onClick={() => onToggleActive(vehicle)}>{vehicle.is_active ? 'Retirer du service' : 'Réactiver'}</Button>
        </div>
      </td>
    </tr>
    {statusForm ? (
      <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
        <td colSpan={6} className="px-4 py-4">
          {statusForm}
        </td>
      </tr>
    ) : null}
    {validationPanel ? (
      <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
        <td colSpan={6} className="px-4 py-4">
          {validationPanel}
        </td>
      </tr>
    ) : null}
    </>
  )
}

function getStatusSubmitError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur inattendue est survenue.'
  }

  if (!error.response) {
    return 'Erreur reseau: impossible de contacter le serveur.'
  }

  if (error.response.status === 403) {
    return 'Vous n\'avez pas les permissions pour changer le statut de ce vehicule.'
  }

  if (error.response.status === 404) {
    return 'Le vehicule est introuvable ou a ete supprime.'
  }

  const payload = error.response.data as { detail?: unknown; status?: unknown; non_field_errors?: unknown } | undefined

  if (Array.isArray(payload?.status) && payload.status.length > 0) {
    return String(payload.status[0])
  }

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload?.non_field_errors) && payload.non_field_errors.length > 0) {
    return String(payload.non_field_errors[0])
  }

  return 'Impossible de changer le statut pour le moment.'
}

export default function ManagerVehiclesPage({ basePath = '/manager' }: ManagerVehiclesPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [selectedVehicle, setSelectedVehicle] = useState<ManagementVehicleListItem | null>(null)
  const [planningType, setPlanningType] = useState<'MAINTENANCE' | 'NETTOYAGE'>('MAINTENANCE')
  const [selectedValidation, setSelectedValidation] = useState<SelectedValidation | null>(null)
  const [validationDecision, setValidationDecision] = useState<ManagerDecision>('DISPONIBLE')
  const [validationReason, setValidationReason] = useState('')
  const [validationAssigneeId, setValidationAssigneeId] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [statusApiError, setStatusApiError] = useState<string | null>(null)
  const [statusConflict, setStatusConflict] = useState<InterventionPlanningConflictReservation | null>(null)
  const [statusSuccessMessage, setStatusSuccessMessage] = useState<string | null>(null)

  const state = location.state as { successMessage?: string } | null
  const successMessage = state?.successMessage

  const vehiclesQuery = useQuery({
    queryKey: ['manager-vehicles', page],
    queryFn: () => getManagementVehicles(page),
  })

  const assigneesQuery = useQuery({
    queryKey: ['manager-intervention-assignees'],
    queryFn: getManagementInterventionAssignees,
    enabled: selectedVehicle !== null || selectedValidation !== null,
  })

  const interventionsQuery = useQuery({
    queryKey: ['manager-interventions'],
    queryFn: () => getManagementInterventions({ ordering: '-created_at' }),
  })

  const reservationsQuery = useQuery({
    queryKey: ['manager-reservations', 'fleet-state'],
    queryFn: () => getManagementReservations({ page_size: 100, ordering: 'start_at' }),
  })

  const vehicles = useMemo(() => vehiclesQuery.data?.results ?? [], [vehiclesQuery.data?.results])
  const interventions = useMemo(() => interventionsQuery.data?.results ?? [], [interventionsQuery.data?.results])
  const reservations = useMemo(() => reservationsQuery.data?.results ?? [], [reservationsQuery.data?.results])

  const statusMutation = useMutation({
    mutationFn: ({ vehicleId, payload }: { vehicleId: number; payload: VehicleManagementStatusUpdateRequest }) =>
      updateVehicleStatus(vehicleId, payload),
  })

  const planInterventionMutation = useMutation({ mutationFn: planManagementIntervention })

  const validationStatusMutation = useMutation({
    mutationFn: ({ vehicleId, status }: { vehicleId: number; status: VehicleManagementStatus }) =>
      updateVehicleStatus(vehicleId, { status }),
  })

  const relaunchInterventionMutation = useMutation({
    mutationFn: createManagementIntervention,
  })

  const relaunchAssignMutation = useMutation({
    mutationFn: ({ id, assignedUserId }: { id: number; assignedUserId: number }) =>
      assignManagementIntervention(id, { assigned_user_id: assignedUserId }),
  })

  const totalPages = useMemo(() => {
    if (!vehiclesQuery.data || vehiclesQuery.data.count === 0) {
      return 1
    }

    return Math.ceil(vehiclesQuery.data.count / vehicles.length)
  }, [vehicles.length, vehiclesQuery.data])

  const validationAssignees = useMemo(() => {
    if (!selectedValidation) {
      return []
    }
    const assignees = Array.isArray(assigneesQuery.data) ? assigneesQuery.data : []
    const expectedRole = selectedValidation.validation.interventionType === 'MECANIQUE' ? 'MECANICIEN' : 'NETTOYEUR'
    return assignees.filter((assignee) => assignee.role === expectedRole)
  }, [assigneesQuery.data, selectedValidation])

  const handleOpenPlanningForm = (vehicle: ManagementVehicleListItem) => {
    setSelectedVehicle(vehicle)
    setPlanningType('MAINTENANCE')
    setStatusApiError(null)
    setStatusConflict(null)
    setStatusSuccessMessage(null)
  }

  const handleToggleActive = async (vehicle: ManagementVehicleListItem) => {
    setStatusApiError(null)
    try {
      await updateVehicle(vehicle.id, { is_active: !vehicle.is_active })
      await queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] })
    } catch (error) {
      setStatusApiError(getStatusSubmitError(error))
    }
  }

  const handleOpenValidation = (selection: SelectedValidation) => {
    setSelectedValidation(selection)
    setSelectedVehicle(null)
    setValidationDecision('DISPONIBLE')
    setValidationReason('')
    setValidationAssigneeId('')
    setValidationError(null)
  }

  const handleSubmitStatus = async (payload: VehicleManagementStatusUpdateRequest & {
    assigned_user_id?: number
    planned_start_at?: string
    planned_end_at?: string
  }) => {
    if (!selectedVehicle) {
      return
    }

    const interventionType = payload.status === 'MAINTENANCE'
      ? 'MECANIQUE'
      : payload.status === 'NETTOYAGE'
        ? 'NETTOYAGE'
        : null

    if (interventionType && (!payload.assigned_user_id || !payload.planned_start_at || !payload.planned_end_at || !payload.reason)) {
      setStatusApiError('L’intervenant, la période prévue et le motif sont obligatoires.')
      return
    }

    setStatusApiError(null)
    setStatusConflict(null)
    setStatusSuccessMessage(null)

    try {
      let assignedInterventionReference: string | null = null
      let updatedStatus = payload.status

      if (interventionType && payload.assigned_user_id && payload.planned_start_at && payload.planned_end_at) {
        const intervention = await planInterventionMutation.mutateAsync({
          vehicle_id: selectedVehicle.id,
          type: interventionType,
          assigned_user_id: payload.assigned_user_id,
          planned_start_at: payload.planned_start_at,
          planned_end_at: payload.planned_end_at,
          description: payload.reason ?? '',
        })
        assignedInterventionReference = intervention.reference
      } else {
        const updatedVehicle = await statusMutation.mutateAsync({
          vehicleId: selectedVehicle.id,
          payload: { status: payload.status, reason: payload.reason },
        })
        updatedStatus = updatedVehicle.public_status as VehicleManagementStatus
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-edit', selectedVehicle.id] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-photos', selectedVehicle.id] }),
        queryClient.invalidateQueries({ queryKey: ['manager-interventions'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-interventions-assigned'] }),
        queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] }),
        queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] }),
      ])

      const updatedStatusUi = mapStatusToUi(updatedStatus)
      setStatusSuccessMessage(
        assignedInterventionReference
          ? `Nouveau statut enregistré: ${updatedStatusUi.label}. Intervention ${assignedInterventionReference} assignée.`
          : `Nouveau statut enregistré: ${updatedStatusUi.label}.`,
      )
      setSelectedVehicle(null)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { code?: unknown; detail?: unknown; reservation?: unknown; intervention?: unknown } | undefined
        if (data?.code === 'RESERVATION_CONFLICT' && data.reservation && typeof data.reservation === 'object') {
          setStatusConflict(data.reservation as InterventionPlanningConflictReservation)
          setStatusApiError(null)
          return
        }
        if (data?.code === 'INTERVENTION_CONFLICT' && data.intervention && typeof data.intervention === 'object') {
          const conflict = data.intervention as { planned_start_at?: string; planned_end_at?: string; reference?: string }
          setStatusApiError(
            `${data.detail ?? 'Créneau indisponible'}${conflict.reference ? ` (${conflict.reference})` : ''}`
              + (conflict.planned_start_at && conflict.planned_end_at ? ` ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(conflict.planned_start_at))} → ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(conflict.planned_end_at))}` : ''),
          )
          return
        }
        if (typeof data?.detail === 'string' && data.detail.trim()) {
          setStatusApiError(data.detail)
          return
        }
      }
      setStatusApiError(getStatusSubmitError(error))
    }
  }

  const handleSubmitValidationDecision = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedValidation) {
      return
    }

    setValidationError(null)

    try {
      if (validationDecision === 'RELANCER') {
        const assignedUserId = Number(validationAssigneeId)
        if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) {
          setValidationError('Veuillez sélectionner une personne à affecter.')
          return
        }
        if (!validationReason.trim()) {
          setValidationError('Le motif est obligatoire pour relancer une intervention.')
          return
        }

        const intervention = await relaunchInterventionMutation.mutateAsync({
          vehicle_id: selectedValidation.vehicle.id,
          reservation_id: null,
          type: selectedValidation.validation.interventionType,
          description: validationReason.trim(),
        })
        await relaunchAssignMutation.mutateAsync({ id: intervention.id, assignedUserId })
        setStatusSuccessMessage(
          selectedValidation.validation.interventionType === 'MECANIQUE'
            ? 'Nouvelle intervention de maintenance créée et assignée.'
            : 'Nouvelle intervention de nettoyage créée et assignée.',
        )
      } else {
        await validationStatusMutation.mutateAsync({
          vehicleId: selectedValidation.vehicle.id,
          status: validationDecision,
        })
        setStatusSuccessMessage(
          validationDecision === 'DISPONIBLE'
            ? 'Le véhicule est maintenant disponible.'
            : 'La décision du gestionnaire a été enregistrée.',
        )
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-interventions'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-interventions-assigned'] }),
        queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] }),
        queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] }),
      ])
      setSelectedValidation(null)
    } catch (error) {
      setValidationError(getStatusSubmitError(error))
    }
  }

  const renderStatusFormFor = (vehicle: ManagementVehicleListItem): ReactNode => {
    if (selectedVehicle?.id !== vehicle.id) {
      return null
    }

    return (
      <VehicleStatusForm
        key={vehicle.id}
        currentStatus={vehicle.public_status as VehicleManagementStatus}
        vehicleLabel={`${vehicle.brand} ${vehicle.model_name}${getRegistrationNumber(vehicle) ? ` · ${getRegistrationNumber(vehicle)}` : ''}`}
        assignees={assigneesQuery.data ?? []}
        isLoadingAssignees={assigneesQuery.isLoading}
        onSubmit={handleSubmitStatus}
        onCancel={() => {
          setSelectedVehicle(null)
          setStatusApiError(null)
          setStatusConflict(null)
        }}
        isSubmitting={statusMutation.isPending || planInterventionMutation.isPending}
        apiError={statusApiError}
        conflictReservation={statusConflict}
        reservationBasePath={`${basePath}/reservations`}
        forcedStatus={planningType}
        vehicleId={selectedVehicle.id}
        reservations={reservations}
        interventions={interventions}
      />
    )
  }

  const renderValidationPanelFor = (vehicle: ManagementVehicleListItem): ReactNode => {
    if (!selectedValidation || selectedValidation.vehicle.id !== vehicle.id) {
      return null
    }

    return (
      <div className="space-y-4 rounded-2xl border border-[#DCE8FF] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">Rapport intervention</p>
            <p className="mt-1 text-xs text-slate-500">{selectedValidation.validation.label}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedValidation(null)}>
            Fermer
          </Button>
        </div>

        <InterventionReport intervention={selectedValidation.validation.intervention} />

        {validationError ? <Alert variant="danger" title="Validation impossible" message={validationError} /> : null}

        <form className="space-y-4 border-t border-[#E5E7EB] pt-4" onSubmit={handleSubmitValidationDecision}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]" htmlFor={`manager-validation-decision-${vehicle.id}`}>
                Décision du gestionnaire
              </label>
              <select
                id={`manager-validation-decision-${vehicle.id}`}
                value={validationDecision}
                onChange={(event) => setValidationDecision(event.target.value as ManagerDecision)}
                className="block h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              >
                <option value="DISPONIBLE">Remettre disponible</option>
                <option value="A_CONTROLER">À contrôler</option>
                <option value="INDISPONIBLE">Indisponible</option>
                <option value="RELANCER">{selectedValidation.validation.interventionType === 'MECANIQUE' ? 'Relancer une maintenance' : 'Relancer un nettoyage'}</option>
              </select>
            </div>

            {validationDecision === 'RELANCER' ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#1F2937]" htmlFor={`manager-validation-assignee-${vehicle.id}`}>
                  {selectedValidation.validation.interventionType === 'MECANIQUE' ? 'Mécanicien affecté' : 'Agent de nettoyage affecté'}
                </label>
                <select
                  id={`manager-validation-assignee-${vehicle.id}`}
                  value={validationAssigneeId}
                  onChange={(event) => setValidationAssigneeId(event.target.value)}
                  className="block h-12 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Sélectionner</option>
                  {validationAssignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {`${assignee.first_name} ${assignee.last_name}`.trim() || assignee.email}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {validationDecision === 'RELANCER' ? (
            <Input
              label="Motif"
              value={validationReason}
              onChange={(event) => setValidationReason(event.target.value)}
              placeholder={selectedValidation.validation.interventionType === 'MECANIQUE' ? 'Motif de la nouvelle maintenance' : 'Motif du nouveau nettoyage'}
            />
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSelectedValidation(null)}>
              Annuler
            </Button>
            <Button type="submit" disabled={validationStatusMutation.isPending || relaunchInterventionMutation.isPending || relaunchAssignMutation.isPending}>
              Confirmer la décision
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold text-[#0F172A]">Gestion des véhicules</h1>

        <div className="flex flex-wrap items-center gap-3">
          <Link to={`${basePath}/vehicles/new`}>
            <Button>Ajouter un véhicule</Button>
          </Link>
          <Button variant="secondary" onClick={() => navigate('/')}>Retour</Button>
        </div>
      </div>

      {successMessage ? (
        <Alert
          variant="success"
          title="Operation reussie"
          message={
            <div className="flex items-center justify-between gap-3">
              <span>{successMessage}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(location.pathname, { replace: true, state: null })}
              >
                Fermer
              </Button>
            </div>
          }
        />
      ) : null}

      {statusSuccessMessage ? (
        <Alert variant="success" title="Statut mis a jour" message={statusSuccessMessage} />
      ) : null}

      {vehiclesQuery.isLoading ? (
        <div className="flex min-h-[35vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des véhicules" />
        </div>
      ) : null}

      {vehiclesQuery.isError ? (
        <Alert
          variant="danger"
          title="Erreur de chargement"
          message={
            <div className="flex flex-col gap-3">
              <span>Impossible de charger la liste des véhicules.</span>
              <div>
                <Button variant="danger" size="sm" onClick={() => void vehiclesQuery.refetch()}>
                  Réessayer
                </Button>
              </div>
            </div>
          }
        />
      ) : null}

      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && vehicles.length === 0 ? (
        <EmptyState
          title="Aucun véhicule"
          description="Aucun véhicule n’est actuellement enregistré dans la flotte."
          action={
            <Button variant="secondary" size="sm" onClick={() => void vehiclesQuery.refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : null}

      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && vehicles.length > 0 ? (
        <>
          <div className="flex flex-col gap-4 lg:hidden">
            {vehicles.map((vehicle) => {
              const pendingValidation = getPendingValidation(vehicle, interventions)
              const operationalState = getOperationalState(vehicle, interventions, reservations, pendingValidation)
              return (
                <VehicleMobileCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  pendingValidation={pendingValidation}
                  operationalState={operationalState}
                  onPlanIntervention={handleOpenPlanningForm}
                  onToggleActive={handleToggleActive}
                  onOpenValidation={handleOpenValidation}
                  basePath={basePath}
                  statusForm={renderStatusFormFor(vehicle)}
                  validationPanel={renderValidationPanelFor(vehicle)}
                />
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Photo</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Véhicule</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Immatriculation</th>
                  <th className="min-w-[8.5rem] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">État actuel</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Parking / place</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => {
                  const pendingValidation = getPendingValidation(vehicle, interventions)
                  const operationalState = getOperationalState(vehicle, interventions, reservations, pendingValidation)
                  return (
                    <VehicleDesktopRow
                      key={vehicle.id}
                      vehicle={vehicle}
                      pendingValidation={pendingValidation}
                      operationalState={operationalState}
                      onPlanIntervention={handleOpenPlanningForm}
                      onToggleActive={handleToggleActive}
                      onOpenValidation={handleOpenValidation}
                      basePath={basePath}
                      statusForm={renderStatusFormFor(vehicle)}
                      validationPanel={renderValidationPanelFor(vehicle)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              Total: <span className="font-semibold text-[#1F2937]">{vehiclesQuery.data?.count ?? 0}</span>
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!vehiclesQuery.data?.previous || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Précédent
              </Button>
              <span className="text-sm font-medium text-slate-700">Page {page} / {totalPages}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!vehiclesQuery.data?.next}
                onClick={() => setPage((current) => current + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
