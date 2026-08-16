import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { AlertTriangle, CheckCircle2, Fuel, Gauge, UserRound, CarFront, Camera, FileWarning } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  getManagementReservationById,
} from '../../services/managementReservationService'
import type {
  ManagementDepositStatus,
  ManagementInspection,
  ManagementReservationStatus,
  ReservationManagementDetail,
} from '../../types/managementReservation'
import type { InspectionPhoto, PhotoType } from '../../types/inspection'
import { resolveMediaUrl } from '../../utils/media'

interface ManagerReservationDetailPageProps {
  basePath?: string
}

function mapStatusToUi(status: ManagementReservationStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'BROUILLON':
      return { label: 'Brouillon', variant: 'neutral' }
    case 'EN_ATTENTE_CAUTION':
      return { label: 'En attente caution', variant: 'warning' }
    case 'EN_ATTENTE_PAIEMENT':
      return { label: 'En attente paiement', variant: 'warning' }
    case 'CONFIRMEE':
      return { label: 'Confirmee', variant: 'success' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'A verifier', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminee', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulee', variant: 'danger' }
    case 'PAIEMENT_ECHOUE':
      return { label: 'Paiement echoue', variant: 'danger' }
  }
}

function mapDepositStatus(status: ManagementDepositStatus | null): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'A_VERIFIER':
      return { label: 'A verifier', variant: 'warning' }
    case 'AUTORISEE':
      return { label: 'Autorisee', variant: 'info' }
    case 'LIBEREE':
      return { label: 'Liberee', variant: 'success' }
    case 'CAPTUREE':
      return { label: 'Capturee', variant: 'danger' }
    case 'ECHOUEE':
      return { label: 'Echouee', variant: 'danger' }
    case 'ANNULEE':
      return { label: 'Annulee', variant: 'neutral' }
    case 'EXPIREE':
      return { label: 'Expiree', variant: 'neutral' }
    case 'EN_ATTENTE':
      return { label: 'En attente', variant: 'warning' }
    case 'CREE':
      return { label: 'Creee', variant: 'neutral' }
    default:
      return { label: 'Inconnue', variant: 'neutral' }
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
    return 'Non renseigne'
  }

  return `${value}${suffix}`
}

function toVehicleLabel(reservation: ReservationManagementDetail): string {
  return `${reservation.vehicle.brand} ${reservation.vehicle.model_name}`.trim()
}

function toClientLabel(reservation: ReservationManagementDetail): string {
  const fullName = `${reservation.client_summary.first_name} ${reservation.client_summary.last_name}`.trim()
  return fullName || reservation.client_summary.email
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

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E0F2FE] text-[#0F766E]">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
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
  { label: 'Arriere gauche', photoType: 'COTE_GAUCHE' },
  { label: 'Arriere droit', photoType: 'ARRIERE' },
  { label: 'Tableau de bord', photoType: 'TABLEAU_DE_BORD' },
  { label: 'Sieges avant', photoType: 'INTERIEUR', position: 1 },
  { label: 'Sieges arriere', photoType: 'INTERIEUR', position: 2 },
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

function PhotoCell({ photo, alt }: { photo: InspectionPhoto | null; alt: string }) {
  const src = resolveMediaUrl(photo?.file)

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="aspect-4/3 bg-[#E5E7EB]">
        {src ? (
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Photo indisponible</div>
        )}
      </div>
    </div>
  )
}

function DamageList({ damages, emptyLabel }: { damages: ManagementInspection['damages']; emptyLabel: string }) {
  if (damages.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>
  }

  return (
    <div className="space-y-3">
      {damages.map((damage) => (
        <article key={damage.id} className="rounded-3xl border border-[#FECACA] bg-[#FEF2F2] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#7F1D1D]">{damage.location}</p>
            <StatusBadge variant={damage.severity === 'CRITIQUE' || damage.severity === 'MAJEUR' ? 'danger' : 'warning'} label={damage.severity} />
          </div>
          <p className="mt-2 text-sm text-[#991B1B]">{damage.description}</p>
        </article>
      ))}
    </div>
  )
}

