import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, LoadingSpinner } from '../feedback'
import { VehicleCard } from '../vehicles'
import type { VehicleCardProps } from '../vehicles'
import { getVehicles } from '../../services/vehicleService'
import type { PublicVehicle } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'

type PopularVehicleCandidate = PublicVehicle & {
  popular?: boolean
}

function toVehicleList(payload: Awaited<ReturnType<typeof getVehicles>>): PublicVehicle[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload.results
}

export default function PopularVehicles() {
  const [vehicles, setVehicles] = useState<PublicVehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadVehicles() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await getVehicles()

        if (!isMounted) {
          return
        }

        setVehicles(toVehicleList(payload))
      } catch {
        if (!isMounted) {
          return
        }

        setVehicles([])
        setErrorMessage('Impossible de charger les véhicules populaires pour le moment.')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadVehicles()

    return () => {
      isMounted = false
    }
  }, [])

  const popularCards = useMemo(() => {
    const candidateVehicles = vehicles as PopularVehicleCandidate[]
    const hasPopularFlag = candidateVehicles.some((vehicle) => vehicle.popular === true)

    // Fallback: if API does not expose a "popular" flag, use the first 3 available vehicles.
    const selectedVehicles = hasPopularFlag
      ? candidateVehicles.filter((vehicle) => vehicle.popular === true).slice(0, 3)
      : candidateVehicles.slice(0, 3)

    return selectedVehicles.map<VehicleCardProps>((vehicle) => ({
      id: vehicle.id,
      brand: vehicle.brand,
      modelName: vehicle.model_name,
      category: vehicle.category,
      pricePerDay: vehicle.category_daily_rate,
      fuelType: vehicle.fuel_type,
      transmission: vehicle.transmission,
      seats: vehicle.seats,
      imageUrl: resolveMediaUrl(vehicle.main_photo?.file) ?? undefined,
      status: vehicle.public_status,
    }))
  }, [vehicles])

  return (
    <section aria-labelledby="popular-vehicles-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h2 id="popular-vehicles-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
              Véhicules populaires
            </h2>
          </div>

          <Link
            to="/vehicles"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-[#1F2937] shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Voir tous les véhicules
          </Link>
        </div>

        {errorMessage ? (
          <Alert variant="danger" title="Erreur de chargement" message={errorMessage} className="mt-8" />
        ) : null}

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <LoadingSpinner aria-label="Chargement des véhicules populaires" />
          </div>
        ) : null}

        {!isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 md:grid-cols-2 lg:grid-cols-3">
            {popularCards.map((vehicle) => (
              <VehicleCard key={vehicle.id} {...vehicle} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}