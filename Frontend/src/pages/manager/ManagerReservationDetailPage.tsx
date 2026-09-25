import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft, Gauge, CarFront, Camera, UserRound } from 'lucide-react'
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
  releaseManagementReservationDeposit,
} from '../../services/managementReservationService'
import type {
  ManagementInspection,
  ManagementReservationStatus,
  ReservationCancellationSource,
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

  return {
    title: 'Chargement impossible',
    message: 'Impossible de recuperer le retour a verifier.',
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-[#1F2937]">{value}</p>
    </div>
  )
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '—'
}

function formatClientName(client: ReservationManagementClientSummary): string {
  return displayValue(`${client.first_name} ${client.last_name}`.trim())
}

function formatAmount(value: string | null | undefined): string {
  return value?.trim() ? `${value} EUR` : '—'
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

function SummaryGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border-t border-[#E5E7EB] pt-4 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0 lg:border-l lg:pl-4 lg:first:border-l-0 lg:first:pl-0 ${className}`}>
      {children}
    </div>
  )
}

interface ReservationSummaryCardProps {
  title: string
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
  title,
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
          <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.4fr_1.05fr_.8fr_1.55fr_.8fr] lg:gap-0">
        <SummaryGroup>
          <div className="flex items-center gap-3">
            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
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
              <p className="text-sm font-semibold text-[#0F172A]">{vehicleName}</p>
              <p className="mt-1 text-sm text-slate-500">{displayValue(vehicle.category)}</p>
              <p className="mt-1 text-sm text-[#1F2937]">{displayValue(vehicle.registration_plate)}</p>
            </div>
          </div>
        </SummaryGroup>

        <SummaryGroup>
          <Field label="Client" value={formatClientName(client)} />
          <div className="mt-4">
            <Field label="E-mail" value={displayValue(client.email)} />
          </div>
        </SummaryGroup>

        <SummaryGroup>
          <Field label="Montant location" value={formatAmount(rentalAmount)} />
          <div className="mt-4">
            <Field label="Caution" value={formatAmount(depositAmount)} />
          </div>
        </SummaryGroup>

        <SummaryGroup>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Période réservée</p>
              <p className="mt-1 text-sm text-[#1F2937]">{formatDateTime(startAt)}</p>
              <p className="mt-1 text-sm text-[#1F2937]">{formatDateTime(endAt)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Période réelle</p>
              <p className="mt-1 text-sm text-[#1F2937]">{formatDateTime(departureInspection?.completed_at ?? null)}</p>
              <p className="mt-1 text-sm text-[#1F2937]">{formatDateTime(returnInspection?.completed_at ?? null)}</p>
            </div>
          </div>
        </SummaryGroup>

        <SummaryGroup>
          <Field label="Parking / Place" value={getParkingLabel(vehicle)} />
        </SummaryGroup>
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

function InspectionPhotoThumbnail({ photo, label }: { photo: InspectionPhoto | null; label: string }) {
  const src = resolveMediaUrl(photo?.file)

  return (
    <div className="min-w-0">
      <div className="aspect-square overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center px-1 text-center text-xs leading-tight text-slate-500">
            Non disponible
          </div>
        )}
      </div>
      <p className="mt-1 min-h-8 text-center text-xs font-medium leading-4 text-slate-600">{label}</p>
    </div>
  )
}

interface InspectionComparisonCardProps {
  title: string
  inspection: ManagementInspection | null
  headerClassName: string
}

