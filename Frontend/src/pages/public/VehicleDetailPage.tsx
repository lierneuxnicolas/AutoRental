import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getVehicleById } from '../../services/vehicleService'
import type { PublicVehicle, VehiclePhoto } from '../../types/vehicle'

function statusToBadge(status: string): { label: string; variant: StatusVariant } {
  const upperStatus = status.toUpperCase()

  if (upperStatus === 'DISPONIBLE') {
    return { label: 'Disponible', variant: 'success' }
  }

  if (upperStatus === 'LOUE') {
    return { label: 'Loue', variant: 'warning' }
  }

  if (upperStatus === 'INDISPONIBLE') {
    return { label: 'Indisponible', variant: 'danger' }
  }

  const lowered = status.replaceAll('_', ' ').toLowerCase()
  const label = lowered.charAt(0).toUpperCase() + lowered.slice(1)
  return { label, variant: 'neutral' }
}

function buildGallery(vehicle: PublicVehicle): { main: VehiclePhoto | null; secondary: VehiclePhoto[] } {
  const secondaryPhotos = vehicle.photos.filter((photo) => {
    if (!vehicle.main_photo) {
      return true
    }

    return photo.id !== vehicle.main_photo.id
  })

  return {
    main: vehicle.main_photo,
    secondary: secondaryPhotos,
  }
}

function formatRate(rate: string): string {
  const parsedRate = Number(rate)
  if (!Number.isFinite(parsedRate)) {
    return `${rate} EUR / jour`
  }

  return `${parsedRate.toFixed(2)} EUR / jour`
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isNotFound, setIsNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadVehicleById() {
      if (!id) {
        setErrorMessage('Identifiant du vehicule manquant.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setErrorMessage(null)
      setIsNotFound(false)

      try {
        const payload = await getVehicleById(id)

        if (!isMounted) {
          return
        }

        setVehicle(payload)
      } catch (error) {
        if (!isMounted) {
          return
        }

        const axiosError = error as AxiosError
        if (axiosError.response?.status === 404) {
          setIsNotFound(true)
          setVehicle(null)
        } else {
          setErrorMessage('Impossible de charger ce vehicule pour le moment.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadVehicleById()

    return () => {
      isMounted = false
    }
  }, [id])

  const gallery = useMemo(() => (vehicle ? buildGallery(vehicle) : null), [vehicle])
  const status = useMemo(() => (vehicle ? statusToBadge(vehicle.public_status) : null), [vehicle])

  if (isLoading) {
    return (
      <section className="py-8 sm:py-10" aria-label="Chargement du vehicule">
        <div className="mx-auto flex max-w-7xl justify-center px-4 sm:px-6 lg:px-8">
          <LoadingSpinner aria-label="Chargement du vehicule" size="lg" />
        </div>
      </section>
    )
  }

  if (isNotFound) {
    return (
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <EmptyState
            title="Vehicule introuvable"
            description="Le vehicule demande n'existe pas ou n'est plus accessible."
            action={
              <Link to="/vehicles" className="inline-flex">
                <Button variant="secondary">Retour au catalogue</Button>
              </Link>
            }
          />
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Alert
            variant="danger"
            title="Erreur reseau"
            message={errorMessage}
          />
        </div>
      </section>
    )
  }

  if (!vehicle || !status || !gallery) {
    return (
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <EmptyState
            title="Donnees indisponibles"
            description="Les informations de ce vehicule sont incompletes pour le moment."
          />
        </div>
      </section>
    )
  }

  return (
    <section className="py-8 sm:py-10" aria-labelledby="vehicle-detail-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#2563EB]">{vehicle.category}</p>
            <h1 id="vehicle-detail-title" className="mt-1 text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
              {vehicle.brand} {vehicle.model_name}
            </h1>
          </div>
          <StatusBadge variant={status.variant} label={status.label} />
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {gallery.main ? (
              <img
                src={gallery.main.file}
                alt={`${vehicle.brand} ${vehicle.model_name}`}
                className="h-64 w-full rounded-2xl object-cover sm:h-80"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-200 sm:h-80">
                <p className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600">
                  Aucune photo principale disponible
                </p>
              </div>
            )}

            {gallery.secondary.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.secondary.map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.file}
                    alt={`Photo du vehicule ${vehicle.brand} ${vehicle.model_name}`}
                    className="h-28 w-full rounded-xl object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : null}
          </Card>

          <Card
            header={<h2 className="text-lg font-semibold text-[#1F2937]">Tarif journalier</h2>}
            footer={
              <div className="flex flex-col gap-3">
                <Link to={`/search?vehicleId=${vehicle.id}`} className="w-full">
                  <Button className="w-full">Verifier la disponibilite</Button>
                </Link>
                <Link to={`/search?vehicleId=${vehicle.id}`} className="w-full">
                  <Button variant="secondary" className="w-full">Simuler le prix</Button>
                </Link>
              </div>
            }
          >
            <p className="text-3xl font-semibold text-[#1F2937]">{formatRate(vehicle.category_daily_rate)}</p>
          </Card>

          <Card
            className="lg:col-span-2"
            header={<h2 className="text-lg font-semibold text-[#1F2937]">Caracteristiques</h2>}
          >
            <dl className="grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Annee</dt>
                <dd className="mt-1 font-medium">{vehicle.year}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Couleur</dt>
                <dd className="mt-1 font-medium">{vehicle.color}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Carburant</dt>
                <dd className="mt-1 font-medium">{vehicle.fuel_type}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Transmission</dt>
                <dd className="mt-1 font-medium">{vehicle.transmission}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Sieges</dt>
                <dd className="mt-1 font-medium">{vehicle.seats}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Portes</dt>
                <dd className="mt-1 font-medium">{vehicle.doors}</dd>
              </div>
            </dl>
          </Card>

          <Card
            header={<h2 className="text-lg font-semibold text-[#1F2937]">Localisation</h2>}
          >
            <div className="space-y-3 text-sm text-slate-700">
              {vehicle.parking_name ? (
                <p>
                  <span className="font-semibold text-[#1F2937]">Parking:</span> {vehicle.parking_name}
                </p>
              ) : null}
              {vehicle.parking_address ? (
                <p>
                  <span className="font-semibold text-[#1F2937]">Adresse:</span> {vehicle.parking_address}
                </p>
              ) : null}
              {vehicle.parking_space_number ? (
                <p>
                  <span className="font-semibold text-[#1F2937]">Place:</span> {vehicle.parking_space_number}
                </p>
              ) : null}

              {!vehicle.parking_name && !vehicle.parking_address && !vehicle.parking_space_number ? (
                <p className="text-slate-500">Aucune information de localisation disponible.</p>
              ) : null}
            </div>
          </Card>

          <Card
            className="lg:col-span-3"
            header={<h2 className="text-lg font-semibold text-[#1F2937]">Description</h2>}
          >
            {vehicle.description ? (
              <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{vehicle.description}</p>
            ) : (
              <p className="text-sm text-slate-500">Aucune description disponible pour ce vehicule.</p>
            )}
          </Card>
        </div>
      </div>
    </section>
  )
}