import { clientDisplay, clientLocale } from '../../i18n/clientDisplay'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
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
import { formatVehicleDailyRate } from '../../utils/vehiclePrice'

type InsuranceOption = {
  key: 'standard' | 'complementary'
  label: string
  description: string
}

const INSURANCE_DAILY_PRICE: Record<InsuranceOption['key'], number> = {
  standard: 0,
  complementary: 10,
}

const insuranceOptions: InsuranceOption[] = [
  {
    key: 'standard',
    label: 'STANDARD',
    description: 'Assurance de base',
  },
  {
    key: 'complementary',
    label: 'COMPLÉMENTAIRE',
    description: 'Franchise réduite',
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

  return parsedValue.toLocaleString(clientLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatCurrency(value: string | number): string {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return `${value} EUR`
  }

  return new Intl.NumberFormat(clientLocale(), { style: 'currency', currency: 'EUR' }).format(parsedValue)
}

function formatDurationLabel(value: string | number, billedDays?: number): string {
  if (typeof billedDays === 'number' && billedDays > 0) {
    return new Intl.NumberFormat(clientLocale(), { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(billedDays)
  }

  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return `${value} heures`
  }

  return new Intl.NumberFormat(clientLocale(), { style: 'unit', unit: 'hour', unitDisplay: 'long', maximumFractionDigits: 2 }).format(parsedValue)
}

function formatIncludedKm(t: TFunction, vehicle: PublicVehicle): string {
  const includedKmPerDay = vehicle.conditions?.included_km_per_day ?? vehicle.included_km_per_day

  if (typeof includedKmPerDay !== 'number' || !Number.isFinite(includedKmPerDay)) {
    return 'Non renseigné'
  }

  return t('client.distance_km_jour', { distance: new Intl.NumberFormat(clientLocale(), { maximumFractionDigits: 0 }).format(includedKmPerDay) })
}

function toFiniteNumber(value: unknown): number | null {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return null
  }

  return parsedValue
}

function computeInsuranceDays(durationHours: string | number, billedDays?: number): number | null {
  if (typeof billedDays === 'number' && billedDays > 0) {
    return billedDays
  }

  const parsedHours = toFiniteNumber(durationHours)

  if (parsedHours === null || parsedHours <= 0) {
    return null
  }

  return Math.max(1, Math.ceil(parsedHours / 24))
}

export default function SimulationPage() {
  const { t } = useTranslation()
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
  const [selectedInsurance, setSelectedInsurance] = useState<InsuranceOption['key'] | null>('standard')

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
  const insuranceDays = simulation ? computeInsuranceDays(simulation.duration_hours, simulation.billed_days) : null
  const selectedInsuranceDailyPrice = selectedInsurance ? INSURANCE_DAILY_PRICE[selectedInsurance] : null
  const selectedInsuranceAmount = insuranceDays !== null && selectedInsuranceDailyPrice !== null
    ? insuranceDays * selectedInsuranceDailyPrice
    : null
  const computedTotalAmount = baseRentalAmount !== null ? baseRentalAmount + (selectedInsuranceAmount ?? 0) : null
  const canContinueReservation = Boolean(selectedInsurance && selectedInsuranceAmount !== null && computedTotalAmount !== null)
  const insuranceSummaryVehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model_name}` : 'Véhicule indisponible'
  const insuranceSummaryStartLabel = formatDateTimeLabel(startParam ?? '')
  const insuranceSummaryEndLabel = formatDateTimeLabel(endParam ?? '')
  const insuranceSummaryDurationLabel = simulation
    ? formatDurationLabel(simulation.duration_hours, simulation.billed_days)
    : 'Durée indisponible'

  const insuranceCardDetails: Record<InsuranceOption['key'], {
    priceLabel: string
    features: string[]
  }> = {
    standard: {
      priceLabel: t('client.incluse_dans_le_prix'),
      features: [
        t('client.assurance_de_base_obligatoire'),
        t('client.franchise_standard_applicable_en_cas_de_dommage_couvert'),
      ],
    },
    complementary: {
      priceLabel: t('client.amount_par_jour', { amount: '+ ' + formatCurrency(INSURANCE_DAILY_PRICE.complementary) }),
      features: [
        t('client.assurance_de_base_incluse_alt_alt'),
        t('client.franchise_reduite_en_cas_de_dommage_couvert'),
      ],
    },
  }

  return (
    <section className="py-8 sm:py-10" aria-labelledby="simulation-page-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <h1 id="simulation-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            {t("professional.simulation_de_prix")}</h1>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            {t("professional.calculez_un_montant_indicatif_pour_votre_periode_de_location_a_partir_du")}</p>
        </header>

        {!vehicleIdParam ? (
          <div className="mt-6">
            <Alert variant="info" title={t("professional.selection_de_vehicule_requise")} message={t("professional.selectionnez_un_vehicule_depuis_le_catalogue_ou_la_recherche_pour_lancer_une")} />
          </div>
        ) : null}

        {vehicleIdParam && !hasSearchDates ? (
          <div className="mt-6 space-y-4">
            <Alert
              variant="info"
              title={t("professional.periode_de_reservation_requise")}
              message={t("professional.revenez_au_catalogue_des_vehicules_pour_choisir_une_date_de_debut_et")}
            />
            <div>
              <Link to="/vehicles" className="inline-flex">
                <Button variant="secondary">{t("professional.retour_au_catalogue")}</Button>
              </Link>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-8 flex justify-center">
            <LoadingSpinner aria-label={t("professional.chargement_de_la_simulation")} size="lg" />
          </div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="mt-6">
            <Alert variant="danger" title={t("professional.erreur_de_simulation")} message={errorMessage} />
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
                      {t("client.photo_indisponible")}</div>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2563EB]">{vehicle.category}</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1F2937]">{vehicle.brand} {vehicle.model_name}</h2>
                    <p className="mt-3 text-xl font-semibold text-[#1F2937]">{formatVehicleDailyRate(vehicle.category_daily_rate)}</p>
                    <p className="mt-1 text-xs text-slate-500">{t("professional.tva_de_21_comprise")}</p>
                  </div>

                  <Button variant="secondary" className="w-full md:w-auto" onClick={() => navigate(`/vehicles/${vehicleIdParam}`)}>
                    {t("professional.retour_au_vehicule")}</Button>
                </div>
              </div>
            </Card>

            <Card className="flex h-full flex-col border-slate-200 bg-[#FFF7ED]" header={<h2 className="text-lg font-semibold text-[#1F2937]">{t("professional.recapitulatif_de_votre_location")}</h2>}>
              <div className="flex h-full flex-col gap-5">
                <div className="rounded-2xl border border-orange-100 bg-white px-4 py-4 sm:px-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("professional.date_heure_de_debut")}</span>
                      <span className="text-right text-sm font-medium text-[#1F2937]">{formatDateTimeLabel(startParam ?? '')}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("client.date_heure_de_fin")}</span>
                      <span className="text-right text-sm font-medium text-[#1F2937]">{formatDateTimeLabel(endParam ?? '')}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("public.duree")}</span>
                      <span className="text-sm font-medium text-[#1F2937]">{formatDurationLabel(simulation.duration_hours, simulation.billed_days)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("professional.prix_de_base")}</span>
                      <span className="text-sm font-medium text-[#1F2937]">{formatCurrency(simulation.rental_amount)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("professional.kilometrage_inclus")}</span>
                      <span className="text-sm font-medium text-[#1F2937]">{formatIncludedKm(t, vehicle)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("professional.assurance_choisie")}</span>
                      <span className="text-sm font-medium text-[#1F2937]">{selectedInsuranceOption?.label ?? 'Aucune'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-3">
                      <span className="text-sm text-slate-600">{t("professional.prix_de_l_assurance")}</span>
                      <span className="text-sm font-medium text-[#1F2937]">
                        {selectedInsuranceAmount !== null ? formatCurrency(selectedInsuranceAmount) : selectedInsurance ? t("public.tarif_indisponible") : 'A sélectionner'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#FFF7ED] px-4 py-3">
                    <span className="text-base font-semibold text-[#1F2937]">{t("professional.total_estime")}</span>
                    <span className="text-xl font-semibold text-[#EA580C]">
                      {computedTotalAmount !== null ? formatCurrency(computedTotalAmount) : formatCurrency(simulation.total_amount)}
                    </span>
                  </div>
                </div>

                <fieldset className="rounded-[32px] border border-violet-100 bg-white p-4 sm:p-6" aria-label={t("public.choisissez_votre_assurance")}>
                  <legend className="sr-only">{t("public.choisissez_votre_assurance")}</legend>

                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight text-[#1F2937]">{t("public.choisissez_votre_assurance")}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                        {t("professional.selectionnez_l_option_qui_correspond_le_mieux_a_vos_besoins_pour_rouler")}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-[#1F2937]">{insuranceSummaryVehicleLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>{t("public.depart")} {insuranceSummaryStartLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>{t("public.retour")} {insuranceSummaryEndLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>{insuranceSummaryDurationLabel}</span>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
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

                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{clientDisplay(t, option.label)}</p>
                          <p className="mt-2 text-xl font-semibold text-[#1F2937]">{cardDetails.priceLabel}</p>

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
                        </label>
                      )
                    })}
                    </div>

                    {!selectedInsurance ? (
                      <p className="text-xs font-medium text-[#7C3AED]">{t("professional.veuillez_selectionner_une_assurance_pour_continuer")}</p>
                    ) : selectedInsuranceAmount === null ? (
                      <p className="text-xs font-medium text-[#7C3AED]">
                        {t("professional.le_backend_de_simulation_ne_fournit_pas_encore_le_tarif_de_cette")}</p>
                    ) : null}
                  </div>
                </fieldset>

                <Button
                  variant="danger"
                  className="mt-auto w-full bg-[#F97316] hover:bg-[#EA580C]"
                  onClick={handleReservationClick}
                  disabled={!canContinueReservation}
                >
                  {t("professional.continuer_la_reservation")}</Button>
              </div>
            </Card>
          </div>
        ) : null}

        {!isLoading && !errorMessage && !hasSearchDates && !vehicleIdParam ? (
          <div className="mt-8">
            <EmptyState title={t("professional.aucune_simulation_en_cours")} description={t("professional.choisissez_un_vehicule_et_une_periode_pour_demarrer_la_simulation")} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
