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
} from '../../services/managementInterventionService'
import { updateVehicleStatus } from '../../services/managementVehicleService'
import { getVehicles } from '../../services/vehicleService'
import type { InterventionType, ManagementInterventionResponse } from '../../types/managementIntervention'
import type { VehicleManagementStatus, VehicleManagementStatusUpdateRequest } from '../../types/managementVehicle'
import type { PaginatedResponse, PublicVehicle } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'

interface ManagerVehiclesPageProps {
  basePath?: string
}

type StatusFilter = 'all' | VehicleManagementStatus

type VehicleWithOptionalRegistration = PublicVehicle & {
  registration_number?: string | null
}

type ManagerDecision = 'DISPONIBLE' | 'A_CONTROLER' | 'INDISPONIBLE' | 'RELANCER'

interface PendingValidation {
  intervention: ManagementInterventionResponse
  interventionType: InterventionType
  label: string
}

interface SelectedValidation {
  vehicle: PublicVehicle
  validation: PendingValidation
}

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'DISPONIBLE', label: 'Disponible' },
  { value: 'RESERVE', label: 'Réservé' },
  { value: 'LOUE', label: 'Loué' },
  { value: 'A_CONTROLER', label: 'À contrôler' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'NETTOYAGE', label: 'Nettoyage' },
  { value: 'ACCIDENTE', label: 'Accidenté' },
  { value: 'INDISPONIBLE', label: 'Indisponible' },
]

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

function expectedInterventionTypeForVehicle(status: string): InterventionType | null {
  const normalized = status.trim().toUpperCase()
  if (normalized === 'MAINTENANCE') {
    return 'MECANIQUE'
  }
  if (normalized === 'NETTOYAGE') {
    return 'NETTOYAGE'
  }
  return null
}

function getPendingValidation(vehicle: PublicVehicle, interventions: ManagementInterventionResponse[]): PendingValidation | null {
  const interventionType = expectedInterventionTypeForVehicle(vehicle.public_status)
  if (!interventionType) {
    return null
  }

  const latest = interventions.find((intervention) => (
    intervention.vehicle.id === vehicle.id
    && intervention.intervention_type === interventionType
  ))

  if (!latest || latest.status !== 'TERMINEE') {
    return null
  }

  return {
    intervention: latest,
    interventionType,
    label: interventionType === 'MECANIQUE' ? 'Maintenance terminée — à valider' : 'Nettoyage terminé — à valider',
  }
}

