import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { VehicleCard } from '../../components/vehicles'
import { getAvailableVehicles } from '../../services/vehicleService'
import type { PublicVehicle } from '../../types/vehicle'

function toDateTimeLocalValue(value: string): string {
  if (!value) {
    return ''
  }

  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return ''
  }

  const year = parsedValue.getFullYear()
  const month = `${parsedValue.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsedValue.getDate()}`.padStart(2, '0')
  const hours = `${parsedValue.getHours()}`.padStart(2, '0')
  const minutes = `${parsedValue.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function toApiDateTime(value: string): string {
  if (!value) {
    return ''
  }

  const normalizedValue = value.length === 16 ? `${value}:00` : value
  const parsedValue = new Date(normalizedValue)

  if (Number.isNaN(parsedValue.getTime())) {
    return ''
  }

  return parsedValue.toISOString()
}

function formatDateTimeLabel(value: string): string {
  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return value
  }

  return parsedValue.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function toVehicleList(payload: Awaited<ReturnType<typeof getAvailableVehicles>>): PublicVehicle[] {
  return payload.results
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState<PublicVehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resultCount, setResultCount] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [startInput, setStartInput] = useState(() => toDateTimeLocalValue(searchParams.get('start') ?? ''))
  const [endInput, setEndInput] = useState(() => toDateTimeLocalValue(searchParams.get('end') ?? ''))
  const [locationInput, setLocationInput] = useState(() => searchParams.get('location') ?? '')
  const vehicleId = searchParams.get('vehicleId')

  useEffect(() => {
    let isMounted = true

    const loadVehicles = async () => {
      const startParam = searchParams.get('start')
      const endParam = searchParams.get('end')

      setIsLoading(true)
      setErrorMessage(null)
      setFormError(null)
      setResultCount(null)

      if (!startParam || !endParam) {
        if (!isMounted) {
          return
        }

        setVehicles([])
        setResultCount(null)
        setIsLoading(false)
        setErrorMessage('Veuillez renseigner des dates pour rechercher des véhicules disponibles.')
        return
      }

      const startIso = toApiDateTime(startParam)
      const endIso = toApiDateTime(endParam)

      if (!startIso || !endIso) {
        if (!isMounted) {
          return
        }

        setVehicles([])
        setResultCount(null)
        setIsLoading(false)
        setErrorMessage('Les paramètres de recherche sont invalides.')
        return
      }

      const startDate = new Date(startIso)
      const endDate = new Date(endIso)

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        if (!isMounted) {
          return
        }

        setVehicles([])
        setResultCount(null)
        setIsLoading(false)
        setErrorMessage('La date de fin doit être postérieure à la date de début.')
        return
      }

      try {
        const payload = await getAvailableVehicles({ start: startIso, end: endIso })

        if (!isMounted) {
          return
        }

        setVehicles(toVehicleList(payload))
        setResultCount(payload.count)
      } catch {
        if (!isMounted) {
          return
        }

        setVehicles([])
        setResultCount(null)
        setErrorMessage('Impossible de charger les véhicules disponibles pour le moment.')
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
  }, [searchParams])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const normalizedStart = startInput.trim()
    const normalizedEnd = endInput.trim()
    const normalizedLocation = locationInput.trim()

    if (!normalizedStart || !normalizedEnd) {
      setFormError('Veuillez renseigner une date de début et une date de fin.')
      return
    }

    const startIso = toApiDateTime(normalizedStart)
    const endIso = toApiDateTime(normalizedEnd)

    if (!startIso || !endIso) {
      setFormError('Les dates saisies sont invalides.')
      return
    }

    const startDate = new Date(startIso)
    const endDate = new Date(endIso)

    if (endDate <= startDate) {
      setFormError('La date de fin doit être postérieure à la date de début.')
      return
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('start', startIso)
    nextParams.set('end', endIso)

    if (normalizedLocation) {
      nextParams.set('location', normalizedLocation)
    } else {
      nextParams.delete('location')
    }

    if (vehicleId) {
      nextParams.set('vehicleId', vehicleId)
    }

    setSearchParams(nextParams)
  }

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

  const hasSearchDates = Boolean(searchParams.get('start') && searchParams.get('end'))
  const searchedStart = searchParams.get('start')
  const searchedEnd = searchParams.get('end')
  const formKey = `${searchParams.get('start') ?? ''}|${searchParams.get('end') ?? ''}|${searchParams.get('location') ?? ''}`

  return (
    <section className="py-8 sm:py-10" aria-labelledby="search-page-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 id="search-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Véhicules disponibles
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Consultez instantly les véhicules libres pour votre période de location.
          </p>
          {hasSearchDates && searchedStart && searchedEnd ? (
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">Début : {formatDateTimeLabel(searchedStart)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">Fin : {formatDateTimeLabel(searchedEnd)}</span>
              {resultCount !== null ? <span className="rounded-full bg-slate-100 px-3 py-1">{resultCount} résultat{resultCount > 1 ? 's' : ''}</span> : null}
            </div>
          ) : null}
        </header>

        {vehicleId ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Alert variant="info" title="Recherche liée au véhicule" message={`Le véhicule sélectionné est conservé dans l’URL pour une future simulation : ${vehicleId}.`} className="border-0 bg-transparent p-0" />
            <Link to={`/simulation?vehicleId=${vehicleId}${searchedStart ? `&start=${encodeURIComponent(searchedStart)}` : ''}${searchedEnd ? `&end=${encodeURIComponent(searchedEnd)}` : ''}`} className="inline-flex">
              <Button variant="danger">Simuler le prix</Button>
            </Link>
          </div>
        ) : null}

        <Card className="mt-6 border-slate-200">
          <form key={formKey} onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
            <Input
              label="Lieu de prise en charge"
              placeholder="Ex: Bruxelles, Paris"
              value={locationInput}
              onChange={(event) => setLocationInput(event.target.value)}
            />

            <Input
              label="Date et heure de début"
              type="datetime-local"
              value={startInput}
              onChange={(event) => setStartInput(event.target.value)}
            />

            <Input
              label="Date et heure de fin"
              type="datetime-local"
              value={endInput}
              onChange={(event) => setEndInput(event.target.value)}
            />

            <Button type="submit" variant="danger" className="w-full md:w-auto">
              Rechercher
            </Button>
          </form>

          {formError ? <Alert variant="danger" title="Recherche impossible" message={formError} className="mt-4" /> : null}
        </Card>

        {errorMessage ? (
          <Alert variant="danger" title="Erreur de recherche" message={errorMessage} className="mt-6" />
        ) : null}

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <LoadingSpinner aria-label="Chargement des véhicules disponibles" size="lg" />
          </div>
        ) : null}

        {!isLoading && cards.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Aucun véhicule disponible"
              description="Aucune offre ne correspond à votre période de location pour le moment."
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