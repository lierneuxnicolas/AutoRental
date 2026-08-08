import { Link } from 'react-router-dom'
import { VehicleCard } from '../vehicles'
import type { VehicleCardProps } from '../vehicles'

// Temporary local data used only for visual rendering.
// Replace this constant with API data when backend integration starts.
const POPULAR_VEHICLES: VehicleCardProps[] = [
  {
    id: 1,
    brand: 'Peugeot',
    modelName: '208',
    category: 'Citadine',
    pricePerDay: 42,
    fuelType: 'Essence',
    transmission: 'Manuelle',
    seats: 5,
  },
  {
    id: 2,
    brand: 'Renault',
    modelName: 'Clio',
    category: 'Citadine',
    pricePerDay: 45,
    fuelType: 'Essence',
    transmission: 'Manuelle',
    seats: 5,
  },
  {
    id: 3,
    brand: 'Volkswagen',
    modelName: 'T-Roc',
    category: 'SUV',
    pricePerDay: 65,
    fuelType: 'Essence',
    transmission: 'Automatique',
    seats: 5,
  },
]

export default function PopularVehicles() {
  return (
    <section className="mt-14 sm:mt-16" aria-labelledby="popular-vehicles-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h2 id="popular-vehicles-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
              Véhicules populaires
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
              Découvrez une sélection de véhicules disponibles sur AutoRental.
            </p>
          </div>

          <Link
            to="/vehicles"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-[#1F2937] shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Voir tous les véhicules
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 md:grid-cols-2 lg:grid-cols-3">
          {POPULAR_VEHICLES.map((vehicle) => (
            <VehicleCard key={vehicle.id} {...vehicle} />
          ))}
        </div>
      </div>
    </section>
  )
}