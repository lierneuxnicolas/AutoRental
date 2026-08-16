import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Alert, EmptyState, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { cn } from '../../components/ui/cn'
import { getVehicleById, simulatePrice } from '../../services/vehicleService'
import type { PriceSimulationResponse } from '../../types/simulation'
import type { PublicVehicle } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'

type InsuranceOption = {
  key: 'standard' | 'duo' | 'omnium'
  label: string
  description: string
}

const INSURANCE_DAILY_PRICE: Record<InsuranceOption['key'], number> = {
  standard: 0,
  duo: 8,
  omnium: 25,
}

const insuranceOptions: InsuranceOption[] = [
  {
    key: 'standard',
    label: 'STANDARD',
    description: 'Assurance de base',
  },
  {
    key: 'duo',
    label: 'CONDUCTEUR +',
    description: 'Assurance de base',
  },
  {
    key: 'omnium',
    label: 'OMNIUM',
    description: 'Protection renforcée',
  },
]

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

function formatDailyInsurancePrice(value: number): string {
  return `+ ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} €/jour`
}

function formatDurationHours(value: string | number): string {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return `${value} heures`
  }

  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(parsedValue)} heures`
}

function formatIncludedKm(vehicle: PublicVehicle): string {
  const includedKmPerDay = vehicle.conditions?.included_km_per_day ?? vehicle.included_km_per_day

  if (typeof includedKmPerDay !== 'number' || !Number.isFinite(includedKmPerDay)) {
    return 'Non renseigné'
  }

  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(includedKmPerDay)} km / jour`
}

function toFiniteNumber(value: unknown): number | null {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return null
  }

  return parsedValue
}

function computeInsuranceDays(durationHours: string | number): number | null {
  const parsedHours = toFiniteNumber(durationHours)

  if (parsedHours === null || parsedHours <= 0) {
    return null
  }

  return Math.max(1, Math.ceil(parsedHours / 24))
}

