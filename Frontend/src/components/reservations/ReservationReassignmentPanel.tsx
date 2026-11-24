import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../feedback/Alert'
import EmptyState from '../feedback/EmptyState'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { cancelUnavailableManagementReservation, getReservationReplacementVehicles, reassignManagementReservation } from '../../services/managementReservationService'
import type { ReservationManagementDetail, ReservationReplacementVehicle } from '../../types/managementReservation'
import { resolveMediaUrl } from '../../utils/media'

interface ReservationReassignmentPanelProps {
  reservation: ReservationManagementDetail
  basePath: string
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(clientLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value)).replace(',', '')
}

function formatPrice(value: string): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return `${value} EUR / jour`
  }
  return `${new Intl.NumberFormat(clientLocale(), { style: 'currency', currency: 'EUR' }).format(amount)} / jour`
}

function formatMoney(value: string): string {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(clientLocale(), { style: 'currency', currency: 'EUR' }).format(amount)
    : `${value} EUR`
}

function formatVehicleStatus(status: string): string {
  const labels: Record<string, string> = {
    ACCIDENTE: 'Accidenté',
    A_CONTROLER: 'À contrôler',
    INDISPONIBLE: 'Indisponible',
    MAINTENANCE: 'Maintenance',
    NETTOYAGE: 'Nettoyage',
  }
  return labels[status] ?? status
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
  }
  return 'La réaffectation n’a pas pu être effectuée.'
}

function VehicleImage({ file, label }: { file: string | null | undefined; label: string }) {
  const { t } = useTranslation()
  const url = resolveMediaUrl(file)
  if (!url) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        {t("professional.sans_photo")}</div>
    )
  }
  return <img src={url} alt={label} className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover" />
}

