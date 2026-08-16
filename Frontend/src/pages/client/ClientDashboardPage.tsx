import { useMemo, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Gauge } from 'lucide-react'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getClientProfileMe, getClientProfileProgress } from '../../services/authService'
import { getReservations } from '../../services/reservationService'
import { getVehicleById } from '../../services/vehicleService'
import type { ClientProfileProgress } from '../../types/auth'
import type { ReservationDetail, ReservationStatus } from '../../types/reservation'
import { resolveMediaUrl } from '../../utils/media'

type DashboardReservationState = {
  label: string
  variant: StatusVariant
}

const primaryButtonClassName = 'bg-[#4F46E5] text-white hover:bg-[#4338CA] focus-visible:ring-[#4F46E5] shadow-[0_12px_24px_rgba(79,70,229,0.22)]'

const reservationStatusesToDisplay = new Set<ReservationStatus>([
  'BROUILLON',
  'EN_ATTENTE_CAUTION',
  'EN_ATTENTE_PAIEMENT',
  'CONFIRMEE',
  'EN_COURS',
  'A_CONTROLER',
])

const currentReservationStatuses = new Set<ReservationStatus>([
  'CONFIRMEE',
  'EN_COURS',
])

const nextReservationStatuses = new Set<ReservationStatus>([
  'BROUILLON',
  'EN_ATTENTE_CAUTION',
  'EN_ATTENTE_PAIEMENT',
  'CONFIRMEE',
])

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDateTime(value: string): string {
  return `${formatDate(value)} a ${formatTime(value)}`
}

function capitalizeFirstName(value: string): string {
  if (!value) {
    return value
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}

function getProgressSteps(progress: ClientProfileProgress | undefined) {
  if (!progress) {
    return []
  }

  return [
    { label: 'Compte créé', done: progress.account_created },
    { label: 'E-mail vérifié', done: progress.email_verified },
    { label: 'Informations personnelles', done: progress.personal_information_complete },
    { label: 'Carte d’identité', done: progress.identity_card_valid },
    { label: 'Permis de conduire', done: progress.driving_license_valid },
  ]
}

function isProfileFullyValidated(progress: ClientProfileProgress | undefined): boolean {
  if (!progress) {
    return false
  }

  return progress.percentage >= 100
    && progress.account_created
    && progress.email_verified
    && progress.personal_information_complete
    && progress.identity_card_valid
    && progress.driving_license_valid
}

function getReservationState(status: ReservationStatus | undefined): DashboardReservationState {
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
      return { label: 'A controler', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminee', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulee', variant: 'danger' }
    case 'PAIEMENT_ECHOUE':
      return { label: 'Paiement echoue', variant: 'danger' }
    default:
      return { label: 'Statut inconnu', variant: 'neutral' }
  }
}

function getVehicleLabel(reservation: ReservationDetail): string {
  return `${reservation.vehicle.brand} ${reservation.vehicle.model_name}`
}

function isReservationInProgress(reservation: ReservationDetail, now: number): boolean {
  const start = new Date(reservation.start_at).getTime()
  const end = new Date(reservation.end_at).getTime()
  const status = reservation.status

  if (Number.isNaN(start) || Number.isNaN(end) || !status) {
    return false
  }

  return currentReservationStatuses.has(status) && start <= now && now <= end
}

function isUpcomingReservation(reservation: ReservationDetail, now: number): boolean {
  const start = new Date(reservation.start_at).getTime()
  const status = reservation.status

  if (Number.isNaN(start) || !status) {
    return false
  }

  return nextReservationStatuses.has(status) && start > now
}

function selectDashboardReservations(reservations: ReservationDetail[]) {
  const now = Date.now()

  const relevantReservations = reservations
    .filter((reservation) => reservationStatusesToDisplay.has(reservation.status ?? 'BROUILLON'))
    .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())

  const current = relevantReservations.find((reservation) => isReservationInProgress(reservation, now))

  const next = relevantReservations.find((reservation) => {
    if (current && reservation.id === current.id) {
      return false
    }

    return isUpcomingReservation(reservation, now)
  })

  return { current, next }
}