export default function SimulationPage() {
  const { vehicleId: routeVehicleId } = useParams<{ vehicleId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const vehicleIdParam = routeVehicleId ?? searchParams.get('vehicleId')
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [simulation, setSimulation] = useState<PriceSimulationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedInsurance, setSelectedInsurance] = useState<InsuranceOption['key'] | null>(null)

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

  const handleReservationClick = () => {
    if (!vehicleIdParam || !startParam || !endParam || !selectedInsurance || selectedInsuranceAmount === null || computedTotalAmount === null) {
      return
    }

    const nextParams = new URLSearchParams()
    nextParams.set('vehicleId', vehicleIdParam)
    nextParams.set('start', startParam)
    nextParams.set('end', endParam)
    nextParams.set('insurance', selectedInsurance)
    nextParams.set('insurancePrice', selectedInsuranceAmount.toFixed(2))
    nextParams.set('estimatedTotal', computedTotalAmount.toFixed(2))

    navigate(`/reservation?${nextParams.toString()}`)
  }

  const hasSearchDates = Boolean(startParam && endParam)
  const selectedInsuranceOption = insuranceOptions.find((option) => option.key === selectedInsurance) ?? null

  const baseRentalAmount = simulation ? toFiniteNumber(simulation.rental_amount) : null
  const insuranceDays = simulation ? computeInsuranceDays(simulation.duration_hours) : null
  const selectedInsuranceDailyPrice = selectedInsurance ? INSURANCE_DAILY_PRICE[selectedInsurance] : null
  const selectedInsuranceAmount = insuranceDays !== null && selectedInsuranceDailyPrice !== null
    ? insuranceDays * selectedInsuranceDailyPrice
    : null
  const computedTotalAmount = baseRentalAmount !== null ? baseRentalAmount + (selectedInsuranceAmount ?? 0) : null
  const canContinueReservation = Boolean(selectedInsurance && selectedInsuranceAmount !== null && computedTotalAmount !== null)
  const insuranceSummaryVehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model_name}` : 'Véhicule indisponible'
  const insuranceSummaryStartLabel = formatDateTimeLabel(startParam ?? '')
  const insuranceSummaryEndLabel = formatDateTimeLabel(endParam ?? '')
  const insuranceSummaryDurationLabel = simulation ? formatDurationHours(simulation.duration_hours) : 'Durée indisponible'

  const insuranceCardDetails: Record<InsuranceOption['key'], {
    intro: string
    priceLabel: string
    features: string[]
    footer: string
    description: string
    badge?: string
  }> = {
    standard: {
      intro: 'Assurance de base',
      priceLabel: 'Incluse',
      features: [
        '✓ Couverture responsabilité civile',
        '✓ Dommages au véhicule (franchise standard)',
        '✓ Vol et incendie',
        '✓ Assistance 24/7',
      ],
      footer: 'Idéale pour réduire le coût',
      description: 'Une protection essentielle incluse dans votre location.',
    },
    duo: {
      intro: 'Assurance de base',
      priceLabel: formatDailyInsurancePrice(INSURANCE_DAILY_PRICE.duo),
      features: [
        '✓ Tout ce qui est inclus dans Standard',
        '✓ 2 conducteurs autorisés',
        '✓ Conduite partagée en toute tranquillité',
        '✓ Idéal pour les couples ou amis',
      ],
      footer: 'Idéale si vous partagez la conduite',
      description: 'Ajoutez un second conducteur sans stress ni frais supplémentaires.',
    },
    omnium: {
      intro: 'Protection renforcée',
      priceLabel: formatDailyInsurancePrice(INSURANCE_DAILY_PRICE.omnium),
      features: [
        '✓ Tout ce qui est inclus dans Conducteur +',
        '✓ Franchise réduite en cas de dommage',
        '✓ Protection maximale du véhicule',
        '✓ Assistance premium 24/7',
      ],
      footer: 'Idéale pour plus de tranquillité',
      description: 'Moins de franchise, plus de sérénité en cas d’imprévu.',
      badge: '★ Recommandée',
    },
  }

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

        {!vehicleIdParam ? (
          <div className="mt-6">
            <Alert variant="info" title="Sélection de véhicule requise" message="Sélectionnez un véhicule depuis le catalogue ou la recherche pour lancer une simulation." />
          </div>
        ) : null}

        {vehicleIdParam && !hasSearchDates ? (
          <div className="mt-6 space-y-4">
            <Alert
              variant="info"
              title="Période de réservation requise"
              message="Revenez au catalogue des véhicules pour choisir une date de début et une date de fin avant de lancer la simulation."
            />
            <div>
              <Link to="/vehicles" className="inline-flex">
                <Button variant="secondary">Retour au catalogue</Button>
              </Link>
            </div>
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
            <Card className="overflow-hidden border-slate-200">
              <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)] md:items-stretch">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                  {resolveMediaUrl(vehicle.main_photo?.file) ? (
                    <img
                      src={resolveMediaUrl(vehicle.main_photo?.file) ?? undefined}
                      alt={`${vehicle.brand} ${vehicle.model_name}`}
                      className="h-52 w-full object-cover md:h-full"
                    />
                  ) : (
                    <div className="flex h-52 items-center justify-center text-sm font-medium text-slate-500 md:h-full">
                      Photo indisponible
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2563EB]">{vehicle.category}</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1F2937]">{vehicle.brand} {vehicle.model_name}</h2>
                    <p className="mt-3 text-sm text-slate-600">Prix journalier</p>
                    <p className="text-xl font-semibold text-[#1F2937]">{formatCurrency(vehicle.category_daily_rate)}</p>
                  </div>

                  <Button variant="secondary" className="w-full md:w-auto" onClick={() => navigate(`/vehicles/${vehicleIdParam}`)}>
                    Retour au véhicule
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="flex h-full flex-col border-slate-200 bg-[#FFF7ED]" header={<h2 className="text-lg font-semibold text-[#1F2937]">Récapitulatif de votre location</h2>}>
              <div className="flex h-full flex-col gap-5">
                <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 sm:px-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Date/heure de début</span>
                      <span className="text-right text-sm font-medium text-[#1F2937]">{formatDateTimeLabel(startParam ?? '')}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Date/heure de fin</span>
                      <span className="text-right text-sm font-medium text-[#1F2937]">{formatDateTimeLabel(endParam ?? '')}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Durée</span>
                      <span className="text-sm font-medium text-[#1F2937]">{formatDurationHours(simulation.duration_hours)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Prix de base</span>
                      <span className="text-sm font-medium text-[#1F2937]">{formatCurrency(simulation.rental_amount)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Kilométrage inclus</span>
                      <span className="text-sm font-medium text-[#1F2937]">{formatIncludedKm(vehicle)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Assurance choisie</span>
                      <span className="text-sm font-medium text-[#1F2937]">{selectedInsuranceOption?.label ?? 'Aucune'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">Prix de l’assurance</span>
                      <span className="text-sm font-medium text-[#1F2937]">
                        {selectedInsuranceAmount !== null ? formatCurrency(selectedInsuranceAmount) : selectedInsurance ? 'Tarif indisponible' : 'A sélectionner'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#FFF7ED] px-4 py-3">
                    <span className="text-base font-semibold text-[#1F2937]">Total estimé</span>
                    <span className="text-xl font-semibold text-[#EA580C]">
                      {computedTotalAmount !== null ? formatCurrency(computedTotalAmount) : formatCurrency(simulation.total_amount)}
                    </span>
                  </div>
                </div>

                <fieldset className="rounded-[32px] border border-violet-100 bg-white p-4 sm:p-6" aria-label="Choisissez votre assurance">
                  <legend className="sr-only">Choisissez votre assurance</legend>

                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight text-[#1F2937]">Choisissez votre assurance</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                        Sélectionnez l’option qui correspond le mieux à vos besoins pour rouler en toute sérénité.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-[#1F2937]">{insuranceSummaryVehicleLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>Départ {insuranceSummaryStartLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>Retour {insuranceSummaryEndLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>{insuranceSummaryDurationLabel}</span>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                    {insuranceOptions.map((option) => {
                      const inputId = `insurance-${option.key}`
                      const isSelected = selectedInsurance === option.key
                      const cardDetails = insuranceCardDetails[option.key]

                      return (
                        <label
                          key={option.key}
                          htmlFor={inputId}
                          className={cn(
                            'flex h-full cursor-pointer flex-col rounded-3xl border bg-white p-5 transition-all',
                            isSelected
                              ? 'border-[#7C3AED] bg-violet-50/40 shadow-[0_10px_30px_rgba(124,58,237,0.12)] ring-2 ring-[#7C3AED]/20'
                              : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/30',
                          )}
                        >
                          <input
                            id={inputId}
                            type="radio"
                            name="insurance-choice"
                            value={option.key}
                            checked={isSelected}
                            onChange={() => setSelectedInsurance(option.key)}
                            className="sr-only"
                          />

                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{option.label}</p>
                              <p className="mt-2 text-sm font-medium text-slate-700">{cardDetails.intro}</p>
                              {option.key === 'duo' ? <p className="mt-1 text-sm text-slate-600">- 1 conducteur additionnel</p> : null}
                              {option.key === 'omnium' ? <p className="mt-1 text-sm text-slate-600">Franchise réduite</p> : null}
                            </div>

                            {cardDetails.badge ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-[#6D28D9]">
                                {cardDetails.badge}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-5 flex items-end justify-between gap-4">
                            <div>
                              <p className="text-sm text-slate-600">{cardDetails.description}</p>
                              <p className="mt-1 text-base font-semibold text-[#1F2937]">{cardDetails.priceLabel}</p>
                            </div>
                          </div>

                          <ul className="mt-5 space-y-3 text-sm text-slate-700">
                            {cardDetails.features.map((feature) => (
                              <li key={feature} className="flex items-start gap-2.5">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-600">
                                  ✓
                                </span>
                                <span className="leading-6">{feature.replace(/^✓\s*/, '')}</span>
                              </li>
                            ))}
                          </ul>

                          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3">
                            <p className="text-sm font-semibold text-[#1F2937]">{cardDetails.footer}</p>
                          </div>
                        </label>
                      )
                    })}
                    </div>

                    {!selectedInsurance ? (
                      <p className="text-xs font-medium text-[#7C3AED]">Veuillez sélectionner une assurance pour continuer.</p>
                    ) : selectedInsuranceAmount === null ? (
                      <p className="text-xs font-medium text-[#7C3AED]">
                        Le backend de simulation ne fournit pas encore le tarif de cette assurance. Le total reste basé sur le prix de location API.
                      </p>
                    ) : null}
                  </div>
                </fieldset>

                <Button
                  variant="danger"
                  className="mt-auto w-full bg-[#F97316] hover:bg-[#EA580C]"
                  onClick={handleReservationClick}
                  disabled={!canContinueReservation}
                >
                  Continuer la réservation
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