function formatPricePerDay(amount: string): string {
  const numericValue = Number(amount)

  if (Number.isNaN(numericValue)) {
    return `${amount} EUR / jour`
  }

  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue)} EUR / jour`
}

function getRegistrationNumber(vehicle: PublicVehicle): string | null {
  if (!('registration_number' in vehicle)) {
    return null
  }

  const registration = (vehicle as VehicleWithOptionalRegistration).registration_number

  if (typeof registration === 'string' && registration.trim().length > 0) {
    return registration
  }

  return null
}

function toPaginationPayload(payload: Awaited<ReturnType<typeof getVehicles>>): PaginatedResponse<PublicVehicle> {
  if (Array.isArray(payload)) {
    return {
      count: payload.length,
      next: null,
      previous: null,
      results: payload,
    }
  }

  return payload
}

interface VehicleCardProps {
  vehicle: PublicVehicle
  pendingValidation: PendingValidation | null
  onChangeStatus: (vehicle: PublicVehicle) => void
  onOpenValidation: (selection: SelectedValidation) => void
  basePath: string
  statusForm?: ReactNode
  validationPanel?: ReactNode
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

function VehicleMobileCard({ vehicle, pendingValidation, onChangeStatus, onOpenValidation, basePath, statusForm, validationPanel }: VehicleCardProps) {
  const statusUi = pendingValidation ? { label: pendingValidation.label, variant: 'warning' as const } : mapStatusToUi(vehicle.public_status)
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
              <StatusBadge variant={statusUi.variant} label={statusUi.label} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-[#1F2937]">
          <p><span className="text-slate-500">Année :</span> {vehicle.year}</p>
          <p><span className="text-slate-500">Prix :</span> {formatPricePerDay(vehicle.category_daily_rate)}</p>
          <p><span className="text-slate-500">Parking :</span> {vehicle.parking_name ?? '—'}</p>
          <p><span className="text-slate-500">Place :</span> {vehicle.parking_space_number ?? '—'}</p>
          {registrationNumber ? (
            <p className="col-span-2"><span className="text-slate-500">Immatriculation :</span> {registrationNumber}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`${basePath}/vehicles/${vehicle.id}/edit`}>
            <Button variant="secondary" size="sm">Modifier</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => onChangeStatus(vehicle)}>Changer le statut</Button>
          {pendingValidation ? (
            <Button variant="primary" size="sm" onClick={() => onOpenValidation({ vehicle, validation: pendingValidation })}>
              Voir le rapport / Valider
            </Button>
          ) : null}
        </div>
        {statusForm ? <div className="pt-2">{statusForm}</div> : null}
        {validationPanel ? <div className="pt-2">{validationPanel}</div> : null}
      </div>
    </Card>
  )
}

function VehicleDesktopRow({ vehicle, pendingValidation, onChangeStatus, onOpenValidation, basePath, statusForm, validationPanel }: VehicleCardProps) {
  const statusUi = pendingValidation ? { label: pendingValidation.label, variant: 'warning' as const } : mapStatusToUi(vehicle.public_status)
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
        <p className="font-medium">{vehicle.brand} {vehicle.model_name}</p>
        <p className="text-slate-500">{vehicle.category}</p>
      </td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">{vehicle.year}</td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">{registrationNumber ?? '—'}</td>
      <td className="px-4 py-3">
        <StatusBadge variant={statusUi.variant} label={statusUi.label} />
      </td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">{formatPricePerDay(vehicle.category_daily_rate)}</td>
      <td className="px-4 py-3 text-sm text-[#1F2937]">
        <p>{vehicle.parking_name ?? '—'}</p>
        <p className="text-slate-500">Place: {vehicle.parking_space_number ?? '—'}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Link to={`${basePath}/vehicles/${vehicle.id}/edit`}>
            <Button variant="secondary" size="sm">Modifier</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => onChangeStatus(vehicle)}>Changer le statut</Button>
          {pendingValidation ? (
            <Button variant="primary" size="sm" onClick={() => onOpenValidation({ vehicle, validation: pendingValidation })}>
              Voir le rapport / Valider
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
    {statusForm ? (
      <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
        <td colSpan={8} className="px-4 py-4">
          {statusForm}
        </td>
      </tr>
    ) : null}
    {validationPanel ? (
      <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
        <td colSpan={8} className="px-4 py-4">
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
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedVehicle, setSelectedVehicle] = useState<PublicVehicle | null>(null)
  const [selectedValidation, setSelectedValidation] = useState<SelectedValidation | null>(null)
  const [validationDecision, setValidationDecision] = useState<ManagerDecision>('DISPONIBLE')
  const [validationReason, setValidationReason] = useState('')
  const [validationAssigneeId, setValidationAssigneeId] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [statusApiError, setStatusApiError] = useState<string | null>(null)
  const [statusSuccessMessage, setStatusSuccessMessage] = useState<string | null>(null)

  const state = location.state as { successMessage?: string } | null
  const successMessage = state?.successMessage

  const vehiclesQuery = useQuery({
    queryKey: ['manager-vehicles', page, searchQuery, statusFilter],
    queryFn: async () => {
      const payload = await getVehicles({
        page,
        search: searchQuery.trim().length > 0 ? searchQuery.trim() : undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        ordering: '-id',
      })

      return toPaginationPayload(payload)
    },
  })

  const assigneesQuery = useQuery({
    queryKey: ['manager-intervention-assignees'],
    queryFn: getManagementInterventionAssignees,
    enabled: selectedVehicle !== null || selectedValidation !== null,
  })

  const interventionsQuery = useQuery({
    queryKey: ['manager-interventions'],
    queryFn: () => getManagementInterventions(),
  })

  const vehicles = useMemo(() => vehiclesQuery.data?.results ?? [], [vehiclesQuery.data?.results])
  const interventions = useMemo(() => interventionsQuery.data?.results ?? [], [interventionsQuery.data?.results])

  const statusMutation = useMutation({
    mutationFn: ({ vehicleId, payload }: { vehicleId: number; payload: VehicleManagementStatusUpdateRequest }) =>
      updateVehicleStatus(vehicleId, payload),
  })

  const createInterventionMutation = useMutation({
    mutationFn: createManagementIntervention,
  })

  const assignInterventionMutation = useMutation({
    mutationFn: ({ id, assignedUserId }: { id: number; assignedUserId: number }) =>
      assignManagementIntervention(id, { assigned_user_id: assignedUserId }),
  })

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

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput)
  }

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as StatusFilter)
    setPage(1)
  }

  const handleOpenStatusForm = (vehicle: PublicVehicle) => {
    setSelectedVehicle(vehicle)
    setStatusApiError(null)
    setStatusSuccessMessage(null)
  }

  const handleOpenValidation = (selection: SelectedValidation) => {
    setSelectedValidation(selection)
    setSelectedVehicle(null)
    setValidationDecision('DISPONIBLE')
    setValidationReason('')
    setValidationAssigneeId('')
    setValidationError(null)
  }

  const handleSubmitStatus = async (payload: VehicleManagementStatusUpdateRequest & { assigned_user_id?: number }) => {
    if (!selectedVehicle) {
      return
    }

    const interventionType = payload.status === 'MAINTENANCE'
      ? 'MECANIQUE'
      : payload.status === 'NETTOYAGE'
        ? 'NETTOYAGE'
        : null

    if (interventionType && !payload.assigned_user_id) {
      setStatusApiError('Veuillez sélectionner une personne à affecter.')
      return
    }

    setStatusApiError(null)
    setStatusSuccessMessage(null)

    try {
      const statusPayload: VehicleManagementStatusUpdateRequest = {
        status: payload.status,
        reason: payload.reason,
      }
      const updatedVehicle = await statusMutation.mutateAsync({
        vehicleId: selectedVehicle.id,
        payload: statusPayload,
      })

      let assignedInterventionReference: string | null = null

      if (interventionType && payload.assigned_user_id) {
        const intervention = await createInterventionMutation.mutateAsync({
          vehicle_id: selectedVehicle.id,
          reservation_id: null,
          type: interventionType,
          description: payload.reason ?? '',
        })
        const assignedIntervention = await assignInterventionMutation.mutateAsync({
          id: intervention.id,
          assignedUserId: payload.assigned_user_id,
        })
        assignedInterventionReference = assignedIntervention.reference
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

      const updatedStatusUi = mapStatusToUi(updatedVehicle.public_status)
      setStatusSuccessMessage(
        assignedInterventionReference
          ? `Nouveau statut enregistré: ${updatedStatusUi.label}. Intervention ${assignedInterventionReference} assignée.`
          : `Nouveau statut enregistré: ${updatedStatusUi.label}.`,
      )
      setSelectedVehicle(null)
    } catch (error) {
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

  const renderStatusFormFor = (vehicle: PublicVehicle): ReactNode => {
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
        }}
        isSubmitting={statusMutation.isPending || createInterventionMutation.isPending || assignInterventionMutation.isPending}
        apiError={statusApiError}
      />
    )
  }

  const renderValidationPanelFor = (vehicle: PublicVehicle): ReactNode => {
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
        <div>
          <h1 className="text-3xl font-semibold text-[#0F172A]">Gestion des véhicules</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Gérez la flotte et l'état des véhicules AutoRental.
          </p>
        </div>

        <Link to={`${basePath}/vehicles/new`}>
          <Button>Ajouter un véhicule</Button>
        </Link>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-[1fr_260px_auto] md:items-end">
          <form onSubmit={handleSearchSubmit} className="contents">
            <Input
              type="search"
              label="Rechercher"
              placeholder="Marque ou modèle"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />

            <div className="space-y-2">
              <label htmlFor="vehicle-status-filter" className="block text-sm font-medium text-[#1F2937]">
                Statut
              </label>
              <select
                id="vehicle-status-filter"
                value={statusFilter}
                onChange={handleStatusChange}
                className="block h-12.5 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" className="w-full md:w-auto">Rechercher</Button>
          </form>
        </div>
      </Card>

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
              return (
                <VehicleMobileCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  pendingValidation={pendingValidation}
                  onChangeStatus={handleOpenStatusForm}
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
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Année</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Immatriculation</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Prix journalier</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Parking / place</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => {
                  const pendingValidation = getPendingValidation(vehicle, interventions)
                  return (
                    <VehicleDesktopRow
                      key={vehicle.id}
                      vehicle={vehicle}
                      pendingValidation={pendingValidation}
                      onChangeStatus={handleOpenStatusForm}
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