function InspectionSummary({ inspection, title, accent }: { inspection: ManagementInspection | null; title: string; accent: string }) {
  return (
    <Card
      className="h-full"
      header={
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#0F172A]">{title}</h3>
            <p className="text-sm text-slate-500">Lecture rapide des elements saisis.</p>
          </div>
          {inspection ? <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accent}`}>{inspection.status ?? '—'}</span> : null}
        </div>
      }
    >
      {inspection ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kilometrage" value={formatNullableNumber(inspection.mileage, ' km')} />
            <Field label="Energie / carburant" value={formatNullableNumber(inspection.energy_level_percent, ' %')} />
            <Field label="Declaration du client" value={inspection.comments?.trim() ? inspection.comments : 'Aucune declaration'} />
            <Field label="Cloture" value={formatDateTime(inspection.completed_at ?? null)} />
          </div>

          {inspection.has_critical_issue ? (
            <Alert
              variant="warning"
              title="Anomalie declaree par le client"
              message={inspection.critical_issue_description?.trim() || 'Une anomalie critique a ete signalee sans detail complementaire.'}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Inspection indisponible.</p>
      )}
    </Card>
  )
}

export default function ManagerReservationDetailPage({ basePath = '/manager' }: ManagerReservationDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const reservationId = Number(id)
  const isValidReservationId = Number.isInteger(reservationId) && reservationId > 0
  const [decisionInfo, setDecisionInfo] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['manager-reservation-detail', reservationId],
    queryFn: () => getManagementReservationById(reservationId),
    enabled: isValidReservationId,
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
  const reservationStatus = mapStatusToUi(reservation.status)
  const depositStatus = mapDepositStatus(reservation.deposit_status)
  const departureInspection = reservation.departure_inspection
  const returnInspection = reservation.return_inspection
  const isManagerActionable = reservation.status === 'A_CONTROLER'
  const departureMileage = departureInspection?.mileage ?? null
  const returnMileage = returnInspection?.mileage ?? null
  const mileageDelta =
    typeof departureMileage === 'number' && typeof returnMileage === 'number'
      ? returnMileage - departureMileage
      : null

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#0F766E]">Espace gestionnaire</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0F172A]">Controle du retour</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Analysez l'etat du vehicule au retour et comparez les preuves de depart et de restitution avant de prendre une decision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={reservationStatus.variant} label={`Reservation ${reservationStatus.label}`} />
          <StatusBadge variant={depositStatus.variant} label={`Caution ${depositStatus.label}`} />
          <Link to={`${basePath}/reservations`}>
            <Button variant="secondary">Retour a la liste</Button>
          </Link>
        </div>
      </div>

      {decisionInfo ? <Alert variant="info" title="Decision preparee" message={decisionInfo} /> : null}

      {reservation.status !== 'A_CONTROLER' ? (
        <Alert
          variant="warning"
          title="Reservation hors file de controle"
          message="Cette reservation n'est pas actuellement dans le statut A verifier. Les donnees restent consultables pour comparaison."
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card
          className="bg-[linear-gradient(135deg,#F8FAFC_0%,#EFF6FF_100%)]"
          header={<SectionHeader icon={<FileWarning className="h-5 w-5" />} title="Synthese du retour" subtitle="Reservation, client, vehicule et periode de location." />}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Reference" value={reservation.reference} />
            <Field label="Client" value={toClientLabel(reservation)} />
            <Field label="E-mail" value={reservation.client_summary.email || 'Non renseigne'} />
            <Field label="Vehicule" value={toVehicleLabel(reservation)} />
            <Field label="Immatriculation" value={reservation.vehicle.registration_plate || 'Non renseignee'} />
            <Field label="Dates de location" value={`${formatDateTime(reservation.start_at)} → ${formatDateTime(reservation.end_at)}`} />
          </div>
        </Card>

        <Card
          className="bg-[linear-gradient(135deg,#FFF7ED_0%,#FFFBEB_100%)]"
          header={<SectionHeader icon={<AlertTriangle className="h-5 w-5" />} title="Caution" subtitle="Statut financier a verifier avant toute decision." />}
        >
          <div className="space-y-4">
            <div className="rounded-3xl border border-[#F59E0B] bg-white/80 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Lecture rapide</p>
              <p className="mt-3 text-2xl font-bold text-[#9A3412]">Caution : 500 € — À vérifier</p>
              <p className="mt-2 text-sm text-slate-600">
                Montant enregiste: {reservation.deposit_amount} EUR. Statut actuel: {depositStatus.label}.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Montant location" value={`${reservation.rental_amount} EUR`} />
              <Field label="Statut caution" value={depositStatus.label} />
            </div>
          </div>
        </Card>
      </div>

      <Card
        header={<SectionHeader icon={<CheckCircle2 className="h-5 w-5" />} title="Decision du gestionnaire" subtitle="Les consequences metier/financieres seront branchees dans une prochaine tache." />}
      >
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!isManagerActionable}
            className="min-w-55 justify-center"
            onClick={() => {
              setDecisionInfo('Validation preparee. Cette action sera connectee plus tard a la liberation caution, cloture reservation, disponibilite vehicule et facture finale.')
            }}
          >
            ✓ Valider le retour
          </Button>
          <Button
            variant="danger"
            disabled={!isManagerActionable}
            className="min-w-55 justify-center"
            onClick={() => {
              setDecisionInfo('Signalement prepare. Cette action sera connectee plus tard au maintien caution et a l orientation maintenance/nettoyage.')
            }}
          >
            ⚠ Signaler une anomalie
          </Button>
        </div>
        <p className="mt-3 text-sm text-slate-500">Les actions sont reservees aux gestionnaires autorises.</p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <InspectionSummary inspection={departureInspection} title="Etat des lieux depart" accent="bg-[#DBEAFE] text-[#1D4ED8]" />
        <InspectionSummary inspection={returnInspection} title="Etat des lieux retour" accent="bg-[#FEF3C7] text-[#B45309]" />
      </div>

      <Card
        header={<SectionHeader icon={<Camera className="h-5 w-5" />} title="Comparaison visuelle" subtitle="Etat au depart et au retour, photo par photo." />}
      >
        <div className="space-y-4">
          {RETURN_COMPARISON_SLOTS.map((slot) => {
            const departurePhoto = findPhotoBySlot(departureInspection, slot)
            const returnPhoto = findPhotoBySlot(returnInspection, slot)

            return (
              <article key={`${slot.photoType}-${slot.position ?? 0}`} className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <p className="mb-3 text-sm font-semibold text-[#0F172A]">{slot.label}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Etat au depart</p>
                    <PhotoCell photo={departurePhoto} alt={`${slot.label} depart`} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Etat au retour</p>
                    <PhotoCell photo={returnPhoto} alt={`${slot.label} retour`} />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card header={<SectionHeader icon={<Gauge className="h-5 w-5" />} title="Releves compares" subtitle="Kilometrage et energie declares au depart et au retour." />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex items-center gap-2 text-[#334155]">
                <Gauge className="h-4 w-4" />
                <p className="text-sm font-semibold">Kilometrage</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">Depart: {formatNullableNumber(departureInspection?.mileage, ' km')}</p>
              <p className="mt-1 text-sm text-slate-600">Retour: {formatNullableNumber(returnInspection?.mileage, ' km')}</p>
              <p className="mt-1 text-sm text-slate-600">Difference: {mileageDelta === null ? 'Non calculee' : `${mileageDelta} km`}</p>
            </div>
            <div className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex items-center gap-2 text-[#334155]">
                <Fuel className="h-4 w-4" />
                <p className="text-sm font-semibold">Carburant / energie</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">Depart: {formatNullableNumber(departureInspection?.energy_level_percent, ' %')}</p>
              <p className="mt-1 text-sm text-slate-600">Retour: {formatNullableNumber(returnInspection?.energy_level_percent, ' %')}</p>
            </div>
          </div>
        </Card>

        <Card header={<SectionHeader icon={<UserRound className="h-5 w-5" />} title="Declaration du client" subtitle="Synthese textuelle et signalements declares." />}>
          <div className="space-y-4">
            <div className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm text-slate-700">
              {returnInspection?.comments?.trim() ? returnInspection.comments : 'Aucune declaration client complementaire.'}
            </div>
            {returnInspection?.has_critical_issue ? (
              <Alert
                variant="warning"
                title="Anomalie signalee"
                message={returnInspection.critical_issue_description?.trim() || 'Une anomalie a ete signalee sans description detaillee.'}
              />
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card header={<SectionHeader icon={<CarFront className="h-5 w-5" />} title="Dommages presents au depart" />}>
          <DamageList
            damages={departureInspection?.damages ?? []}
            emptyLabel="Aucun dommage n'etait enregistre au depart."
          />
        </Card>
        <Card header={<SectionHeader icon={<AlertTriangle className="h-5 w-5" />} title="Dommages declares au retour" />}>
          <DamageList
            damages={returnInspection?.damages ?? []}
            emptyLabel="Aucun dommage n'a ete declare au retour."
          />
        </Card>
      </div>

      <Card header={<SectionHeader icon={<FileWarning className="h-5 w-5" />} title="Suivi gestionnaire" subtitle="Interventions et orientations en cours apres controle retour." />}>
        {reservation.interventions.length > 0 ? (
          <div className="space-y-3">
            {reservation.interventions.map((intervention) => (
              <article key={intervention.id} className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#0F172A]">{intervention.reference}</p>
                  <StatusBadge label={intervention.status} variant={intervention.status === 'TERMINEE' ? 'success' : 'warning'} />
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{intervention.intervention_type}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{intervention.description || 'Aucune description.'}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Aucun suivi gestionnaire n'a encore ete ouvert pour ce retour.</p>
        )}
      </Card>

      {!departureInspection && !returnInspection ? (
        <EmptyState
          title="Aucune inspection a comparer"
          description="Les etats des lieux de depart et de retour ne sont pas encore disponibles pour cette reservation."
        />
      ) : null}
    </section>
  )
}
