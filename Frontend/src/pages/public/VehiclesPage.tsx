import { useEffect, useMemo, useState } from 'react'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import { VehicleCard } from '../../components/vehicles'
import { getVehicles } from '../../services/vehicleService'
import type { PublicVehicle } from '../../types/vehicle'

function toVehicleList(payload: Awaited<ReturnType<typeof getVehicles>>): PublicVehicle[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload.results
}

export default function VehiclesPage() {
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

        setErrorMessage('Impossible de charger les vehicules pour le moment.')
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

  const cards = useMemo(
    () =>
      vehicles.map((vehicle) => ({
        id: vehicle.id,
        brand: vehicle.brand,
        modelName: vehicle.model_name,
        category: vehicle.category,
        pricePerDay: vehicle.category_daily_rate,
        fuelType: vehicle.fuel_type,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        status: vehicle.public_status,
        imageUrl: vehicle.main_photo?.file,
      })),
    [vehicles],
  )

  return (
    <section className="py-8 sm:py-10" aria-labelledby="vehicles-page-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 id="vehicles-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Nos vehicules
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Choisissez le vehicule qui correspond a votre trajet, votre confort et votre budget.
          </p>
        </header>

        {errorMessage ? (
          <Alert
            variant="danger"
            title="Erreur de chargement"
            message={errorMessage}
            className="mt-6"
          />
        ) : null}

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <LoadingSpinner aria-label="Chargement des vehicules" />
          </div>
        ) : null}

        {!isLoading && cards.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Aucun vehicule disponible"
              description="Le catalogue est temporairement vide. Revenez dans quelques instants."
            />
          </div>
        ) : null}

        {!isLoading && cards.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((vehicle) => (
              <VehicleCard key={vehicle.id} {...vehicle} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}