export default function ReservationReassignmentPanel({ reservation, basePath }: ReservationReassignmentPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedVehicle, setSelectedVehicle] = useState<ReservationReplacementVehicle | null>(null)
  const [isCancellationOpen, setIsCancellationOpen] = useState(false)

  const candidatesQuery = useQuery({
    queryKey: ['manager-reservation-replacement-vehicles', reservation.id],
    queryFn: () => getReservationReplacementVehicles(reservation.id),
  })

  const mutation = useMutation({
    mutationFn: (vehicleId: number) => reassignManagementReservation(reservation.id, vehicleId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservation.id] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
      ])
      navigate(`${basePath}/reservations/${reservation.id}`, { replace: true })
    },
  })

  const cancellationMutation = useMutation({
    mutationFn: () => cancelUnavailableManagementReservation(reservation.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-reservation-detail', reservation.id] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
      ])
      navigate(`${basePath}/reservations/${reservation.id}`, {
        replace: true,
        state: { toast: 'Réservation annulée.' },
      })
    },
  })

  const clientName = `${reservation.client_summary.last_name} ${reservation.client_summary.first_name}`.trim()
  const currentVehicleName = `${reservation.vehicle.brand} ${reservation.vehicle.model_name}`
  const currentPhoto = reservation.vehicle.main_photo?.file
  const candidates = candidatesQuery.data ?? []

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#0F172A]">{t("professional.reaffecter_la_reservation")}</h1>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">{t("client.reference_alt")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{reservation.reference}</dd></div>
            <div><dt className="text-slate-500">{t("professional.client")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{clientName || reservation.client_summary.email}</dd></div>
            <div><dt className="text-slate-500">{t("client.periode")}</dt><dd className="mt-1 font-semibold leading-6 text-[#1F2937]">{formatDateTime(reservation.start_at)}<br />→ {formatDateTime(reservation.end_at)}</dd></div>
          </dl>
        </div>
        {candidatesQuery.isLoading || candidatesQuery.isError || candidates.length > 0 ? (
          <Link to={`${basePath}/reservations/${reservation.id}`}><Button variant="secondary">{t("public.retour")}</Button></Link>
        ) : null}
      </div>

      <Card header={<h2 className="text-base font-semibold text-[#0F172A]">{t("professional.vehicule_indisponible")}</h2>}>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
          <VehicleImage file={currentPhoto} label={currentVehicleName} />
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-lg font-semibold text-[#0F172A]">{currentVehicleName}</p><p className="text-slate-500">{reservation.vehicle.registration_plate || '—'}</p></div>
            <div><p className="text-slate-500">{t("professional.statut_actuel")}</p><p className="mt-1 font-medium text-[#1F2937]">{formatVehicleStatus(reservation.vehicle.status)}</p></div>
            <div className="sm:col-span-2"><p className="text-slate-500">{t("professional.parking_place")}</p><p className="mt-1 font-medium text-[#1F2937]">{reservation.vehicle.parking_name ?? t("professional.parking_non_renseigne")} · {reservation.vehicle.parking_space_number ?? '—'}</p></div>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="text-xl font-semibold text-[#0F172A]">{t("professional.vehicules_de_remplacement")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("professional.disponibles_pendant_toute_la_periode_la_meme_categorie_est_affichee_en_premier")}</p>
      </div>

      {candidatesQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><LoadingSpinner size="lg" aria-label={t("professional.chargement_des_vehicules")} /></div> : null}
      {candidatesQuery.isError ? <Alert variant="danger" title={t("client.chargement_impossible")} message={errorMessage(candidatesQuery.error)} /> : null}

      {!candidatesQuery.isLoading && !candidatesQuery.isError && candidates.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={t("professional.aucun_vehicule_de_remplacement_disponible_pour_cette_periode")}
            description={t("professional.aucune_annulation_ni_operation_financiere_n_a_ete_effectuee")}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`${basePath}/reservations`}><Button variant="secondary">{t("public.retour")}</Button></Link>
            <Button variant="danger" onClick={() => setIsCancellationOpen(true)}>{t("client.annuler_la_reservation")}</Button>
          </div>
        </div>
      ) : null}

      {isCancellationOpen && candidates.length === 0 ? (
        <Card className="border-red-200" header={<h2 className="text-lg font-semibold text-red-700">{t("professional.annuler_cette_reservation")}</h2>}>
          <p className="text-sm leading-6 text-slate-700">
            {t("professional.aucun_vehicule_de_remplacement_n_est_disponible_la_reservation_sera_annulee_et")}</p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-slate-500">{t("client.reference_alt")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{reservation.reference}</dd></div>
            <div><dt className="text-slate-500">{t("professional.client")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{clientName || reservation.client_summary.email}</dd></div>
            <div><dt className="text-slate-500">{t("professional.vehicule_initial")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{currentVehicleName}</dd></div>
            <div><dt className="text-slate-500">{t("client.periode")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{formatDateTime(reservation.start_at)}<br />→ {formatDateTime(reservation.end_at)}</dd></div>
            <div><dt className="text-slate-500">{t("professional.montant_de_la_reservation")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{formatMoney(reservation.rental_amount)}</dd></div>
            {Number(reservation.deposit_amount) > 0 ? (
              <div><dt className="text-slate-500">{t("public.caution")}</dt><dd className="mt-1 font-semibold text-[#1F2937]">{formatMoney(reservation.deposit_amount)} · {reservation.deposit_status ?? 'Statut non renseigné'}</dd></div>
            ) : null}
          </dl>
          {cancellationMutation.isError ? (
            <Alert className="mt-4" variant="danger" title={t("client.annulation_impossible")} message={errorMessage(cancellationMutation.error)} />
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCancellationOpen(false)} disabled={cancellationMutation.isPending}>{t("public.retour")}</Button>
            <Button variant="danger" onClick={() => cancellationMutation.mutate()} disabled={cancellationMutation.isPending}>
              {cancellationMutation.isPending ? t("client.annulation") : t("professional.confirmer_l_annulation")}
            </Button>
          </div>
        </Card>
      ) : null}

      {candidates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {candidates.map((vehicle) => {
            const name = `${vehicle.brand} ${vehicle.model_name}`
            return (
              <Card key={vehicle.id}>
                <div className="space-y-4">
                  <VehicleImage file={vehicle.main_photo?.file} label={name} />
                  <div>
                    <p className="text-lg font-semibold text-[#0F172A]">{name}</p>
                    <p className="text-sm text-slate-500">{vehicle.registration_number}</p>
                  </div>
                  <div className="space-y-1 text-sm text-[#1F2937]">
                    <p><span className="text-slate-500">{t("professional.categorie_2")}</span> {vehicle.category}</p>
                    <p><span className="text-slate-500">{t("professional.parking")}</span> {vehicle.parking_name ?? '—'} · {vehicle.parking_space_number ?? '—'}</p>
                    <p><span className="text-slate-500">{t("professional.prix_actuel")}</span> {formatPrice(vehicle.category_daily_rate)}</p>
                  </div>
                  <Button className="w-full" onClick={() => setSelectedVehicle(vehicle)}>{t("professional.choisir_ce_vehicule")}</Button>
                </div>
              </Card>
            )
          })}
        </div>
      ) : null}

      {selectedVehicle ? (
        <Card className="border-[#93C5FD]" header={<h2 className="text-lg font-semibold text-[#0F172A]">{t("professional.confirmer_la_reaffectation_2")}</h2>}>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div><p className="text-slate-500">{t("professional.ancien_vehicule")}</p><p className="mt-1 font-semibold text-[#1F2937]">{currentVehicleName}</p></div>
            <div><p className="text-slate-500">{t("professional.nouveau_vehicule")}</p><p className="mt-1 font-semibold text-[#1F2937]">{selectedVehicle.brand} {selectedVehicle.model_name}</p></div>
            <div><p className="text-slate-500">{t("client.periode")}</p><p className="mt-1 font-semibold text-[#1F2937]">{formatDateTime(reservation.start_at)}<br />→ {formatDateTime(reservation.end_at)}</p></div>
          </div>
          {mutation.isError ? <Alert className="mt-4" variant="danger" title={t("professional.reaffectation_impossible")} message={errorMessage(mutation.error)} /> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelectedVehicle(null)} disabled={mutation.isPending}>{t("client.annuler")}</Button>
            <Button onClick={() => mutation.mutate(selectedVehicle.id)} disabled={mutation.isPending}>
              {mutation.isPending ? t("professional.reaffectation") : t("professional.confirmer_la_reaffectation")}
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  )
}