function ReservationPanel({
  title,
  eyebrow,
  reservation,
  emptyMessage,
}: {
  title: string
  eyebrow?: string
  reservation: ReservationDetail | undefined
  emptyMessage: string
}) {
  if (!reservation) {
    return (
      <Card className="h-full rounded-4xl border-none bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
        <div className="flex h-full min-h-70 flex-col justify-between gap-6">
          <div>
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4F46E5]">{eyebrow}</p> : null}
            <h2 className="mt-3 text-[1.75rem] font-semibold tracking-tight text-[#0F172A]">{title}</h2>
          </div>

          <div className="rounded-[26px] bg-[#F8FAFC] px-6 py-10 text-center">
            <p className="text-base font-medium text-[#0F172A]">{emptyMessage}</p>
          </div>
        </div>
      </Card>
    )
  }

  const reservationState = getReservationState(reservation.status)

  return (
    <Card className="h-full border-none bg-white/88 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#F97316]">{eyebrow}</p> : null}
            <h2 className="mt-2 text-2xl font-semibold text-[#0F172A]">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">Reference {reservation.reference}</p>
          </div>
          <StatusBadge variant={reservationState.variant} label={reservationState.label} />
        </div>

        <div className="rounded-[28px] bg-[linear-gradient(135deg,#0F172A_0%,#1E293B_100%)] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-white/60">Vehicule</p>
              <p className="mt-2 text-2xl font-semibold">{getVehicleLabel(reservation)}</p>
              <p className="mt-2 text-sm text-white/70">{reservation.vehicle.category} • {reservation.vehicle.transmission.toLowerCase()} • {reservation.vehicle.fuel_type.toLowerCase()}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <Gauge className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#F8FAFC] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Depart</p>
            <p className="mt-2 text-base font-semibold text-[#0F172A]">{formatDateTime(reservation.start_at)}</p>
          </div>
          <div className="rounded-2xl bg-[#F8FAFC] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Retour</p>
            <p className="mt-2 text-base font-semibold text-[#0F172A]">{formatDateTime(reservation.end_at)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to={`/client/reservations/${reservation.id}`}>
            <Button>
              Voir le detail
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/client/reservations">
            <Button variant="secondary">Toutes mes reservations</Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}