function InspectionComparisonCard({ title, inspection, headerClassName }: InspectionComparisonCardProps) {
  const inspectionDate = inspection?.completed_at ?? inspection?.started_at ?? null
  const completedByName = inspection?.completed_by_name?.trim() || 'Non disponible'

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <header className={`h-24 shrink-0 border-b px-4 py-3 ${headerClassName}`}>
        <h3 className="flex h-10 items-start text-[15px] font-semibold leading-5 text-[#0F172A]">{title}</h3>
        <p className="mt-1 h-5 text-sm leading-5 text-slate-600">{inspectionDate ? formatDateTime(inspectionDate) : 'Non disponible'}</p>
      </header>
      <div className="flex flex-1 flex-col p-4">
        <div className="grid grid-cols-4 gap-2">
          {RETURN_COMPARISON_SLOTS.map((slot) => (
            <InspectionPhotoThumbnail
              key={`${slot.photoType}-${slot.position ?? 0}`}
              photo={findPhotoBySlot(inspection, slot)}
              label={slot.label}
            />
          ))}
        </div>
        <p className="mt-4 border-t border-[#E5E7EB] pt-3 text-sm text-[#1F2937]">
          <span className="font-semibold">Par :</span> {completedByName}
        </p>
      </div>
    </article>
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

interface InspectionMetricsCardProps {
  title: string
  inspection: ManagementInspection | null
  headerClassName: string
}

function InspectionMetricsCard({ title, inspection, headerClassName }: InspectionMetricsCardProps) {
  const inspectionDate = inspection?.completed_at ?? inspection?.started_at ?? null
  const damages = inspection?.damages ?? []

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <header className={`min-h-20 border-b px-4 py-3 ${headerClassName}`}>
        <h3 className="text-[15px] font-semibold leading-5 text-[#0F172A]">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{inspectionDate ? formatDateTime(inspectionDate) : 'Non disponible'}</p>
      </header>
      <div className="flex flex-1 flex-col p-4">
        <div className="grid h-32 shrink-0 grid-cols-2 grid-rows-2 gap-x-3 gap-y-4">
          <div className="min-h-13">
            <Field label="Kilométrage" value={formatNullableNumber(inspection?.mileage, ' km')} />
          </div>
          <div className="min-h-13">
            <Field label="Carburant / énergie" value={formatNullableNumber(inspection?.energy_level_percent, ' %')} />
          </div>
          <div className="col-span-2 min-h-13">
            <Field label="Propreté / état général" value={formatGeneralCondition(inspection?.general_condition)} />
          </div>
        </div>

        <div className="mt-5 border-t border-[#E5E7EB] pt-4">
          <h4 className="text-sm font-semibold text-[#0F172A]">Dommages relevés</h4>
          {damages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Aucun dommage constaté</p>
          ) : (
            <div className="mt-3 space-y-3">
              {damages.map((damage) => {
                const severity = getSeverityBadge(damage.severity)
                const evidencePhoto = inspection?.photos.find((photo) => damage.photo_ids.includes(photo.id)) ?? null
                const evidencePhotoUrl = resolveMediaUrl(evidencePhoto?.file)

                return (
                  <div key={damage.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <div className="flex items-start gap-3">
                      {evidencePhotoUrl ? (
                        <img
                          src={evidencePhotoUrl}
                          alt={`Preuve du dommage : ${damage.description}`}
                          className="h-14 w-14 shrink-0 rounded-lg border border-[#E2E8F0] object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-5 text-[#1F2937]">{displayValue(damage.description)}</p>
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
      </div>
    </article>
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

  const depositReleaseMutation = useMutation({
    mutationFn: () => releaseManagementReservationDeposit(reservationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservationId] }),
      ])
    },
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
            disabled={!reservation.invoice_id || isInvoiceDownloading}
            title={reservation.invoice_id ? undefined : 'Aucune facture disponible'}
            onClick={() => void handleInvoiceDownload()}
          >
            {isInvoiceDownloading ? 'Téléchargement...' : reservation.invoice_id ? 'Télécharger la facture' : 'Facture indisponible'}
          </Button>
          <StatusBadge variant={reservation.status === 'NON_UTILISEE' ? 'neutral' : 'success'} label={reservationStatusLabel} />
          {isDepositDecisionPending ? <StatusBadge variant="info" label="Caution à décider" /> : null}
        </div>
      </header>

      {invoiceDownloadError ? <Alert variant="danger" title="Téléchargement impossible" message={invoiceDownloadError} /> : null}

      <div className="space-y-4">
        {reservation.previous_reservation ? (
          <ReservationSummaryCard
            title="Avant-dernier client"
            vehicle={reservation.vehicle}
            client={reservation.previous_reservation.client_summary}
            rentalAmount={reservation.previous_reservation.rental_amount}
            depositAmount={reservation.previous_reservation.deposit_amount}
            startAt={reservation.previous_reservation.start_at}
            endAt={reservation.previous_reservation.end_at}
            departureInspection={reservation.previous_reservation.departure_inspection}
            returnInspection={reservation.previous_reservation.return_inspection}
          />
        ) : (
          <Card
            className="rounded-2xl"
            header={(
              <div className="flex items-center gap-2.5">
                <UserRound className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-[#0F172A]">Avant-dernier client</h2>
              </div>
            )}
          >
            <p className="text-sm text-slate-500">Aucune réservation précédente disponible</p>
          </Card>
        )}

        <ReservationSummaryCard
          title="Client actuel"
          vehicle={reservation.vehicle}
          client={reservation.client_summary}
          rentalAmount={reservation.rental_amount}
          depositAmount={reservation.deposit_amount}
          startAt={reservation.start_at}
          endAt={reservation.end_at}
          departureInspection={departureInspection}
          returnInspection={returnInspection}
        />
      </div>

      <section>
        <SectionHeader icon={<Camera className="h-5 w-5" />} title="Comparaison des états des lieux" />
        <div className="mt-3 grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-4">
          <InspectionComparisonCard
            title="Check-in avant-dernier client"
            inspection={reservation.previous_reservation?.departure_inspection ?? null}
            headerClassName="border-[#BBF7D0] bg-[#F0FDF4]"
          />
          <InspectionComparisonCard
            title="Check-out avant-dernier client"
            inspection={reservation.previous_reservation?.return_inspection ?? reservation.vehicle_reference_inspection}
            headerClassName="border-[#BBF7D0] bg-[#F0FDF4]"
          />
          <InspectionComparisonCard
            title="Check-in client actuel"
            inspection={departureInspection}
            headerClassName="border-[#BFDBFE] bg-[#EFF6FF]"
          />
          <InspectionComparisonCard
            title="Check-out client actuel"
            inspection={returnInspection}
            headerClassName="border-[#BFDBFE] bg-[#EFF6FF]"
          />
        </div>
      </section>

      <section>
        <SectionHeader icon={<Gauge className="h-5 w-5" />} title="Métriques et dommages" />
        <div className="mt-3 grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-4">
          <InspectionMetricsCard
            title="Métriques check-in avant-dernier client"
            inspection={reservation.previous_reservation?.departure_inspection ?? null}
            headerClassName="border-[#BBF7D0] bg-[#F0FDF4]"
          />
          <InspectionMetricsCard
            title="Métriques check-out avant-dernier client"
            inspection={reservation.previous_reservation?.return_inspection ?? reservation.vehicle_reference_inspection}
            headerClassName="border-[#BBF7D0] bg-[#F0FDF4]"
          />
          <InspectionMetricsCard
            title="Métriques check-in client actuel"
            inspection={departureInspection}
            headerClassName="border-[#BFDBFE] bg-[#EFF6FF]"
          />
          <InspectionMetricsCard
            title="Métriques check-out client actuel"
            inspection={returnInspection}
            headerClassName="border-[#BFDBFE] bg-[#EFF6FF]"
          />
        </div>
      </section>

      {reservation.deposit_status === 'AUTORISEE' || reservation.deposit_status === 'A_VERIFIER' ? (
        <Card header={<h2 className="text-xl font-semibold text-[#0F172A]">Décision sur la caution</h2>}>
          {depositReleaseMutation.isError ? (
            <Alert
              className="mb-4"
              variant="danger"
              title="Libération impossible"
              message={toErrorState(depositReleaseMutation.error).message}
            />
          ) : null}
          {depositReleaseMutation.isSuccess ? (
            <Alert className="mb-4" variant="success" title="Caution libérée" message="La caution a été libérée avec succès." />
          ) : null}

          <div className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="shrink-0">
              <p className="text-sm font-medium text-slate-500">Caution</p>
              <p className="mt-1 text-2xl font-bold text-[#0F172A]">{formatCurrency(reservation.deposit_amount)}</p>
            </div>
            <div className="max-w-2xl rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm leading-6 text-[#1E40AF]">
              Comparez les 4 inspections (photos, métriques et dommages) pour décider du montant à rembourser ou à conserver.
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              className="flex min-h-24 flex-col items-start justify-center rounded-xl bg-[#16A34A] px-5 py-4 text-left text-white shadow-sm transition-colors hover:bg-[#15803D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={depositReleaseMutation.isPending}
              onClick={() => depositReleaseMutation.mutate()}
            >
              <span className="text-base font-semibold">
                {depositReleaseMutation.isPending ? 'Remboursement en cours...' : 'Rembourser la caution'}
              </span>
              <span className="mt-1 text-sm text-white/85">Remboursement intégral</span>
            </button>
            <button
              type="button"
              className="flex min-h-24 cursor-not-allowed flex-col items-start justify-center rounded-xl bg-[#F59E0B] px-5 py-4 text-left text-white opacity-60 shadow-sm"
              disabled
              title="Le remboursement partiel n'est pas disponible avec les actions existantes."
            >
              <span className="text-base font-semibold">Rembourser partiellement</span>
              <span className="mt-1 text-sm text-white/85">Montant personnalisé</span>
            </button>
            <button
              type="button"
              className="flex min-h-24 cursor-not-allowed flex-col items-start justify-center rounded-xl bg-[#DC2626] px-5 py-4 text-left text-white opacity-60 shadow-sm"
              disabled
              title="Le blocage de caution n'est pas disponible avec les actions existantes."
            >
              <span className="text-base font-semibold">Bloquer la caution</span>
              <span className="mt-1 text-sm text-white/85">Conserver tout ou partie</span>
            </button>
          </div>
        </Card>
      ) : null}
    </section>
  )
}
