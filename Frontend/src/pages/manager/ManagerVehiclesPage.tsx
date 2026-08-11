import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getVehicles } from '../../services/vehicleService'
import type { VehicleManagementStatus } from '../../types/managementVehicle'
import type { PaginatedResponse, PublicVehicle } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'

type StatusFilter = 'all' | VehicleManagementStatus

type VehicleWithOptionalRegistration = PublicVehicle & {
  registration_number?: string | null
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
}

function VehicleMobileCard({ vehicle }: VehicleCardProps) {
  const statusUi = mapStatusToUi(vehicle.public_status)
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
          <Link to={`/manager/vehicles/${vehicle.id}/edit`}>
            <Button variant="secondary" size="sm">Modifier</Button>
          </Link>
          <Link to={`/manager/vehicles/${vehicle.id}/photos`}>
            <Button variant="secondary" size="sm">Gérer les photos</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => undefined}>Changer le statut</Button>
        </div>
      </div>
    </Card>
  )
}

function VehicleDesktopRow({ vehicle }: VehicleCardProps) {
  const statusUi = mapStatusToUi(vehicle.public_status)
  const registrationNumber = getRegistrationNumber(vehicle)
  const mainPhotoUrl = resolveMediaUrl(vehicle.main_photo?.file)

  return (
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
          <Link to={`/manager/vehicles/${vehicle.id}/edit`}>
            <Button variant="secondary" size="sm">Modifier</Button>
          </Link>
          <Link to={`/manager/vehicles/${vehicle.id}/photos`}>
            <Button variant="secondary" size="sm">Gérer les photos</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => undefined}>Changer le statut</Button>
        </div>
      </td>
    </tr>
  )
}

export default function ManagerVehiclesPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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

  const vehicles = useMemo(() => vehiclesQuery.data?.results ?? [], [vehiclesQuery.data?.results])

  const totalPages = useMemo(() => {
    if (!vehiclesQuery.data || vehiclesQuery.data.count === 0) {
      return 1
    }

    return Math.ceil(vehiclesQuery.data.count / vehicles.length)
  }, [vehicles.length, vehiclesQuery.data])

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSearchQuery(searchInput)
  }

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as StatusFilter)
    setPage(1)
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

        <Link to="/manager/vehicles/new">
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
                className="block h-[50px] w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
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
            {vehicles.map((vehicle) => (
              <VehicleMobileCard key={vehicle.id} vehicle={vehicle} />
            ))}
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
                {vehicles.map((vehicle) => (
                  <VehicleDesktopRow key={vehicle.id} vehicle={vehicle} />
                ))}
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
