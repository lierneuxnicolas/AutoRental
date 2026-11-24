import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { VehicleCard } from '../../components/vehicles'
import { getAvailableVehicles } from '../../services/vehicleService'
import type { PublicVehicle } from '../../types/vehicle'
import { buildRentalDateTime, getFollowingDate, getMinimumStartDate, getRentalClock, RETURN_CLOCK, toDateValue } from '../../utils/rentalPeriod'

function toDateInputValue(value: string): string {
  if (!value) {
    return ''
  }

  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}(?::\d{2})?$)/.test(value)) {
    return value.slice(0, 10)
  }
  return toDateValue(parsedValue)
}

function toApiDateTime(value: string): string {
  if (!value) {
    return ''
  }

  const normalizedValue = value.length === 10 ? `${value}T10:00:00` : value.length === 16 ? `${value}:00` : value
  return Number.isNaN(new Date(normalizedValue).getTime()) ? '' : normalizedValue
}

function formatDateTimeLabel(value: string): string {
  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return value
  }

  return parsedValue.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Brussels',
  })
}

function toVehicleList(payload: Awaited<ReturnType<typeof getAvailableVehicles>>): PublicVehicle[] {
  return payload.results
}

export default function SearchPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState<PublicVehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resultCount, setResultCount] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [startInput, setStartInput] = useState(() => toDateInputValue(searchParams.get('start') ?? ''))
  const [endInput, setEndInput] = useState(() => toDateInputValue(searchParams.get('end') ?? ''))
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
        setErrorMessage('public.veuillez_renseigner_des_dates_pour_rechercher_des_vehicules_disponibles')
        return
      }

      const startDay = toDateInputValue(startParam)
      const endDay = toDateInputValue(endParam)
      if (startDay && endDay && startDay >= getMinimumStartDate()) {
        const canonicalStart = buildRentalDateTime(startDay, getRentalClock(startDay))
        const canonicalEnd = buildRentalDateTime(endDay, RETURN_CLOCK)
        if (startParam !== canonicalStart || endParam !== canonicalEnd) {
          const nextParams = new URLSearchParams(searchParams)
          nextParams.set('start', canonicalStart)
          nextParams.set('end', canonicalEnd)
          setSearchParams(nextParams, { replace: true })
          return
        }
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
        setErrorMessage('public.les_parametres_de_recherche_sont_invalides')
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
        setErrorMessage('public.la_date_de_fin_doit_etre_posterieure_a_la_date_de')
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
        setErrorMessage('public.impossible_de_charger_les_vehicules_disponibles_pour_le_moment')
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
  }, [searchParams, setSearchParams])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const normalizedStart = startInput.trim()
    const normalizedEnd = endInput.trim()
    const normalizedLocation = locationInput.trim()

    if (!normalizedStart || !normalizedEnd) {
      setFormError('public.veuillez_renseigner_une_date_de_debut_et_une_date_de_fin')
      return
    }

    const startIso = toApiDateTime(buildRentalDateTime(normalizedStart, getRentalClock(normalizedStart)))
    const endIso = toApiDateTime(buildRentalDateTime(normalizedEnd, RETURN_CLOCK))

    if (!startIso || !endIso) {
      setFormError('Les dates saisies sont invalides.')
      return
    }

    if (startInput < getMinimumStartDate()) {
      setFormError('public.la_date_de_depart_ne_peut_pas_etre_dans_le_passe')
      return
    }

    const startDate = new Date(startIso)
    const endDate = new Date(endIso)

    if (endDate <= startDate) {
      setFormError('public.la_date_de_fin_doit_etre_posterieure_a_la_date_de')
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
            {t('public.vehicules_disponibles')}
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            {t('public.consultez_instantly_les_vehicules_libres_pour_votre_periode_de_location')}
          </p>
          {hasSearchDates && searchedStart && searchedEnd ? (
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">{t('public.debut')} : {formatDateTimeLabel(searchedStart)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{t('public.fin')} : {formatDateTimeLabel(searchedEnd)}</span>
              {resultCount !== null ? <span className="rounded-full bg-slate-100 px-3 py-1">{t('public.count_resultat', { count: resultCount })}</span> : null}
            </div>
          ) : null}
        </header>

        {vehicleId ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Alert variant="info" title={t('public.recherche_liee_au_vehicule')} message={t('public.le_vehicule_selectionne_est_conserve_dans_lurl_pour_une_future_simulation', { id: vehicleId })} className="border-0 bg-transparent p-0" />
            <Link to={`/vehicles/${vehicleId}/simulation?${searchedStart ? `start=${encodeURIComponent(searchedStart)}` : ''}${searchedStart && searchedEnd ? '&' : ''}${searchedEnd ? `end=${encodeURIComponent(searchedEnd)}` : ''}`} className="inline-flex">
              <Button variant="danger">{t('public.simuler_le_prix')}</Button>
            </Link>
          </div>
        ) : null}

        <Card className="mt-6 border-slate-200">
          <form key={formKey} onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
            <Input
              label={t('public.lieu_de_prise_en_charge')}
              placeholder={t('public.ex_bruxelles_paris')}
              value={locationInput}
              onChange={(event) => setLocationInput(event.target.value)}
            />

            <Input
              label={t('public.date_de_depart')}
              type="date"
              min={getMinimumStartDate()}
              value={startInput}
              onChange={(event) => setStartInput(event.target.value)}
            />

            <Input
              label={t('public.date_de_retour')}
              type="date"
              min={startInput ? getFollowingDate(startInput) : getFollowingDate(getMinimumStartDate())}
              value={endInput}
              onChange={(event) => setEndInput(event.target.value)}
            />

            <p className="text-xs text-slate-500 md:col-span-3">{t('public.retour_a_10_h_location_minimale_dune_journee')}</p>

            <Button type="submit" variant="danger" className="w-full md:w-auto">
              {t('public.rechercher')}
            </Button>
          </form>

          {formError ? <Alert variant="danger" title={t('public.recherche_impossible')} message={t(formError)} className="mt-4" /> : null}
        </Card>

        {errorMessage ? (
          <Alert variant="danger" title={t('public.erreur_de_recherche')} message={t(errorMessage)} className="mt-6" />
        ) : null}

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <LoadingSpinner aria-label={t('public.chargement_des_vehicules_disponibles')} size="lg" />
          </div>
        ) : null}

        {!isLoading && cards.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title={t('public.aucun_vehicule_disponible')}
              description={t('public.aucune_offre_ne_correspond_a_votre_periode_de_location_pour_le')}
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