function CurrentReservationCard({
  reservation,
  vehicleImageUrl,
  isVehicleLoading,
}: {
  reservation: ReservationDetail
  vehicleImageUrl: string | null
  isVehicleLoading: boolean
}) {
  const reservationState = getReservationState(reservation.status)

  return (
    <Card className="h-full rounded-4xl border-none bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="mt-1 text-[1.6rem] font-semibold tracking-tight text-[#0F172A]">Réservation en cours</h2>
          </div>
          <StatusBadge variant={reservationState.variant} label={reservationState.label} />
        </div>

        <div className="overflow-hidden rounded-[26px] bg-[#F8FAFC]">
          {isVehicleLoading ? (
            <div className="flex h-44 items-center justify-center bg-[#F1F5F9]">
              <LoadingSpinner size="md" aria-label="Chargement de la photo du véhicule" />
            </div>
          ) : vehicleImageUrl ? (
            <img
              src={vehicleImageUrl}
              alt={getVehicleLabel(reservation)}
              className="h-44 w-full object-cover"
            />
          ) : (
            <div className="flex h-44 items-center justify-center bg-[linear-gradient(135deg,#E2E8F0_0%,#F8FAFC_100%)] px-6 text-center text-sm text-slate-500">
              Photo du véhicule indisponible
            </div>
          )}

          <div className="space-y-3 p-4">
            <div>
              <p className="mt-1 text-[1.55rem] font-semibold tracking-tight text-[#0F172A]">{getVehicleLabel(reservation)}</p>
              <p className="mt-1 text-sm text-slate-600">{reservation.vehicle.category}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-3 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.85)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date/heure de début</p>
                <p className="mt-1 text-base font-semibold text-[#0F172A]">{formatDateTime(reservation.start_at)}</p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.85)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date/heure de fin</p>
                <p className="mt-1 text-base font-semibold text-[#0F172A]">{formatDateTime(reservation.end_at)}</p>
              </div>
            </div>

            <Link to={`/client/reservations/${reservation.id}`}>
              <Button className={primaryButtonClassName}>
                Voir les détails
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

function FutureReservationCard({
  reservation,
  vehicleImageUrl,
  isVehicleLoading,
}: {
  reservation: ReservationDetail
  vehicleImageUrl: string | null
  isVehicleLoading: boolean
}) {
  const reservationState = getReservationState(reservation.status)

  return (
    <Card className="h-full rounded-4xl border-none bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="mt-1 text-[1.6rem] font-semibold tracking-tight text-[#0F172A]">Prochaine réservation</h2>
          </div>
          <StatusBadge variant={reservationState.variant} label={reservationState.label} />
        </div>

        <div className="overflow-hidden rounded-[26px] bg-[#F8FAFC]">
          {isVehicleLoading ? (
            <div className="flex h-44 items-center justify-center bg-[#F1F5F9]">
              <LoadingSpinner size="md" aria-label="Chargement de la photo du véhicule" />
            </div>
          ) : vehicleImageUrl ? (
            <img
              src={vehicleImageUrl}
              alt={getVehicleLabel(reservation)}
              className="h-44 w-full object-cover"
            />
          ) : (
            <div className="flex h-44 items-center justify-center bg-[linear-gradient(135deg,#E2E8F0_0%,#F8FAFC_100%)] px-6 text-center text-sm text-slate-500">
              Photo du véhicule indisponible
            </div>
          )}

          <div className="space-y-3 p-4">
            <div>
              <p className="mt-1 text-[1.55rem] font-semibold tracking-tight text-[#0F172A]">{getVehicleLabel(reservation)}</p>
              <p className="mt-1 text-sm text-slate-600">{reservation.vehicle.category}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-3 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.85)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date/heure de début</p>
                <p className="mt-1 text-base font-semibold text-[#0F172A]">{formatDateTime(reservation.start_at)}</p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.85)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date/heure de fin</p>
                <p className="mt-1 text-base font-semibold text-[#0F172A]">{formatDateTime(reservation.end_at)}</p>
              </div>
            </div>

            <Link to={`/client/reservations/${reservation.id}`}>
              <Button className={primaryButtonClassName}>
                Voir les détails
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function ClientDashboardPage() {
  const profileQuery = useQuery({
    queryKey: ['client-profile-me'],
    queryFn: getClientProfileMe,
  })

  const progressQuery = useQuery({
    queryKey: ['client-profile-progress'],
    queryFn: getClientProfileProgress,
  })

  const reservationsQuery = useQuery({
    queryKey: ['client-dashboard-reservations'],
    queryFn: () => getReservations({ ordering: 'start_at', page: 1 }),
  })

  const progressSteps = useMemo(() => getProgressSteps(progressQuery.data), [progressQuery.data])
  const dashboardReservations = useMemo(
    () => selectDashboardReservations(reservationsQuery.data?.results ?? []),
    [reservationsQuery.data?.results],
  )
  const currentReservation = dashboardReservations.current
  const nextReservation = dashboardReservations.next

  const currentVehicleQuery = useQuery({
    queryKey: ['client-dashboard-current-vehicle', currentReservation?.vehicle.id],
    queryFn: () => getVehicleById(currentReservation!.vehicle.id),
    enabled: Boolean(currentReservation),
  })

  const nextVehicleQuery = useQuery({
    queryKey: ['client-dashboard-next-vehicle', nextReservation?.vehicle.id],
    queryFn: () => getVehicleById(nextReservation!.vehicle.id),
    enabled: Boolean(nextReservation),
  })

  const isLoading = profileQuery.isLoading || progressQuery.isLoading || reservationsQuery.isLoading
  const firstName = capitalizeFirstName(profileQuery.data?.first_name?.trim() || 'Client')
  const completion = progressQuery.data?.percentage ?? 0
  const profileIsFullyValidated = isProfileFullyValidated(progressQuery.data)
  const progressCircleStyle = { '--progress': completion } as CSSProperties
  const currentVehicleImageUrl = resolveMediaUrl(currentVehicleQuery.data?.main_photo?.file)
  const nextVehicleImageUrl = resolveMediaUrl(nextVehicleQuery.data?.main_photo?.file)

  if (isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du tableau de bord client" />
      </section>
    )
  }

  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
        <div className="flex flex-col gap-8">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[#0F172A]">Bonjour {firstName}</h1>
            </div>

            {profileQuery.isError || progressQuery.isError || reservationsQuery.isError ? (
              <Alert
                variant="danger"
                title="Certaines informations sont indisponibles"
                message="Le tableau de bord n'a pas pu charger l'ensemble des donnees client."
              />
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
              <Card className="h-full rounded-4xl border-none bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-[1.85rem] font-semibold tracking-tight text-[#0F172A]">Progression de votre profil</h2>
                  </div>

                  <div className="grid gap-x-10 gap-y-4 md:grid-cols-[192px_1fr] md:items-center">
                    <div className="relative mx-auto flex h-38 w-38 items-center justify-center rounded-full bg-[conic-gradient(#4F46E5_0deg,#4F46E5_calc(var(--progress)*3.6deg),#E2E8F0_calc(var(--progress)*3.6deg),#E2E8F0_360deg)]" style={progressCircleStyle}>
                      <div className="flex h-26 w-26 flex-col items-center justify-center rounded-full bg-white text-center shadow-[inset_0_1px_6px_rgba(15,23,42,0.08)]">
                        <span className="text-3xl font-semibold text-[#0F172A]">{completion}%</span>
                        <span className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Complet</span>
                      </div>
                    </div>

                    <ul className="space-y-3">
                      {progressSteps.map((step) => (
                        <li key={step.label} className="flex items-center gap-3 text-[0.92rem] font-semibold text-[#0F172A]">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full border ${step.done ? 'border-[#16A34A] bg-[#DCFCE7] text-[#16A34A]' : 'border-slate-300 bg-slate-100 text-transparent'}`}
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                          <span>{step.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {profileIsFullyValidated ? (
                    <div className="w-full rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7] px-4 py-2 text-sm font-medium text-[#166534]">
                      ✓ Votre profil est complet. Vous pouvez réserver un véhicule.
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-[#FCD34D] bg-[#FFEDD5] px-4 py-2 text-sm text-[#9A3412]">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium">⚠ Votre profil doit être complété et vos documents validés avant de pouvoir réserver un véhicule.</p>
                        <Link to="/client/profile?tab=documents" className="shrink-0">
                          <Button className="bg-[#F97316] text-white hover:bg-[#EA580C] focus-visible:ring-[#F97316]">
                            Compléter mon profil
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}

                </div>
              </Card>

              <div className="h-full">
                {currentReservation ? (
                  <CurrentReservationCard
                    reservation={currentReservation}
                    vehicleImageUrl={currentVehicleImageUrl}
                    isVehicleLoading={currentVehicleQuery.isLoading}
                  />
                ) : (
                  <ReservationPanel
                    title="Réservation en cours"
                    reservation={undefined}
                    emptyMessage="Aucune réservation en cours"
                  />
                )}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
              <div className="h-full">
              {nextReservation ? (
                <FutureReservationCard
                  reservation={nextReservation}
                  vehicleImageUrl={nextVehicleImageUrl}
                  isVehicleLoading={nextVehicleQuery.isLoading}
                />
              ) : (
                <ReservationPanel
                  title="Prochaine réservation"
                  reservation={undefined}
                  emptyMessage="Aucune réservation prévue"
                />
              )}
              </div>
            </div>
        </div>
      </div>
    </section>
  )
}