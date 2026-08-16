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
  isAvailable?: boolean
  layout?: 'vertical' | 'horizontal'
  detailQueryString?: string
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
  isAvailable = true,
  layout = 'vertical',
  detailQueryString,
}: VehicleCardProps) {
  const imageAlt = `${brand} ${modelName}`
  const hasImage = Boolean(imageUrl)
  const isHorizontal = layout === 'horizontal'
  const normalizedStatus = status?.replaceAll('_', ' ').toLowerCase()
  const statusLabel = normalizedStatus
    ? `${normalizedStatus.charAt(0).toUpperCase()}${normalizedStatus.slice(1)}`
    : null
  const detailUrl = detailQueryString
    ? `/vehicles/${id}/reservation?${detailQueryString}`
    : `/vehicles/${id}`

  return (
    <Card
      className={`h-full rounded-2xl border-slate-200 shadow-[0_6px_20px_rgba(15,23,42,0.06)] ${
        isAvailable ? '' : 'opacity-60 saturate-75'
      }`}
    >
      <article
        className={isHorizontal ? 'grid h-full gap-6 md:grid-cols-[18rem_minmax(0,1fr)]' : 'flex h-full flex-col'}
        aria-label={`${brand} ${modelName}`}
        aria-disabled={!isAvailable}
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          {hasImage ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              className={isHorizontal ? 'h-56 w-full object-cover md:h-full' : 'h-44 w-full object-cover'}
              loading="lazy"
            />
          ) : (
            <div
              className={isHorizontal ? 'flex h-56 w-full items-center justify-center bg-linear-to-br from-slate-50 to-slate-200 md:h-full md:min-h-56' : 'flex h-44 w-full items-center justify-center bg-linear-to-br from-slate-50 to-slate-200'}
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

        <div className={isHorizontal ? 'flex min-w-0 flex-1 flex-col justify-between' : 'mt-5 flex-1'}>
          <div>
            <p className="text-sm font-medium text-[#2563EB]">{category}</p>
            <h3 className="mt-1 text-xl font-semibold text-[#1F2937] sm:text-2xl">
              {brand} {modelName}
            </h3>
            {statusLabel ? (
              <p className="mt-2 inline-flex rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">
                {statusLabel}
              </p>
            ) : null}

            <dl className={isHorizontal ? 'mt-5 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-3' : 'mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600'}>
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
              <div className={isHorizontal ? 'flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2' : 'col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2'}>
                <Fuel className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                <dt className="sr-only">Carburant</dt>
                <dd>{fuelType}</dd>
              </div>
            </dl>
          </div>

          <div className={isHorizontal ? 'mt-6 flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:items-end sm:justify-between' : 'mt-6 flex items-end justify-between gap-4 border-t border-slate-200 pt-4'}>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prix par jour</p>
              <p className="mt-1 text-2xl font-semibold text-[#1F2937]">{formatPricePerDay(pricePerDay)}</p>
            </div>
            {isAvailable ? (
              <Link
                to={detailUrl}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#2563EB] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                aria-label={`Voir les détails du véhicule ${brand} ${modelName}`}
              >
                Voir détail
              </Link>
            ) : (
              <span
                className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-2xl bg-slate-300 px-4 text-sm font-medium text-slate-600"
                aria-label={`Véhicule non disponible: ${brand} ${modelName}`}
              >
                Voir détail indisponible
              </span>
            )}
          </div>
        </div>
      </article>
    </Card>
  )
}