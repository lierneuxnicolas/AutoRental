import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { getVehicleById, simulatePrice } from '../../services/vehicleService'
import type { PriceSimulationResponse } from '../../types/simulation'
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

function formatCurrency(value: string | number): string {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return `${value} EUR`
  }

  return `${parsedValue.toFixed(2)} EUR`
}

export default function SimulationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const vehicleIdParam = searchParams.get('vehicleId')
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [simulation, setSimulation] = useState<PriceSimulationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [startInput, setStartInput] = useState(() => toDateTimeLocalValue(startParam ?? ''))
  const [endInput, setEndInput] = useState(() => toDateTimeLocalValue(endParam ?? ''))

  useEffect(() => {
    let isMounted = true

    async function loadSimulation() {
      if (!vehicleIdParam || !startParam || !endParam) {
        setVehicle(null)
        setSimulation(null)
        setErrorMessage(null)
        setIsLoading(false)
        return
      }

      const vehicleId = Number(vehicleIdParam)
      if (!Number.isFinite(vehicleId)) {
        if (!isMounted) {
          return
        }

        setVehicle(null)
        setSimulation(null)
        setErrorMessage('L’identifiant du véhicule est invalide.')
        setIsLoading(false)
        return
      }

      const startIso = toApiDateTime(startParam)
      const endIso = toApiDateTime(endParam)

      if (!startIso || !endIso) {
        if (!isMounted) {
          return
        }

        setVehicle(null)
        setSimulation(null)
        setErrorMessage('Les dates de la simulation sont invalides.')
        setIsLoading(false)
        return
      }

      const startDate = new Date(startIso)
      const endDate = new Date(endIso)

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        if (!isMounted) {
          return
        }

        setVehicle(null)
        setSimulation(null)
        setErrorMessage('La date de fin doit être postérieure à la date de début.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setErrorMessage(null)
      setFormError(null)

      try {
        const [vehiclePayload, simulationPayload] = await Promise.all([
          getVehicleById(vehicleId),
          simulatePrice({ vehicle_id: vehicleId, start_at: startIso, end_at: endIso }),
        ])

        if (!isMounted) {
          return
        }

        setVehicle(vehiclePayload)
        setSimulation(simulationPayload)
      } catch (error) {
        if (!isMounted) {
          return
        }

        const axiosError = error as AxiosError<{ detail?: string }>
        const errorDetail = axiosError.response?.data?.detail ?? 'Impossible de simuler le prix pour le moment.'
        setVehicle(null)
        setSimulation(null)
        setErrorMessage(errorDetail)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSimulation()

    return () => {
      isMounted = false
    }
  }, [vehicleIdParam, startParam, endParam])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const normalizedStart = startInput.trim()
    const normalizedEnd = endInput.trim()

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

    if (vehicleIdParam) {
      nextParams.set('vehicleId', vehicleIdParam)
    }

    setSearchParams(nextParams)
  }

  const handleReservationClick = () => {
    if (!vehicleIdParam || !startParam || !endParam) {
      return
    }

    const nextParams = new URLSearchParams()
    nextParams.set('vehicleId', vehicleIdParam)
    nextParams.set('start', startParam)
    nextParams.set('end', endParam)

    navigate(`/reservation?${nextParams.toString()}`)
  }

  const hasSearchDates = Boolean(startParam && endParam)

  return (
    <section className="py-8 sm:py-10" aria-labelledby="simulation-page-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 id="simulation-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Simulation de prix
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Calculez un montant indicatif pour votre période de location à partir du contrat backend de simulation.
          </p>
        </header>

        <Card className="mt-6 border-slate-200">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
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
              Simuler
            </Button>
          </form>

          {formError ? <Alert variant="danger" title="Simulation impossible" message={formError} className="mt-4" /> : null}
        </Card>

        {!vehicleIdParam ? (
          <div className="mt-6">
            <Alert variant="info" title="Sélection de véhicule requise" message="Sélectionnez un véhicule depuis le catalogue ou la recherche pour lancer une simulation." />
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-8 flex justify-center">
            <LoadingSpinner aria-label="Chargement de la simulation" size="lg" />
          </div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="mt-6">
            <Alert variant="danger" title="Erreur de simulation" message={errorMessage} />
          </div>
        ) : null}

        {!isLoading && !errorMessage && hasSearchDates && vehicle && simulation ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Résumé de la simulation</h2>}>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Véhicule</p>
                  <p className="mt-1 text-xl font-semibold text-[#1F2937]">{vehicle.brand} {vehicle.model_name}</p>
                  <p className="mt-1 text-sm text-slate-600">{vehicle.category}</p>
                </div>

                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Période</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTimeLabel(startParam ?? '')}</p>
                    <p className="text-sm text-slate-700">{formatDateTimeLabel(endParam ?? '')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Durée</p>
                    <p className="mt-1 text-sm text-slate-700">{simulation.duration_hours} heures</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Location</span>
                    <span className="font-semibold text-[#1F2937]">{formatCurrency(simulation.rental_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Caution</span>
                    <span className="font-semibold text-[#1F2937]">{formatCurrency(simulation.deposit_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Assurance incluse</span>
                    <span className="font-semibold text-[#1F2937]">{simulation.insurance_included ? 'Oui' : 'Non'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-base font-semibold text-[#1F2937]">Total estimé</span>
                    <span className="text-xl font-semibold text-[#2563EB]">{formatCurrency(simulation.total_amount)}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Continuer</h2>}>
              <div className="space-y-3">
                <Button variant="danger" className="w-full" onClick={handleReservationClick}>
                  Réserver ce véhicule
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => navigate(`/vehicles/${vehicleIdParam}`)}>
                  Retour au véhicule
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {!isLoading && !errorMessage && !hasSearchDates && !vehicleIdParam ? (
          <div className="mt-8">
            <EmptyState title="Aucune simulation en cours" description="Choisissez un véhicule et une période pour démarrer la simulation." />
          </div>
        ) : null}
      </div>
    </section>
  )
}
