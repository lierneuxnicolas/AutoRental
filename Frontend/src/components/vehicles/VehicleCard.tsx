import { CarFront, Fuel, Gauge, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../ui/Card'

export interface VehicleCardProps {
  id: number
  brand: string
  modelName: string
  category: string
  pricePerDay: string | number
  fuelType: string
  transmission: string
  seats: number
  imageUrl?: string
  status?: string
}

function formatPricePerDay(pricePerDay: string | number) {
  if (typeof pricePerDay === 'number' && Number.isFinite(pricePerDay)) {
    return `${pricePerDay} €`
  }

  return `${pricePerDay}`
}

export default function VehicleCard({
  id,
  brand,
  modelName,
  category,
  pricePerDay,
  fuelType,
  transmission,
  seats,
  imageUrl,
  status,
}: VehicleCardProps) {
  const imageAlt = `${brand} ${modelName}`
  const hasImage = Boolean(imageUrl)

  return (
    <Card className="h-full rounded-2xl border-slate-200 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
      <article className="flex h-full flex-col" aria-label={`${brand} ${modelName}`}>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          {hasImage ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              className="h-44 w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200"
              role="img"
              aria-label={`Aucune image disponible pour ${imageAlt}`}
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <CarFront className="h-4 w-4" aria-hidden="true" />
                Visuel indisponible
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex-1">
          <p className="text-sm font-medium text-[#2563EB]">{category}</p>
          <h3 className="mt-1 text-xl font-semibold text-[#1F2937]">
            {brand} {modelName}
          </h3>
          {status ? <p className="mt-1 text-sm text-slate-500">{status}</p> : null}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <Users className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
              <dt className="sr-only">Sièges</dt>
              <dd>{seats} sièges</dd>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <Gauge className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
              <dt className="sr-only">Transmission</dt>
              <dd>{transmission}</dd>
            </div>
            <div className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <Fuel className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
              <dt className="sr-only">Carburant</dt>
              <dd>{fuelType}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prix par jour</p>
            <p className="mt-1 text-2xl font-semibold text-[#1F2937]">{formatPricePerDay(pricePerDay)}</p>
          </div>
          <Link
            to={`/vehicles/${id}`}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#2563EB] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            aria-label={`Voir les détails du véhicule ${brand} ${modelName}`}
          >
            Voir les détails
          </Link>
        </div>
      </article>
    </Card>
  )
}