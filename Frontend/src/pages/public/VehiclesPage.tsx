import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import { VehicleCard } from '../../components/vehicles'
import { Card, Input, Select } from '../../components/ui'
import { getAvailableVehicles, getVehicles } from '../../services/vehicleService'
import type { PublicVehicle } from '../../types/vehicle'
import { buildRentalDateTime, getFollowingDate, getMinimumStartDate, getRentalClock, RETURN_CLOCK } from '../../utils/rentalPeriod'

const SORT_OPTIONS = [
  { value: 'popularity', label: 'public.popularite' },
  { value: 'price-asc', label: 'public.prix_croissant' },
  { value: 'price-desc', label: 'public.prix_decroissant' },
  { value: 'name-asc', label: 'public.nom_a_z' },
]

const API_ERROR_MESSAGE = 'public.impossible_de_charger_les_vehicules_veuillez_reessayer'

function toSelectOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }))
}

function normalizeFilterValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function toNumericPrice(value: string | number) {
  if (typeof value === 'number') {
    return value
  }

  const normalizedValue = Number.parseFloat(value)
  return Number.isFinite(normalizedValue) ? normalizedValue : 0
}

function splitDateTimeParam(value: string | null): string | null {
  if (!value) {
    return null
  }

  const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (directMatch) {
    return directMatch[1]
  }

  const parsedValue = new Date(value)
  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }

  const year = parsedValue.getFullYear()
  const month = `${parsedValue.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsedValue.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidDateTimeValue(value: string) {
  return !Number.isNaN(new Date(value).getTime())
}

const HARD_UNAVAILABLE_PUBLIC_STATUSES = new Set([
  'A_CONTROLER',
  'MAINTENANCE',
  'NETTOYAGE',
  'ACCIDENTE',
  'INDISPONIBLE',
])

function isVehicleConsultableWithoutDateRange(status: string) {
  return !HARD_UNAVAILABLE_PUBLIC_STATUSES.has(status.toUpperCase())
}

function toVehicleList(payload: Awaited<ReturnType<typeof getVehicles>>): PublicVehicle[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload.results
}

export default function VehiclesPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStartDate = splitDateTimeParam(searchParams.get('start'))
  const initialEndDate = splitDateTimeParam(searchParams.get('end'))
  const [vehicles, setVehicles] = useState<PublicVehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sortOption, setSortOption] = useState('popularity')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTransmission, setSelectedTransmission] = useState('')
  const [selectedFuelType, setSelectedFuelType] = useState('')
  const [startDate, setStartDate] = useState(() => initialStartDate ?? searchParams.get('startDate') ?? '')
  const [endDate, setEndDate] = useState(() => initialEndDate ?? searchParams.get('endDate') ?? '')
  const [availableVehicleIds, setAvailableVehicleIds] = useState<Set<number> | null>(null)
  const [availabilityErrorMessage, setAvailabilityErrorMessage] = useState<string | null>(null)
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [vehiclesReloadKey, setVehiclesReloadKey] = useState(0)
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const detailQueryString = useMemo(() => {
    const nextParams = new URLSearchParams()
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    if (start) {
      nextParams.set('start', start)
    }

    if (end) {
      nextParams.set('end', end)
    }

    return nextParams.toString()
  }, [searchParams])

  const isDateRangeComplete = Boolean(startDate && endDate)
  const rentalClock = useMemo(() => getRentalClock(startDate, new Date(clockNow)), [startDate, clockNow])
  const toDateTimeValue = useCallback((date: string) => buildRentalDateTime(date, rentalClock), [rentalClock])
  const toReturnDateTimeValue = useCallback((date: string) => buildRentalDateTime(date, RETURN_CLOCK), [])

  const dateValidationMessage = useMemo(() => {
    if (!isDateRangeComplete) {
      return null
    }

    const startDateTimeValue = toDateTimeValue(startDate)
    const endDateTimeValue = toReturnDateTimeValue(endDate)

    if (!isValidDateTimeValue(startDateTimeValue) || !isValidDateTimeValue(endDateTimeValue)) {
      return 'Les dates saisies sont invalides.'
    }

    if (startDate < getMinimumStartDate()) {
      return 'public.la_date_de_depart_ne_peut_pas_etre_dans_le_passe'
    }

    if (new Date(endDateTimeValue).getTime() <= new Date(startDateTimeValue).getTime()) {
      return 'public.la_date_de_retour_doit_etre_posterieure_a_la_date_de'
    }

    return null
  }, [endDate, isDateRangeComplete, startDate, toDateTimeValue, toReturnDateTimeValue])

  const isAvailabilityFilterActive = isDateRangeComplete && !dateValidationMessage
  const isResultsLoading = isLoading || (isAvailabilityFilterActive && isCheckingAvailability)

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)

    if (startDate) {
      nextParams.set('startDate', startDate)
    } else {
      nextParams.delete('startDate')
    }

    if (endDate) {
      nextParams.set('endDate', endDate)
    } else {
      nextParams.delete('endDate')
    }

    if (startDate) {
      nextParams.set('start', toDateTimeValue(startDate))
    } else {
      nextParams.delete('start')
    }

    if (endDate) {
      nextParams.set('end', toReturnDateTimeValue(endDate))
    } else {
      nextParams.delete('end')
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [endDate, searchParams, setSearchParams, startDate, toDateTimeValue, toReturnDateTimeValue])

  useEffect(() => {
    let isMounted = true

    async function loadVehicles() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const allVehicles: PublicVehicle[] = []
        let page = 1
        let hasNextPage = true

        while (hasNextPage) {
          const payload = await getVehicles({ page })
          const vehiclesPage = toVehicleList(payload)

          allVehicles.push(...vehiclesPage)

          if (Array.isArray(payload)) {
            hasNextPage = false
          } else {
            hasNextPage = Boolean(payload.next)
            page += 1
          }
        }

        if (!isMounted) {
          return
        }

        setVehicles(allVehicles)
      } catch {
        if (!isMounted) {
          return
        }

        setErrorMessage(API_ERROR_MESSAGE)
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
  }, [vehiclesReloadKey])

  useEffect(() => {
    let isMounted = true

    async function loadAvailableVehicles() {
      if (!isAvailabilityFilterActive) {
        if (isMounted) {
          setAvailableVehicleIds(null)
          setAvailabilityErrorMessage(null)
          setIsCheckingAvailability(false)
        }
        return
      }

      setIsCheckingAvailability(true)
      setAvailabilityErrorMessage(null)
      setAvailableVehicleIds(null)

      try {
        const start = toDateTimeValue(startDate)
        const end = toReturnDateTimeValue(endDate)

        const ids = new Set<number>()
        let page = 1
        let hasNextPage = true

        while (hasNextPage) {
          const payload = await getAvailableVehicles({ start, end, page })

          payload.results.forEach((vehicle) => {
            ids.add(vehicle.id)
          })

          hasNextPage = Boolean(payload.next)
          page += 1
        }

        if (!isMounted) {
          return
        }

        setAvailableVehicleIds(ids)
      } catch {
        if (!isMounted) {
          return
        }

        setAvailabilityErrorMessage(API_ERROR_MESSAGE)
      } finally {
        if (isMounted) {
          setIsCheckingAvailability(false)
        }
      }
    }

    void loadAvailableVehicles()

    return () => {
      isMounted = false
    }
  }, [availabilityReloadKey, endDate, isAvailabilityFilterActive, startDate, toDateTimeValue, toReturnDateTimeValue])

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const categoryMatches =
        !selectedCategory ||
        normalizeFilterValue(vehicle.category) === normalizeFilterValue(selectedCategory)

      const transmissionMatches =
        !selectedTransmission ||
        normalizeFilterValue(vehicle.transmission) === normalizeFilterValue(selectedTransmission)

      const fuelTypeMatches =
        !selectedFuelType ||
        normalizeFilterValue(vehicle.fuel_type) === normalizeFilterValue(selectedFuelType)

      return categoryMatches && transmissionMatches && fuelTypeMatches
    })
  }, [selectedCategory, selectedFuelType, selectedTransmission, vehicles])

  const cards = useMemo(() => {
    const mappedVehicles = filteredVehicles.map((vehicle) => {
      const isAvailable = isAvailabilityFilterActive
        ? (availableVehicleIds ? availableVehicleIds.has(vehicle.id) : false)
        : isVehicleConsultableWithoutDateRange(vehicle.public_status)

      return {
        id: vehicle.id,
        brand: vehicle.brand,
        modelName: vehicle.model_name,
        category: vehicle.category,
        pricePerDay: vehicle.category_daily_rate,
        fuelType: vehicle.fuel_type,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        status: vehicle.public_status,
        isAvailable,
        imageUrl: vehicle.main_photo?.file,
        detailQueryString,
      }
    })

    const sortedByOption = (() => {
      if (sortOption === 'price-asc') {
        return [...mappedVehicles].sort((left, right) => toNumericPrice(left.pricePerDay) - toNumericPrice(right.pricePerDay))
      }

      if (sortOption === 'price-desc') {
        return [...mappedVehicles].sort((left, right) => toNumericPrice(right.pricePerDay) - toNumericPrice(left.pricePerDay))
      }

      if (sortOption === 'name-asc') {
        return [...mappedVehicles].sort((left, right) => `${left.brand} ${left.modelName}`.localeCompare(`${right.brand} ${right.modelName}`, 'fr'))
      }

      return mappedVehicles
    })()

    return [...sortedByOption].sort((left, right) => Number(right.isAvailable) - Number(left.isAvailable))
  }, [availableVehicleIds, detailQueryString, filteredVehicles, isAvailabilityFilterActive, sortOption])

  const categoryOptions = useMemo(
    () => toSelectOptions([...new Set(vehicles.map((vehicle) => vehicle.category).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'fr'))),
    [vehicles],
  )

  const transmissionOptions = useMemo(
    () => toSelectOptions([...new Set(vehicles.map((vehicle) => vehicle.transmission).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'fr'))),
    [vehicles],
  )

  const fuelOptions = useMemo(
    () => toSelectOptions([...new Set(vehicles.map((vehicle) => vehicle.fuel_type).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'fr'))),
    [vehicles],
  )

  const categoryFilterOptions = useMemo(
    () => [{ value: '', label: 'public.toutes_les_categories' }, ...categoryOptions],
    [categoryOptions],
  )

  const transmissionFilterOptions = useMemo(
    () => [{ value: '', label: 'Toutes' }, ...transmissionOptions],
    [transmissionOptions],
  )

  const fuelFilterOptions = useMemo(
    () => [{ value: '', label: 'Tous' }, ...fuelOptions],
    [fuelOptions],
  )

  function handleResetFilters() {
    setSelectedCategory('')
    setSelectedTransmission('')
    setSelectedFuelType('')
    setStartDate('')
    setEndDate('')
    setAvailableVehicleIds(null)
    setAvailabilityErrorMessage(null)
  }

  function renderFilterFields() {
    return (
      <>
        <div className="space-y-3">
          <Input
            label={t('public.date_de_depart')}
            name="startDate"
            type="date"
            min={getMinimumStartDate()}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input
            label={t('public.date_de_retour')}
            name="endDate"
            type="date"
            min={startDate ? getFollowingDate(startDate) : getFollowingDate(getMinimumStartDate())}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <Select
          label={t('public.categorie')}
          name="category"
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          options={categoryFilterOptions.map((option) => ({ ...option, label: t(option.label) }))}
        />

        {dateValidationMessage ? (
          <p className="text-sm text-[#B91C1C]">{t(dateValidationMessage)}</p>
        ) : null}

        {availabilityErrorMessage ? (
          <Alert variant="danger" className="rounded-2xl">
            <div className="space-y-3">
              <p>{t(availabilityErrorMessage)}</p>
              <button
                type="button"
                onClick={handleRetryAvailability}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[#FCA5A5] bg-white px-3 text-xs font-medium text-[#B91C1C] transition hover:bg-[#FEF2F2]"
              >
                {t('public.reessayer')}
              </button>
            </div>
          </Alert>
        ) : null}

        {isCheckingAvailability ? (
          <p className="text-sm text-slate-600">{t('public.verification_des_disponibilites_en_cours')}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Select
            label={t('public.transmission')}
            name="transmission"
            value={selectedTransmission}
            onChange={(event) => setSelectedTransmission(event.target.value)}
            options={transmissionFilterOptions.map((option) => ({ ...option, label: t(option.label) }))}
          />
          <Select
            label={t('public.carburant')}
            name="fuelType"
            value={selectedFuelType}
            onChange={(event) => setSelectedFuelType(event.target.value)}
            options={fuelFilterOptions.map((option) => ({ ...option, label: t(option.label) }))}
          />
        </div>

        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-medium text-[#2563EB] transition hover:bg-blue-50"
          >
            <span>{t('public.reinitialiser')}</span>
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      </>
    )
  }

  function handleRetryVehicles() {
    setVehiclesReloadKey((current) => current + 1)
  }

  function handleRetryAvailability() {
    setAvailabilityReloadKey((current) => current + 1)
  }

  return (
    <section className="overflow-x-clip pt-0 pb-8 sm:pt-0 sm:pb-10" aria-label={t('public.nos_vehicules')}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {errorMessage ? (
          <Alert variant="danger" title={t('public.erreur_de_chargement')} className="mt-6">
            <div className="space-y-3">
              <p>{t(errorMessage)}</p>
              <button
                type="button"
                onClick={handleRetryVehicles}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#FCA5A5] bg-white px-4 text-sm font-medium text-[#B91C1C] transition hover:bg-[#FEF2F2]"
              >
                {t('public.reessayer')}
              </button>
            </div>
          </Alert>
        ) : null}

        {isLoading && vehicles.length === 0 ? (
          <div className="mt-10 flex justify-center">
            <LoadingSpinner aria-label={t('public.chargement_des_vehicules')} />
          </div>
        ) : null}

        {!isLoading && !errorMessage && vehicles.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title={t('public.aucun_vehicule_disponible_alt')}
              description={t('public.le_catalogue_est_temporairement_vide_revenez_dans_quelques_instants')}
            />
          </div>
        ) : null}

        {!isLoading && !errorMessage && vehicles.length > 0 ? (
          <div className="mt-0 grid grid-cols-1 gap-6 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen((current) => !current)}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                aria-expanded={isMobileFiltersOpen}
                aria-controls="vehicles-filters-mobile"
              >
                {t(isMobileFiltersOpen ? 'public.masquer_les_filtres' : 'public.filtres')}
              </button>
            </div>

            {isMobileFiltersOpen ? (
              <aside id="vehicles-filters-mobile" className="lg:hidden">
                <Card className="rounded-3xl border-slate-200 bg-[#F8FAFC] shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                  <div>
                    <h2 className="text-lg font-semibold text-[#1F2937]">{t('public.filtres')}</h2>
                  </div>

                  <form className="mt-5 space-y-5">
                    {renderFilterFields()}
                  </form>
                </Card>
              </aside>
            ) : null}

            <aside className="hidden lg:sticky lg:top-24 lg:block">
              <Card className="rounded-3xl border-slate-200 bg-[#F8FAFC] shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#1F2937]">{t('public.filtres')}</h2>
                  </div>
                </div>

                <form id="vehicles-filters-form" className="mt-6 space-y-5" onReset={handleResetFilters}>
                  {renderFilterFields()}
                </form>
              </Card>
            </aside>

            <div className="min-w-0">
              <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-4 py-2 shadow-[0_10px_25px_rgba(15,23,42,0.05)] sm:px-5 sm:py-2.5 md:flex-row md:items-center md:justify-between">
                <div>
                  {!isResultsLoading ? (
                    <h2 className="text-xl font-semibold text-[#1F2937] sm:text-2xl">
                      {t('public.count_vehicule', { count: cards.length })}
                    </h2>
                  ) : null}
                </div>

                <div className="w-full md:w-auto md:shrink-0">
                  <div className="flex items-center gap-2 md:whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-600">{t('public.trier_par')}</span>
                    <div className="min-w-0 flex-1 md:w-44">
                      <Select
                        name="sort"
                        value={sortOption}
                        onChange={(event) => setSortOption(event.target.value)}
                        options={SORT_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {isResultsLoading ? (
                <div className="mt-6 flex justify-center">
                  <LoadingSpinner aria-label={t('public.chargement_des_resultats')} />
                </div>
              ) : cards.length > 0 ? (
                <div className="mt-6 space-y-6">
                  {cards.map((vehicle) => (
                    <VehicleCard key={vehicle.id} {...vehicle} layout="horizontal" />
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    title={t('public.aucun_vehicule_disponible_pour_ces_criteres')}
                    description={t('public.modifiez_vos_filtres_ou_relancez_une_recherche_plus_large')}
                    action={
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {t('public.reinitialiser_les_filtres')}
                      </button>
                    }
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}