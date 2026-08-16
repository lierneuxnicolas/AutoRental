import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import { VehicleCard } from '../../components/vehicles'
import { Card, Input, Select } from '../../components/ui'
import { RENTAL_TIME_SELECT_OPTIONS } from '../../constants/rentalTimeOptions'
import { getAvailableVehicles, getVehicles } from '../../services/vehicleService'
import type { PublicVehicle } from '../../types/vehicle'

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Popularité' },
  { value: 'price-asc', label: 'Prix croissant' },
  { value: 'price-desc', label: 'Prix décroissant' },
  { value: 'name-asc', label: 'Nom A-Z' },
]

const API_ERROR_MESSAGE = 'Impossible de charger les véhicules. Veuillez réessayer.'

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

function toDateTimeValue(date: string, time: string) {
  return `${date}T${time}`
}

function splitDateTimeParam(value: string | null): { date: string, time: string } | null {
  if (!value) {
    return null
  }

  const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (directMatch) {
    return { date: directMatch[1], time: directMatch[2] }
  }

  const parsedValue = new Date(value)
  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }

  const year = parsedValue.getFullYear()
  const month = `${parsedValue.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsedValue.getDate()}`.padStart(2, '0')
  const hours = `${parsedValue.getHours()}`.padStart(2, '0')
  const minutes = `${parsedValue.getMinutes()}`.padStart(2, '0')

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  }
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
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStartDateTime = splitDateTimeParam(searchParams.get('start'))
  const initialEndDateTime = splitDateTimeParam(searchParams.get('end'))
  const [vehicles, setVehicles] = useState<PublicVehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sortOption, setSortOption] = useState('popularity')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTransmission, setSelectedTransmission] = useState('')
  const [selectedFuelType, setSelectedFuelType] = useState('')
  const [selectedPriceMax, setSelectedPriceMax] = useState('')
  const [startDate, setStartDate] = useState(() => initialStartDateTime?.date ?? searchParams.get('startDate') ?? '')
  const [startTime, setStartTime] = useState(() => initialStartDateTime?.time ?? searchParams.get('startTime') ?? '')
  const [endDate, setEndDate] = useState(() => initialEndDateTime?.date ?? searchParams.get('endDate') ?? '')
  const [endTime, setEndTime] = useState(() => initialEndDateTime?.time ?? searchParams.get('endTime') ?? '')
  const [availableVehicleIds, setAvailableVehicleIds] = useState<Set<number> | null>(null)
  const [availabilityErrorMessage, setAvailabilityErrorMessage] = useState<string | null>(null)
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [vehiclesReloadKey, setVehiclesReloadKey] = useState(0)
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
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

  const isDateRangeComplete = Boolean(startDate && startTime && endDate && endTime)

  const dateValidationMessage = useMemo(() => {
    if (!isDateRangeComplete) {
      return null
    }

    const startDateTimeValue = toDateTimeValue(startDate, startTime)
    const endDateTimeValue = toDateTimeValue(endDate, endTime)

    if (!isValidDateTimeValue(startDateTimeValue) || !isValidDateTimeValue(endDateTimeValue)) {
      return 'Les dates saisies sont invalides.'
    }

    if (new Date(endDateTimeValue).getTime() <= new Date(startDateTimeValue).getTime()) {
      return 'La date et l heure de fin doivent être postérieures au début.'
    }

    return null
  }, [endDate, endTime, isDateRangeComplete, startDate, startTime])

  const isAvailabilityFilterActive = isDateRangeComplete && !dateValidationMessage
  const isResultsLoading = isLoading || (isAvailabilityFilterActive && isCheckingAvailability)

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)

    if (startDate) {
      nextParams.set('startDate', startDate)
    } else {
      nextParams.delete('startDate')
    }

    if (startTime) {
      nextParams.set('startTime', startTime)
    } else {
      nextParams.delete('startTime')
    }

    if (endDate) {
      nextParams.set('endDate', endDate)
    } else {
      nextParams.delete('endDate')
    }

    if (endTime) {
      nextParams.set('endTime', endTime)
    } else {
      nextParams.delete('endTime')
    }

    if (startDate && startTime) {
      nextParams.set('start', toDateTimeValue(startDate, startTime))
    } else {
      nextParams.delete('start')
    }

    if (endDate && endTime) {
      nextParams.set('end', toDateTimeValue(endDate, endTime))
    } else {
      nextParams.delete('end')
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [endDate, endTime, searchParams, setSearchParams, startDate, startTime])

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
        const start = `${toDateTimeValue(startDate, startTime)}:00`
        const end = `${toDateTimeValue(endDate, endTime)}:00`

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
  }, [availabilityReloadKey, endDate, endTime, isAvailabilityFilterActive, startDate, startTime])

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

      const priceMaxMatches =
        !selectedPriceMax ||
        toNumericPrice(vehicle.category_daily_rate) <= toNumericPrice(selectedPriceMax)

      return categoryMatches && transmissionMatches && fuelTypeMatches && priceMaxMatches
    })
  }, [selectedCategory, selectedFuelType, selectedPriceMax, selectedTransmission, vehicles])

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
    () => [{ value: '', label: 'Toutes les catégories' }, ...categoryOptions],
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
    setSelectedPriceMax('')
    setStartDate('')
    setStartTime('')
    setEndDate('')
    setEndTime('')
    setAvailableVehicleIds(null)
    setAvailabilityErrorMessage(null)
  }

  function renderFilterFields() {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Date de début"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <Select
              label="Heure"
              name="startTime"
              options={RENTAL_TIME_SELECT_OPTIONS}
              placeholder="HH:MM"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Date de fin"
              name="endDate"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
            <Select
              label="Heure"
              name="endTime"
              options={RENTAL_TIME_SELECT_OPTIONS}
              placeholder="HH:MM"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
        </div>

        <Select
          label="Catégorie"
          name="category"
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          options={categoryFilterOptions}
        />

        {dateValidationMessage ? (
          <p className="text-sm text-[#B91C1C]">{dateValidationMessage}</p>
        ) : null}

        {availabilityErrorMessage ? (
          <Alert variant="danger" className="rounded-2xl">
            <div className="space-y-3">
              <p>{availabilityErrorMessage}</p>
              <button
                type="button"
                onClick={handleRetryAvailability}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[#FCA5A5] bg-white px-3 text-xs font-medium text-[#B91C1C] transition hover:bg-[#FEF2F2]"
              >
                Réessayer
              </button>
            </div>
          </Alert>
        ) : null}

        {isCheckingAvailability ? (
          <p className="text-sm text-slate-600">Verification des disponibilites en cours...</p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Prix par jour min" name="priceMin" type="number" min={0} placeholder="0" />
          <Input
            label="Prix par jour max"
            name="priceMax"
            type="number"
            min={0}
            placeholder="200"
            value={selectedPriceMax}
            onChange={(event) => setSelectedPriceMax(event.target.value)}
          />
        </div>

        <Select
          label="Transmission"
          name="transmission"
          value={selectedTransmission}
          onChange={(event) => setSelectedTransmission(event.target.value)}
          options={transmissionFilterOptions}
        />
        <Select
          label="Carburant"
          name="fuelType"
          value={selectedFuelType}
          onChange={(event) => setSelectedFuelType(event.target.value)}
          options={fuelFilterOptions}
        />

        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-medium text-[#2563EB] transition hover:bg-blue-50"
          >
            <span>Réinitialiser</span>
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
    <section className="overflow-x-clip pt-0 pb-8 sm:pt-0 sm:pb-10" aria-label="Nos vehicules">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {errorMessage ? (
          <Alert variant="danger" title="Erreur de chargement" className="mt-6">
            <div className="space-y-3">
              <p>{errorMessage}</p>
              <button
                type="button"
                onClick={handleRetryVehicles}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#FCA5A5] bg-white px-4 text-sm font-medium text-[#B91C1C] transition hover:bg-[#FEF2F2]"
              >
                Réessayer
              </button>
            </div>
          </Alert>
        ) : null}

        {isLoading && vehicles.length === 0 ? (
          <div className="mt-10 flex justify-center">
            <LoadingSpinner aria-label="Chargement des vehicules" />
          </div>
        ) : null}

        {!isLoading && !errorMessage && vehicles.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Aucun vehicule disponible"
              description="Le catalogue est temporairement vide. Revenez dans quelques instants."
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
                {isMobileFiltersOpen ? 'Masquer les filtres' : 'Filtres'}
              </button>
            </div>

            {isMobileFiltersOpen ? (
              <aside id="vehicles-filters-mobile" className="lg:hidden">
                <Card className="rounded-3xl border-slate-200 bg-[#F8FAFC] shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                  <div>
                    <h2 className="text-lg font-semibold text-[#1F2937]">Filtres</h2>
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
                    <h2 className="text-xl font-semibold text-[#1F2937]">Filtres</h2>
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
                      {cards.length} véhicules
                    </h2>
                  ) : null}
                </div>

                <div className="w-full md:w-auto md:shrink-0">
                  <div className="flex items-center gap-2 md:whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-600">Trier par :</span>
                    <div className="min-w-0 flex-1 md:w-44">
                      <Select
                        name="sort"
                        value={sortOption}
                        onChange={(event) => setSortOption(event.target.value)}
                        options={SORT_OPTIONS}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {isResultsLoading ? (
                <div className="mt-6 flex justify-center">
                  <LoadingSpinner aria-label="Chargement des résultats" />
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
                    title="Aucun véhicule disponible pour ces critères."
                    description="Modifiez vos filtres ou relancez une recherche plus large."
                    action={
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Réinitialiser les filtres
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