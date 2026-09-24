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
  return new Intl.DateTimeFormat('fr-FR', {
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
  return `${new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount)} / jour`
}

function formatMoney(value: string): string {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount)
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
  const url = resolveMediaUrl(file)
  if (!url) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Sans photo
      </div>
    )
  }
  return <img src={url} alt={label} className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover" />
}

export default function ReservationReassignmentPanel({ reservation, basePath }: ReservationReassignmentPanelProps) {
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
          <h1 className="text-3xl font-semibold text-[#0F172A]">Réaffecter la réservation</h1>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Référence</dt><dd className="mt-1 font-semibold text-[#1F2937]">{reservation.reference}</dd></div>
            <div><dt className="text-slate-500">Client</dt><dd className="mt-1 font-semibold text-[#1F2937]">{clientName || reservation.client_summary.email}</dd></div>
            <div><dt className="text-slate-500">Période</dt><dd className="mt-1 font-semibold leading-6 text-[#1F2937]">{formatDateTime(reservation.start_at)}<br />→ {formatDateTime(reservation.end_at)}</dd></div>
          </dl>
        </div>
        {candidatesQuery.isLoading || candidatesQuery.isError || candidates.length > 0 ? (
          <Link to={`${basePath}/reservations/${reservation.id}`}><Button variant="secondary">Retour</Button></Link>
        ) : null}
      </div>

      <Card header={<h2 className="text-base font-semibold text-[#0F172A]">Véhicule indisponible</h2>}>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
          <VehicleImage file={currentPhoto} label={currentVehicleName} />
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-lg font-semibold text-[#0F172A]">{currentVehicleName}</p><p className="text-slate-500">{reservation.vehicle.registration_plate || '—'}</p></div>
            <div><p className="text-slate-500">Statut actuel</p><p className="mt-1 font-medium text-[#1F2937]">{formatVehicleStatus(reservation.vehicle.status)}</p></div>
            <div className="sm:col-span-2"><p className="text-slate-500">Parking / place</p><p className="mt-1 font-medium text-[#1F2937]">{reservation.vehicle.parking_name ?? 'Parking non renseigné'} · {reservation.vehicle.parking_space_number ?? '—'}</p></div>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="text-xl font-semibold text-[#0F172A]">Véhicules de remplacement</h2>
        <p className="mt-1 text-sm text-slate-500">Disponibles pendant toute la période. La même catégorie est affichée en premier.</p>
      </div>

      {candidatesQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><LoadingSpinner size="lg" aria-label="Chargement des véhicules" /></div> : null}
      {candidatesQuery.isError ? <Alert variant="danger" title="Chargement impossible" message={errorMessage(candidatesQuery.error)} /> : null}

      {!candidatesQuery.isLoading && !candidatesQuery.isError && candidates.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="Aucun véhicule de remplacement disponible pour cette période."
            description="Aucune annulation ni opération financière n’a été effectuée."
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`${basePath}/reservations`}><Button variant="secondary">Retour</Button></Link>
            <Button variant="danger" onClick={() => setIsCancellationOpen(true)}>Annuler la réservation</Button>
          </div>
        </div>
      ) : null}

      {isCancellationOpen && candidates.length === 0 ? (
        <Card className="border-red-200" header={<h2 className="text-lg font-semibold text-red-700">Annuler cette réservation ?</h2>}>
          <p className="text-sm leading-6 text-slate-700">
            Aucun véhicule de remplacement n’est disponible. La réservation sera annulée et les sommes éligibles seront remboursées.
          </p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-slate-500">Référence</dt><dd className="mt-1 font-semibold text-[#1F2937]">{reservation.reference}</dd></div>
            <div><dt className="text-slate-500">Client</dt><dd className="mt-1 font-semibold text-[#1F2937]">{clientName || reservation.client_summary.email}</dd></div>
            <div><dt className="text-slate-500">Véhicule initial</dt><dd className="mt-1 font-semibold text-[#1F2937]">{currentVehicleName}</dd></div>
            <div><dt className="text-slate-500">Période</dt><dd className="mt-1 font-semibold text-[#1F2937]">{formatDateTime(reservation.start_at)}<br />→ {formatDateTime(reservation.end_at)}</dd></div>
            <div><dt className="text-slate-500">Montant de la réservation</dt><dd className="mt-1 font-semibold text-[#1F2937]">{formatMoney(reservation.rental_amount)}</dd></div>
            {Number(reservation.deposit_amount) > 0 ? (
              <div><dt className="text-slate-500">Caution</dt><dd className="mt-1 font-semibold text-[#1F2937]">{formatMoney(reservation.deposit_amount)} · {reservation.deposit_status ?? 'Statut non renseigné'}</dd></div>
            ) : null}
          </dl>
          {cancellationMutation.isError ? (
            <Alert className="mt-4" variant="danger" title="Annulation impossible" message={errorMessage(cancellationMutation.error)} />
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCancellationOpen(false)} disabled={cancellationMutation.isPending}>Retour</Button>
            <Button variant="danger" onClick={() => cancellationMutation.mutate()} disabled={cancellationMutation.isPending}>
              {cancellationMutation.isPending ? 'Annulation...' : 'Confirmer l’annulation'}
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
                    <p><span className="text-slate-500">Catégorie :</span> {vehicle.category}</p>
                    <p><span className="text-slate-500">Parking :</span> {vehicle.parking_name ?? '—'} · {vehicle.parking_space_number ?? '—'}</p>
                    <p><span className="text-slate-500">Prix actuel :</span> {formatPrice(vehicle.category_daily_rate)}</p>
                  </div>
                  <Button className="w-full" onClick={() => setSelectedVehicle(vehicle)}>Choisir ce véhicule</Button>
                </div>
              </Card>
            )
          })}
        </div>
      ) : null}

      {selectedVehicle ? (
        <Card className="border-[#93C5FD]" header={<h2 className="text-lg font-semibold text-[#0F172A]">Confirmer la réaffectation ?</h2>}>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div><p className="text-slate-500">Ancien véhicule</p><p className="mt-1 font-semibold text-[#1F2937]">{currentVehicleName}</p></div>
            <div><p className="text-slate-500">Nouveau véhicule</p><p className="mt-1 font-semibold text-[#1F2937]">{selectedVehicle.brand} {selectedVehicle.model_name}</p></div>
            <div><p className="text-slate-500">Période</p><p className="mt-1 font-semibold text-[#1F2937]">{formatDateTime(reservation.start_at)}<br />→ {formatDateTime(reservation.end_at)}</p></div>
          </div>
          {mutation.isError ? <Alert className="mt-4" variant="danger" title="Réaffectation impossible" message={errorMessage(mutation.error)} /> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelectedVehicle(null)} disabled={mutation.isPending}>Annuler</Button>
            <Button onClick={() => mutation.mutate(selectedVehicle.id)} disabled={mutation.isPending}>
              {mutation.isPending ? 'Réaffectation...' : 'Confirmer la réaffectation'}
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  )
}
