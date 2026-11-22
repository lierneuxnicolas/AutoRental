import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft, CarFront, Camera, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/ui/StatusBadge'
import ReservationReassignmentPanel from '../../components/reservations/ReservationReassignmentPanel'
import { getInvoiceDownload } from '../../services/invoiceService'
import {
  getManagementReservationById,
  settleManagementReservationDeposit,
  updateManagementAdditionalCharges,
  validateManagementReservationReturn,
} from '../../services/managementReservationService'
import type {
  ManagementInspection,
  ReservationAdditionalChargeType,
  ManagementReservationStatus,
  ReservationCancellationSource,
  ReservationDepositSettlementResponse,
  ReservationManagementClientSummary,
  ReservationManagementVehicleSummary,
} from '../../types/managementReservation'
import type { InspectionPhoto, PhotoType } from '../../types/inspection'
import { resolveMediaUrl } from '../../utils/media'

interface ManagerReservationDetailPageProps {
  basePath?: string
}

function getReservationStatusLabel(
  status: ManagementReservationStatus,
  cancellationSource: ReservationCancellationSource | null,
): string {
  switch (status) {
    case 'BROUILLON':
      return 'Réservation en brouillon'
    case 'EN_ATTENTE_CAUTION':
      return 'Réservation en attente de caution'
    case 'EN_ATTENTE_PAIEMENT':
      return 'Réservation en attente de paiement'
    case 'CONFIRMEE':
      return 'Réservation confirmée'
    case 'REAFFECTATION_REQUIRED':
      return 'Réservation à réaffecter'
    case 'EN_COURS':
      return 'Réservation en cours'
    case 'A_CONTROLER':
      return 'Réservation à contrôler'
    case 'TERMINEE':
      return 'Réservation terminée'
    case 'NON_UTILISEE':
      return 'Réservation non utilisée'
    case 'ANNULEE':
      if (cancellationSource === 'CLIENT') return 'Annulée par le client'
      if (cancellationSource === 'GESTIONNAIRE') return 'Annulée par le gestionnaire'
      return 'Réservation annulée'
    case 'PAIEMENT_ECHOUE':
      return 'Réservation au paiement échoué'
  }
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatNullableNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${value}${suffix}`
}

function formatGeneralCondition(value: ManagementInspection['general_condition']): string {
  switch (value) {
    case 'BON':
      return 'Bon'
    case 'A_SURVEILLER':
      return 'À surveiller'
    case 'MAUVAIS':
      return 'Mauvais'
    default:
      return 'Non renseigné'
  }
}

function toErrorState(error: unknown): { title: string; message: string } {
  if (!axios.isAxiosError(error)) {
    return {
      title: 'Chargement impossible',
      message: 'Une erreur inattendue est survenue. Veuillez reessayer.',
    }
  }

  if (error.response?.status === 403) {
    return {
      title: 'Acces refuse',
      message: 'Seul un gestionnaire autorise peut consulter cet ecran de controle.',
    }
  }

  if (error.response?.status === 404) {
    return {
      title: 'Retour introuvable',
      message: 'La reservation demandee est introuvable.',
    }
  }

  const data: unknown = error.response?.data
  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
    return { title: 'Action impossible', message: data.message }
  }

  return {
    title: 'Chargement impossible',
    message: 'Impossible de recuperer le retour a verifier.',
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-[#1F2937]">{value}</p>
    </div>
  )
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '—'
}

function formatClientName(client: ReservationManagementClientSummary): string {
  return displayValue(`${client.first_name} ${client.last_name}`.trim())
}

function formatCurrency(value: string | null | undefined): string {
  if (!value?.trim()) {
    return '—'
  }

  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return `${value} EUR`
  }

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)
}

function getParkingLabel(vehicle: ReservationManagementVehicleSummary): string {
  const parkingParts = [vehicle.parking_name, vehicle.parking_space_number]
    .map((part) => part?.trim())
    .filter(Boolean)

  return parkingParts.length > 0 ? parkingParts.join(' / ') : '—'
}

interface ReservationSummaryCardProps {
  vehicle: ReservationManagementVehicleSummary
  client: ReservationManagementClientSummary
  rentalAmount: string
  depositAmount: string
  startAt: string
  endAt: string
  departureInspection: ManagementInspection | null
  returnInspection: ManagementInspection | null
}

function ReservationSummaryCard({
  vehicle,
  client,
  rentalAmount,
  depositAmount,
  startAt,
  endAt,
  departureInspection,
  returnInspection,
}: ReservationSummaryCardProps) {
  const photoUrl = resolveMediaUrl(vehicle.main_photo?.file)
  const vehicleName = displayValue(`${vehicle.brand} ${vehicle.model_name}`.trim())

  return (
    <Card
      className="rounded-2xl"
      header={(
        <div className="flex items-center gap-2.5">
          <UserRound className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[#0F172A]">Réservation actuelle</h2>
        </div>
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
            {photoUrl ? (
              <img src={photoUrl} alt={vehicleName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">
                <CarFront className="h-7 w-7" aria-hidden="true" />
                <span className="sr-only">Photo indisponible</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-[#0F172A]">{vehicleName}</p>
            <p className="mt-1 break-words text-sm text-slate-500">{displayValue(vehicle.category)}</p>
            <p className="mt-1 break-words text-sm text-[#1F2937]">{displayValue(vehicle.registration_plate)}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-x-6 gap-y-5 border-t border-[#E5E7EB] pt-5 sm:grid-cols-2 lg:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <Field label="Client" value={formatClientName(client)} />
          <Field label="E-mail" value={displayValue(client.email)} />
          <Field label="Parking / Place" value={getParkingLabel(vehicle)} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Période réservée</p>
            <p className="mt-1 text-sm text-[#1F2937]">Du {formatDateTime(startAt)}</p>
            <p className="text-sm text-[#1F2937]">Au {formatDateTime(endAt)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Période réelle</p>
            <p className="mt-1 text-sm text-[#1F2937]">Départ : {formatDateTime(departureInspection?.completed_at ?? null)}</p>
            <p className="text-sm text-[#1F2937]">Retour : {formatDateTime(returnInspection?.completed_at ?? null)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Montant location" value={formatCurrency(rentalAmount)} />
            <Field label="Caution" value={formatCurrency(depositAmount)} />
          </div>
        </div>
      </div>
    </Card>
  )
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E0F2FE] text-[#0F766E]">
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[#0F172A]">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}

type PhotoComparisonSlot = {
  label: string
  photoType: PhotoType
  position?: number
}

const RETURN_COMPARISON_SLOTS: PhotoComparisonSlot[] = [
  { label: 'Avant gauche', photoType: 'AVANT' },
  { label: 'Avant droit', photoType: 'COTE_DROIT' },
  { label: 'Arrière gauche', photoType: 'COTE_GAUCHE' },
  { label: 'Arrière droit', photoType: 'ARRIERE' },
  { label: 'Tableau de bord', photoType: 'TABLEAU_DE_BORD' },
  { label: 'Sièges avant', photoType: 'INTERIEUR', position: 1 },
  { label: 'Sièges arrière', photoType: 'INTERIEUR', position: 2 },
  { label: 'Coffre', photoType: 'AUTRE', position: 1 },
]

function findPhotoBySlot(inspection: ManagementInspection | null, slot: PhotoComparisonSlot): InspectionPhoto | null {
  if (!inspection) {
    return null
  }

  return inspection.photos.find((photo) => {
    if (photo.photo_type !== slot.photoType) {
      return false
    }

    if (slot.position !== undefined) {
      return photo.position === slot.position
    }

    return true
  }) ?? null
}

interface PhotoPreview {
  src: string
  label: string
}

function InspectionPhotoThumbnail({ photo, label, inspectionTitle, onPreview }: {
  photo: InspectionPhoto | null
  label: string
  inspectionTitle: string
  onPreview: (photo: PhotoPreview) => void
}) {
  const src = resolveMediaUrl(photo?.file)

  return (
    <div className="min-w-0">
      {src ? (
        <button
          type="button"
          className="block aspect-square w-full overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
          aria-label={`Agrandir : ${inspectionTitle} — ${label}`}
          onClick={() => onPreview({ src, label: `${inspectionTitle} — ${label}` })}
        >
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        </button>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-1 text-center text-xs leading-tight text-slate-500">
          Non disponible
        </div>
      )}
      <p className="mt-1 min-h-8 text-center text-xs font-medium leading-4 text-slate-600">{label}</p>
    </div>
  )
}

function getSeverityBadge(severity: ManagementInspection['damages'][number]['severity']): { label: string; variant: 'warning' | 'danger' } {
  switch (severity) {
    case 'GRAVE':
      return { label: 'Dangereux', variant: 'danger' }
    case 'ACCEPTABLE':
      return { label: 'Acceptable', variant: 'warning' }
    case 'CRITIQUE':
      return { label: 'Critique', variant: 'danger' }
    case 'MAJEUR':
      return { label: 'Majeur', variant: 'danger' }
    case 'MODERE':
      return { label: 'Modéré', variant: 'warning' }
    case 'MINEUR':
      return { label: 'Mineur', variant: 'warning' }
  }
}

interface InspectionCardProps {
  title: string
  inspection: ManagementInspection | null
  headerClassName: string
  onPreview: (photo: PhotoPreview) => void
}

function InspectionCard({ title, inspection, headerClassName, onPreview }: InspectionCardProps) {
  const inspectionDate = inspection?.completed_at ?? inspection?.started_at ?? null
  const damages = inspection?.damages ?? []

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <header className={`border-b px-4 py-3 ${headerClassName}`}>
        <h3 className="text-base font-semibold leading-5 text-[#0F172A]">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{inspectionDate ? formatDateTime(inspectionDate) : 'Non disponible'}</p>
      </header>
      {inspection ? (
        <div className="space-y-5 p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="Kilométrage" value={formatNullableNumber(inspection?.mileage, ' km')} />
            <Field label="Carburant / énergie" value={formatNullableNumber(inspection?.energy_level_percent, ' %')} />
            <div className="col-span-2">
              <Field label="Propreté / état général" value={formatGeneralCondition(inspection?.general_condition)} />
            </div>
          </div>
          <div className="border-t border-[#E5E7EB] pt-4">
            <h4 className="text-sm font-semibold text-[#0F172A]">Photos</h4>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {RETURN_COMPARISON_SLOTS.map((slot) => (
                <InspectionPhotoThumbnail
                  key={`${slot.photoType}-${slot.position ?? 0}`}
                  photo={findPhotoBySlot(inspection, slot)}
                  label={slot.label}
                  inspectionTitle={title}
                  onPreview={onPreview}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-[#E5E7EB] pt-4">
            <h4 className="text-sm font-semibold text-[#0F172A]">Dommages déclarés</h4>
            {damages.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Aucun dommage déclaré</p>
            ) : (
              <div className="mt-3 space-y-3">
                {damages.map((damage) => {
                  const severity = getSeverityBadge(damage.severity)
                  const evidencePhoto = inspection.photos.find((photo) => damage.photo_ids.includes(photo.id)) ?? null
                  const evidencePhotoUrl = resolveMediaUrl(evidencePhoto?.file)

                  return (
                    <div key={damage.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                      <div className="flex items-start gap-3">
                        {evidencePhotoUrl ? (
                          <button
                            type="button"
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E2E8F0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
                            aria-label={`Agrandir la preuve du dommage : ${damage.description}`}
                            onClick={() => onPreview({ src: evidencePhotoUrl, label: `Preuve du dommage : ${damage.description}` })}
                          >
                            <img src={evidencePhotoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </button>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm leading-5 text-[#1F2937]">{displayValue(damage.description)}</p>
                          <div className="mt-2">
                            <StatusBadge label={severity.label} variant={severity.variant} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <p className="border-t border-[#E5E7EB] pt-4 text-sm text-[#1F2937]">
            <span className="font-semibold">Par :</span> {inspection.completed_by_name?.trim() || 'Non disponible'}
          </p>
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">Inspection non disponible</p>
      )}
    </article>
  )
}

function PhotoPreviewDialog({ photo, onClose }: { photo: PhotoPreview; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => {
      dialog?.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-label={`Aperçu : ${photo.label}`}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl backdrop:bg-slate-950/70"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="min-w-0 break-words text-base font-semibold text-[#0F172A]">{photo.label}</h3>
        <Button variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
      </div>
      <img src={photo.src} alt={photo.label} className="mx-auto mt-4 max-h-[70vh] max-w-full object-contain" />
    </dialog>
  )
}

function InspectionDifferences({ departure, returned }: {
  departure: ManagementInspection | null
  returned: ManagementInspection | null
}) {
  const startMileage = departure?.mileage
  const endMileage = returned?.mileage
  const startEnergy = departure?.energy_level_percent
  const endEnergy = returned?.energy_level_percent
  const mileageDifference = startMileage != null && endMileage != null ? endMileage - startMileage : null
  const energyDifference = startEnergy != null && endEnergy != null ? endEnergy - startEnergy : null
  const condition = departure?.general_condition && returned?.general_condition
    ? `${formatGeneralCondition(departure.general_condition)} → ${formatGeneralCondition(returned.general_condition)}`
    : 'Comparaison indisponible'
  const damageComparison = !departure || !returned
    ? 'Comparaison indisponible'
    : returned.damages.length === 0
      ? 'Aucun dommage déclaré au retour'
      : `${returned.damages.length} dommage${returned.damages.length > 1 ? 's déclarés' : ' déclaré'} au retour — comparaison manuelle nécessaire`

  return (
    <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
      <h3 className="text-base font-semibold text-[#0F172A]">Différences départ / retour</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Kilomètres parcourus" value={mileageDifference === null ? 'Indisponible' : mileageDifference < 0 ? `${mileageDifference} km — écart à vérifier` : `${mileageDifference} km`} />
        <Field label="Différence de carburant / énergie" value={energyDifference === null ? 'Indisponible' : `${energyDifference > 0 ? '+' : ''}${energyDifference} points de %`} />
        <Field label="État général" value={condition} />
        <Field label="Nouveaux dégâts éventuels" value={damageComparison} />
      </div>
    </div>
  )
}

function VehicleInspectionControl({ departure, returned, previousDeparture, previousReturn, reference }: {
  departure: ManagementInspection | null
  returned: ManagementInspection | null
  previousDeparture: ManagementInspection | null
  previousReturn: ManagementInspection | null
  reference: ManagementInspection | null
}) {
  const [preview, setPreview] = useState<PhotoPreview | null>(null)
  const history = [
    { title: 'Départ avant-dernier client', inspection: previousDeparture },
    { title: 'Retour avant-dernier client', inspection: previousReturn },
    { title: 'Inspection de référence du véhicule', inspection: reference },
  ].filter((item) => item.inspection !== null)

  return (
    <section>
      <SectionHeader icon={<Camera className="h-5 w-5" />} title="Contrôle du véhicule" />
      <div className="mt-3 space-y-4">
        <InspectionDifferences departure={departure} returned={returned} />
        <div className="grid items-start gap-4 md:grid-cols-2">
          <InspectionCard title="État au départ (Check-in)" inspection={departure} headerClassName="border-[#BFDBFE] bg-[#EFF6FF]" onPreview={setPreview} />
          <InspectionCard title="État au retour (Check-out)" inspection={returned} headerClassName="border-[#BFDBFE] bg-[#EFF6FF]" onPreview={setPreview} />
        </div>
        <details className="rounded-2xl border border-[#E2E8F0] bg-white">
          <summary className="cursor-pointer px-4 py-4 text-base font-semibold text-[#0F172A]">
            Historique des inspections précédentes
          </summary>
          <div className="border-t border-[#E2E8F0] p-4">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun historique disponible</p>
            ) : (
              <div className="grid items-start gap-4 md:grid-cols-2">
                {history.map((item) => (
                  <InspectionCard key={item.title} title={item.title} inspection={item.inspection} headerClassName="border-[#BBF7D0] bg-[#F0FDF4]" onPreview={setPreview} />
                ))}
              </div>
            )}
          </div>
        </details>
      </div>
      {preview ? <PhotoPreviewDialog photo={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  )
}

type AdditionalChargeFormState = Record<ReservationAdditionalChargeType, { amount: string; justification: string }>

const CHARGE_TYPE_ROWS: Array<{ type: ReservationAdditionalChargeType; label: string }> = [
  { type: 'RETARD', label: 'Retard' },
  { type: 'CARBURANT', label: 'Carburant manquant' },
  { type: 'KILOMETRAGE', label: 'Kilomètres supplémentaires' },
  { type: 'DEGATS', label: 'Dégâts' },
]

function parseChargeAmount(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function formatChargeInput(value: string): string {
  const amount = parseChargeAmount(value)
  return amount === null ? '0.00' : amount.toFixed(2)
}

function buildDefaultAdditionalChargesFormState(reservation: {
  additional_charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string; status: string }>
  return_delay_fee: string | null
  return_fuel_fee: string | null
}): AdditionalChargeFormState {
  const initial: AdditionalChargeFormState = {
    RETARD: { amount: '0.00', justification: '' },
    CARBURANT: { amount: '0.00', justification: '' },
    KILOMETRAGE: { amount: '0.00', justification: '' },
    DEGATS: { amount: '0.00', justification: '' },
  }

  for (const charge of reservation.additional_charges) {
    if (charge.status !== 'PROVISOIRE') continue
    initial[charge.charge_type] = {
      amount: formatChargeInput(charge.amount),
      justification: charge.justification ?? '',
    }
  }

  if (parseChargeAmount(initial.RETARD.amount) === 0 && reservation.return_delay_fee) {
    initial.RETARD.amount = formatChargeInput(reservation.return_delay_fee)
  }
  if (parseChargeAmount(initial.CARBURANT.amount) === 0 && reservation.return_fuel_fee) {
    initial.CARBURANT.amount = formatChargeInput(reservation.return_fuel_fee)
  }

  return initial
}

function AdditionalChargesSection({
  reservation,
  departureInspection,
  returnInspection,
  onSaved,
  isSaving,
  onSave,
  saveError,
}: {
  reservation: {
    deposit_amount: string
    status: string
    return_charges_estimate: { delay_seconds: number; fuel_fee: string | null } | null
    return_delay_fee: string | null
    return_fuel_fee: string | null
    return_charges_confirmed_at: string | null
    return_charges_confirmed_by: number | null
    additional_charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string; status: string }>
  }
  departureInspection: ManagementInspection | null
  returnInspection: ManagementInspection | null
  onSaved: number
  isSaving: boolean
  onSave: (payload: AdditionalChargeFormState) => void
  saveError: string | null
}) {
  const [formState, setFormState] = useState<AdditionalChargeFormState>(() => buildDefaultAdditionalChargesFormState(reservation))
  const [errors, setErrors] = useState<Partial<Record<ReservationAdditionalChargeType, string>>>({})
  const [lastSynced, setLastSynced] = useState({ reservation, onSaved })

  if (lastSynced.reservation !== reservation || lastSynced.onSaved !== onSaved) {
    setLastSynced({ reservation, onSaved })
    setFormState(buildDefaultAdditionalChargesFormState(reservation))
    setErrors({})
  }

  const amounts = CHARGE_TYPE_ROWS.reduce<Record<ReservationAdditionalChargeType, number>>((acc, row) => {
    acc[row.type] = parseChargeAmount(formState[row.type].amount) ?? 0
    return acc
  }, { RETARD: 0, CARBURANT: 0, KILOMETRAGE: 0, DEGATS: 0 })

  const totalAdditionalCharges = amounts.RETARD + amounts.CARBURANT + amounts.KILOMETRAGE + amounts.DEGATS
  const depositAmount = Number(reservation.deposit_amount) || 0
  const retainedOnDeposit = Math.min(totalAdditionalCharges, depositAmount)
  const depositToRelease = Math.max(depositAmount - retainedOnDeposit, 0)
  const overDeposit = Math.max(totalAdditionalCharges - depositAmount, 0)

  const helpDelayMinutes = reservation.return_charges_estimate ? Math.ceil(reservation.return_charges_estimate.delay_seconds / 60) : null
  const distance = departureInspection?.mileage !== null
    && departureInspection?.mileage !== undefined
    && returnInspection?.mileage !== null
    && returnInspection?.mileage !== undefined
    ? returnInspection.mileage - departureInspection.mileage
    : null
  const fuelDelta = departureInspection?.energy_level_percent !== null
    && departureInspection?.energy_level_percent !== undefined
    && returnInspection?.energy_level_percent !== null
    && returnInspection?.energy_level_percent !== undefined
    ? returnInspection.energy_level_percent - departureInspection.energy_level_percent
    : null

  const handleSave = () => {
    const nextErrors: Partial<Record<ReservationAdditionalChargeType, string>> = {}
    for (const row of CHARGE_TYPE_ROWS) {
      const amount = parseChargeAmount(formState[row.type].amount)
      if (amount === null) {
        nextErrors[row.type] = 'Montant invalide (deux décimales maximum).'
        continue
      }
      if (amount > 0 && !formState[row.type].justification.trim()) {
        nextErrors[row.type] = 'Justification obligatoire pour un montant supérieur à 0 €.'
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    onSave(formState)
  }

  return (
    <Card
      className="rounded-2xl"
      header={<h2 className="text-xl font-semibold text-[#0F172A]">Frais supplémentaires</h2>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-3">
          <p>Retard constaté : {helpDelayMinutes === null ? 'Indisponible' : `${helpDelayMinutes} min`}</p>
          <p>Kilométrage : {distance === null ? 'Indisponible' : `${distance > 0 ? '+' : ''}${distance} km`}</p>
          <p>Carburant / énergie : {fuelDelta === null ? 'Indisponible' : `${fuelDelta > 0 ? '+' : ''}${fuelDelta} points de %`}</p>
        </div>

        <div className="space-y-3">
          {CHARGE_TYPE_ROWS.map((row) => (
            <div key={row.type} className="rounded-xl border border-[#E2E8F0] p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">{row.label}</p>
                  <label className="mt-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Justification</label>
                  <textarea
                    value={formState[row.type].justification}
                    onChange={(event) => setFormState((prev) => ({ ...prev, [row.type]: { ...prev[row.type], justification: event.target.value } }))}
                    className="mt-1 min-h-20 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm text-[#1F2937] focus:border-[#0F766E] focus:outline-none"
                    placeholder="Décrire le constat"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Montant (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formState[row.type].amount}
                    onChange={(event) => setFormState((prev) => ({ ...prev, [row.type]: { ...prev[row.type], amount: event.target.value } }))}
                    className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-right text-sm font-semibold text-[#1F2937] focus:border-[#0F766E] focus:outline-none"
                    aria-label={`Montant ${row.label}`}
                  />
                </div>
              </div>
              {errors[row.type] ? <p className="mt-2 text-sm text-red-600">{errors[row.type]}</p> : null}
            </div>
          ))}
        </div>

        <div className="grid gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm md:grid-cols-2">
          <Field label="Total des frais supplémentaires" value={formatCurrency(totalAdditionalCharges.toFixed(2))} />
          <Field label="Montant maximal à retenir sur la caution" value={formatCurrency(retainedOnDeposit.toFixed(2))} />
          <Field label="Solde de caution à libérer" value={formatCurrency(depositToRelease.toFixed(2))} />
          <Field label="Dépassement éventuel de la caution" value={formatCurrency(overDeposit.toFixed(2))} />
        </div>

        {reservation.return_charges_confirmed_at ? (
          <p className="text-sm text-slate-600">
            Dernière mise à jour le {new Date(reservation.return_charges_confirmed_at).toLocaleString('fr-BE')}
            {reservation.return_charges_confirmed_by ? ` par le gestionnaire n°${reservation.return_charges_confirmed_by}.` : '.'}
          </p>
        ) : null}
        {saveError ? <Alert variant="danger" title="Enregistrement impossible" message={saveError} /> : null}

        <Button onClick={handleSave} disabled={isSaving || reservation.status !== 'A_CONTROLER'}>
          {isSaving ? 'Enregistrement en cours...' : 'Enregistrer les frais supplémentaires'}
        </Button>
      </div>
    </Card>
  )
}

export default function ManagerReservationDetailPage({ basePath = '/manager' }: ManagerReservationDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0
  const [isInvoiceDownloading, setIsInvoiceDownloading] = useState(false)
  const [invoiceDownloadError, setInvoiceDownloadError] = useState<string | null>(null)
  const [saveChargesError, setSaveChargesError] = useState<string | null>(null)
  const [chargesRefreshToken, setChargesRefreshToken] = useState(0)
  const [showSettleConfirm, setShowSettleConfirm] = useState(false)
  const [settlementResult, setSettlementResult] = useState<ReservationDepositSettlementResponse | null>(null)
  const toastMessage = (location.state as { toast?: string } | null)?.toast ?? null

  useEffect(() => {
    if (!toastMessage) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      navigate(location.pathname, { replace: true, state: null })
    }, 4000)
    return () => window.clearTimeout(timeoutId)
  }, [location.pathname, navigate, toastMessage])

  const detailQuery = useQuery({
    queryKey: ['manager-reservation-detail', reservationId],
    queryFn: () => getManagementReservationById(reservationId),
    enabled: isValidReservationId,
  })

  const depositSettlementMutation = useMutation({
    mutationFn: () => settleManagementReservationDeposit(reservationId),
    onSuccess: async (data) => {
      setSettlementResult(data)
      setShowSettleConfirm(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservationId] }),
      ])
    },
    onError: () => {
      setShowSettleConfirm(false)
    },
  })

  const refreshReservation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
      queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservationId] }),
    ])
  }
  const additionalChargesMutation = useMutation({
    mutationFn: (payload: {
      charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string }>
    }) => updateManagementAdditionalCharges(reservationId, payload),
    onSuccess: async () => {
      setSaveChargesError(null)
      setChargesRefreshToken((value) => value + 1)
      await refreshReservation()
    },
    onError: (error) => {
      setSaveChargesError(toErrorState(error).message)
    },
  })
  const completeMutation = useMutation({
    mutationFn: () => validateManagementReservationReturn(reservationId),
    onSuccess: refreshReservation,
  })

  const controlReservation = useMemo(
    () => (detailQuery.data?.status === 'A_CONTROLER' ? detailQuery.data : detailQuery.data),
    [detailQuery.data],
  )

  if (!isValidReservationId) {
    return (
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Reservation invalide" message="L'identifiant de reservation est invalide." />
        <Link to={`${basePath}/reservations`} className="inline-flex">
          <Button variant="secondary">Retour aux reservations</Button>
        </Link>
      </section>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du retour a verifier" />
      </section>
    )
  }

  if (detailQuery.isError || !controlReservation) {
    const errorState = toErrorState(detailQuery.error)
    return (
      <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title={errorState.title} message={errorState.message} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void detailQuery.refetch()}>Reessayer</Button>
          <Link to={`${basePath}/reservations`}>
            <Button variant="secondary">Retour aux reservations</Button>
          </Link>
        </div>
      </section>
    )
  }

  const reservation = controlReservation
  if (searchParams.get('action') === 'reassign' && reservation.status === 'REAFFECTATION_REQUIRED') {
    return <ReservationReassignmentPanel reservation={reservation} basePath={basePath} />
  }

  const reservationStatusLabel = getReservationStatusLabel(reservation.status, reservation.cancellation_source)
  const departureInspection = reservation.departure_inspection
  const returnInspection = reservation.return_inspection
  const isDepositDecisionPending = reservation.deposit_status === 'AUTORISEE' || reservation.deposit_status === 'A_VERIFIER'

  const handleInvoiceDownload = async () => {
    if (!reservation.invoice_id || isInvoiceDownloading) return

    setInvoiceDownloadError(null)
    setIsInvoiceDownloading(true)
    try {
      const pdfBlob = await getInvoiceDownload(reservation.invoice_id)
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `GetaCar_Facture_${reservation.reference}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch {
      setInvoiceDownloadError('La facture n’est pas disponible au téléchargement pour le moment.')
    } finally {
      setIsInvoiceDownloading(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1250px] space-y-5 px-3 py-6 sm:px-4 lg:px-5">
      {toastMessage ? (
        <div role="status" className="fixed right-4 top-20 z-50 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
      <header className="flex flex-col gap-3 pb-1 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Link to={`${basePath}/reservations`} className="shrink-0 self-start sm:self-auto">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour à la liste
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-[#0F172A]">Détail de la réservation</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          <Button
            variant="secondary"
            size="sm"
            disabled={!reservation.invoice_id || !reservation.invoice_pdf_available || isInvoiceDownloading}
            title={reservation.invoice_pdf_available ? undefined : 'Aucune facture disponible'}
            onClick={() => void handleInvoiceDownload()}
          >
            {isInvoiceDownloading ? 'Téléchargement...' : reservation.invoice_pdf_available ? 'Télécharger la facture' : 'Facture indisponible'}
          </Button>
          <StatusBadge variant={reservation.status === 'NON_UTILISEE' ? 'neutral' : 'success'} label={reservationStatusLabel} />
          {isDepositDecisionPending ? <StatusBadge variant="info" label="Caution à décider" /> : null}
        </div>
      </header>

      {invoiceDownloadError ? <Alert variant="danger" title="Téléchargement impossible" message={invoiceDownloadError} /> : null}

      <ReservationSummaryCard
        vehicle={reservation.vehicle}
        client={reservation.client_summary}
        rentalAmount={reservation.rental_amount}
        depositAmount={reservation.deposit_amount}
        startAt={reservation.start_at}
        endAt={reservation.end_at}
        departureInspection={departureInspection}
        returnInspection={returnInspection}
      />

      <VehicleInspectionControl
        departure={departureInspection}
        returned={returnInspection}
        previousDeparture={reservation.previous_reservation?.departure_inspection ?? null}
        previousReturn={reservation.previous_reservation?.return_inspection ?? null}
        reference={reservation.vehicle_reference_inspection}
      />

      <section className="space-y-4">
        <AdditionalChargesSection
          reservation={reservation}
          departureInspection={departureInspection}
          returnInspection={returnInspection}
          onSaved={chargesRefreshToken}
          isSaving={additionalChargesMutation.isPending}
          saveError={saveChargesError}
          onSave={(formState) => {
            setSaveChargesError(null)
            additionalChargesMutation.mutate({
              charges: CHARGE_TYPE_ROWS.map((row) => ({
                charge_type: row.type,
                amount: formatChargeInput(formState[row.type].amount),
                justification: formState[row.type].justification.trim(),
              })),
            })
          }}
        />
        {reservation.status === 'A_CONTROLER' && reservation.return_charges_confirmed_at && Number(reservation.return_delay_fee) + Number(reservation.return_fuel_fee) === 0 ? (
          <Button className="mt-3" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            Clôturer la location
          </Button>
        ) : null}
        {completeMutation.isError ? <Alert variant="danger" title="Clôture impossible" message={toErrorState(completeMutation.error).message} /> : null}
        {reservation.status === 'TERMINEE' && !reservation.invoice_pdf_available ? (
          <div className="mt-4">
            <Button disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
              Réessayer la génération de la facture
            </Button>
            {completeMutation.isError ? <Alert variant="danger" title="Génération impossible" message={toErrorState(completeMutation.error).message} /> : null}
          </div>
        ) : null}
      </section>

      {reservation.status === 'A_CONTROLER' || settlementResult !== null ? (
        <ReservationClosureSection
          reservation={reservation}
          isSettling={depositSettlementMutation.isPending}
          settleError={depositSettlementMutation.isError ? toErrorState(depositSettlementMutation.error).message : null}
          settlementResult={settlementResult}
          showConfirm={showSettleConfirm}
          onRequestConfirm={() => setShowSettleConfirm(true)}
          onCancelConfirm={() => setShowSettleConfirm(false)}
          onConfirm={() => depositSettlementMutation.mutate()}
        />
      ) : null}
    </section>
  )
}

function ReservationClosureSection({
  reservation,
  isSettling,
  settleError,
  settlementResult,
  showConfirm,
  onRequestConfirm,
  onCancelConfirm,
  onConfirm,
}: {
  reservation: {
    status: string
    rental_amount: string
    deposit_amount: string
    deposit_status: string | null
    return_charges_confirmed_at: string | null
    return_delay_fee: string | null
    return_fuel_fee: string | null
    additional_charges: Array<{ charge_type: ReservationAdditionalChargeType; amount: string; justification: string; status: string }>
  }
  isSettling: boolean
  settleError: string | null
  settlementResult: ReservationDepositSettlementResponse | null
  showConfirm: boolean
  onRequestConfirm: () => void
  onCancelConfirm: () => void
  onConfirm: () => void
}) {
  const provisionalCharges = reservation.additional_charges.filter((charge) => charge.status === 'PROVISOIRE')
  const hasInvalidCharges = provisionalCharges.some((charge) => {
    const amount = Number(charge.amount)
    return !Number.isFinite(amount) || amount < 0
  })

  // Miroir du calcul backend (tâche 4.2) : lignes provisoires, sinon frais historiques confirmés.
  let chargesTotal = provisionalCharges.reduce((sum, charge) => {
    const amount = Number(charge.amount)
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  if (provisionalCharges.length === 0 && reservation.return_charges_confirmed_at) {
    chargesTotal = Math.max(Number(reservation.return_delay_fee) || 0, 0) + Math.max(Number(reservation.return_fuel_fee) || 0, 0)
  }

  const depositAmount = Number(reservation.deposit_amount) || 0
  const retainedAmount = Math.min(chargesTotal, depositAmount)
  const amountToRelease = Math.max(depositAmount - retainedAmount, 0)
  const overDeposit = Math.max(chargesTotal - depositAmount, 0)

  const isDepositSettleable = reservation.deposit_status === 'AUTORISEE' || reservation.deposit_status === 'A_VERIFIER'
  const chargesConfirmed = reservation.return_charges_confirmed_at !== null
  const canSettle =
    reservation.status === 'A_CONTROLER'
    && isDepositSettleable
    && chargesConfirmed
    && !hasInvalidCharges
    && !isSettling
    && settlementResult === null

  let disabledReason: string | null = null
  if (settlementResult === null) {
    if (reservation.status !== 'A_CONTROLER') {
      disabledReason = 'La réservation doit être au statut « À contrôler ».'
    } else if (!isDepositSettleable) {
      disabledReason = 'La caution ne peut pas être traitée (aucune préautorisation active).'
    } else if (!chargesConfirmed) {
      disabledReason = 'Enregistrez d\u2019abord les frais supplémentaires (même à 0 €).'
    } else if (hasInvalidCharges) {
      disabledReason = 'Des frais enregistrés sont invalides ; corrigez-les avant de clôturer.'
    }
  }

  const settledStatusLabel =
    settlementResult?.deposit_status === 'CAPTUREE'
      ? 'Caution capturée (retenue appliquée)'
      : settlementResult?.deposit_status === 'LIBEREE'
        ? 'Caution libérée intégralement'
        : settlementResult?.deposit_status ?? ''

  return (
    <Card header={<h2 className="text-xl font-semibold text-[#0F172A]">Clôture de la réservation</h2>}>
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm md:grid-cols-2">
          <Field label="Montant de location initial" value={formatCurrency(reservation.rental_amount)} />
          <Field label="Caution préautorisée" value={formatCurrency(reservation.deposit_amount)} />
          <Field label="Total des frais supplémentaires" value={formatCurrency(chargesTotal.toFixed(2))} />
          <Field label="Montant à retenir" value={formatCurrency(retainedAmount.toFixed(2))} />
          <Field label="Solde à libérer" value={formatCurrency(amountToRelease.toFixed(2))} />
          <Field label="Dépassement éventuel de la caution" value={formatCurrency(overDeposit.toFixed(2))} />
        </div>

        {settlementResult ? (
          <div className="space-y-3">
            <Alert
              variant="success"
              title="Caution régularisée — résultat confirmé par Stripe"
              message={settledStatusLabel}
            />
            <div className="grid gap-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm md:grid-cols-2">
              <Field label="Montant capturé (confirmé)" value={formatCurrency(settlementResult.captured_amount)} />
              <Field label="Montant libéré (confirmé)" value={formatCurrency(settlementResult.released_amount)} />
              <Field label="Frais retenus" value={formatCurrency(settlementResult.charges_total)} />
              <Field label="Dépassement de caution" value={formatCurrency(settlementResult.over_deposit_amount)} />
            </div>
            {settlementResult.stripe_payment_intent_id ? (
              <p className="text-xs text-slate-500">Transaction Stripe : {settlementResult.stripe_payment_intent_id}</p>
            ) : null}
          </div>
        ) : null}

        {settleError ? (
          <Alert
            variant="danger"
            title="Clôture impossible"
            message={`${settleError} La caution n\u2019a pas été traitée et la réservation n\u2019est pas clôturée.`}
          />
        ) : null}

        {showConfirm && settlementResult === null ? (
          <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
            <p className="text-sm font-semibold text-[#92400E]">Confirmer la régularisation de la caution ?</p>
            <ul className="mt-2 space-y-1 text-sm text-[#78350F]">
              <li>Frais supplémentaires : {formatCurrency(chargesTotal.toFixed(2))}</li>
              <li>Montant à retenir (capture Stripe) : {formatCurrency(retainedAmount.toFixed(2))}</li>
              <li>Solde à libérer : {formatCurrency(amountToRelease.toFixed(2))}</li>
              {overDeposit > 0 ? <li>Dépassement à facturer séparément : {formatCurrency(overDeposit.toFixed(2))}</li> : null}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={isSettling} onClick={onConfirm}>
                {isSettling ? 'Traitement en cours...' : 'Confirmer'}
              </Button>
              <Button variant="secondary" disabled={isSettling} onClick={onCancelConfirm}>
                Annuler
              </Button>
            </div>
          </div>
        ) : null}

        {settlementResult === null && !showConfirm ? (
          <div className="space-y-2">
            <Button disabled={!canSettle} onClick={onRequestConfirm}>
              {isSettling ? 'Traitement en cours...' : 'Valider et clôturer'}
            </Button>
            {disabledReason ? <p className="text-sm text-slate-500">{disabledReason}</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
