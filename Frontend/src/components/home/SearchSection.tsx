import { useMemo, useState, type FormEvent } from 'react'
import type { ComponentType } from 'react'
import { CarFront, CreditCard, MapPin, Search, Smartphone, Unlock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Alert from '../feedback/Alert'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { RENTAL_TIME_OPTIONS } from '../../constants/rentalTimeOptions'

type HighlightCard = {
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

const HIGHLIGHT_CARDS: HighlightCard[] = [
  {
    title: 'Location 100 % en ligne',
    description: 'Réservez, payez et gérez votre location directement depuis votre espace personnel.',
    Icon: Smartphone,
  },
  {
    title: 'Déverrouillage simple',
    description: "Accédez à votre véhicule depuis l'application après avoir réalisé l'état des lieux.",
    Icon: Unlock,
  },
  {
    title: 'Paiement sécurisé',
    description: 'Vos paiements et votre caution sont traités de manière sécurisée.',
    Icon: CreditCard,
  },
  {
    title: 'Large choix',
    description: 'Choisissez le véhicule adapté à vos besoins parmi plusieurs catégories.',
    Icon: CarFront,
  },
]

function toComparableDateTime(value: string): Date | null {
  if (!value) {
    return null
  }

  const normalizedValue = value.length === 16 ? `${value}:00` : value
  const parsedValue = new Date(normalizedValue)

  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }

  return parsedValue
}

function toDateValue(value: Date): string {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function combineDateAndTime(dateValue: string, timeValue: string): string {
  if (!dateValue || !timeValue) {
    return ''
  }

  return `${dateValue}T${timeValue}`
}

function hasThirtyMinuteStep(value: string): boolean {
  if (!value) {
    return false
  }

  const parsedValue = new Date(value.length === 16 ? `${value}:00` : value)
  if (Number.isNaN(parsedValue.getTime())) {
    return false
  }

  return parsedValue.getMinutes() === 0 || parsedValue.getMinutes() === 30
}

function roundUpToNextHalfHour(value: Date): Date {
  const rounded = new Date(value)
  rounded.setSeconds(0, 0)

  const minutes = rounded.getMinutes()
  if (minutes === 0 || minutes === 30) {
    return rounded
  }

  if (minutes < 30) {
    rounded.setMinutes(30)
    return rounded
  }

  rounded.setHours(rounded.getHours() + 1, 0, 0, 0)
  return rounded
}

type SearchDateTimeFieldProps = {
  label: string
  dateId: string
  timeId: string
  dateValue: string
  timeValue: string
  minDate: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}

function SearchDateTimeField({
  label,
  dateId,
  timeId,
  dateValue,
  timeValue,
  minDate,
  onDateChange,
  onTimeChange,
}: SearchDateTimeFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#1F2937]">{label}</label>
      <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_1px_6.5rem] items-center overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm transition focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-blue-100">
          <input
            id={dateId}
            type="date"
            value={dateValue}
            min={minDate}
            onChange={(event) => onDateChange(event.target.value)}
            aria-label={`${label} - date`}
            className="h-14 min-w-0 border-0 bg-transparent px-4 text-sm text-[#1F2937] outline-none transition focus:bg-blue-50/40"
          />

          <span className="h-8 w-px bg-[#E5E7EB]" aria-hidden="true" />

          <select
            id={timeId}
            value={timeValue}
            onChange={(event) => onTimeChange(event.target.value)}
            aria-label={`${label} - heure`}
            className="h-14 min-w-0 border-0 bg-transparent px-4 text-sm text-[#1F2937] outline-none transition focus:bg-blue-50/40"
          >
            <option value="">--:--</option>
            {RENTAL_TIME_OPTIONS.map((timeOption) => (
              <option key={timeOption} value={timeOption}>
                {timeOption}
              </option>
            ))}
          </select>
        </div>
    </div>
  )
}

export default function SearchSection() {
  const navigate = useNavigate()
  const [startDateValue, setStartDateValue] = useState('')
  const [startTimeValue, setStartTimeValue] = useState('')
  const [endDateValue, setEndDateValue] = useState('')
  const [endTimeValue, setEndTimeValue] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const minimumDateTime = useMemo(() => roundUpToNextHalfHour(new Date()), [])
  const minimumDate = useMemo(() => toDateValue(minimumDateTime), [minimumDateTime])
  const endMinimumDate = startDateValue || minimumDate

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const startDateTimeInput = combineDateAndTime(startDateValue, startTimeValue)
    const endDateTimeInput = combineDateAndTime(endDateValue, endTimeValue)
    const normalizedStart = startDateTimeInput.trim()
    const normalizedEnd = endDateTimeInput.trim()
    if (!normalizedStart || !normalizedEnd) {
      setFormError('Veuillez renseigner une date de début et une date de fin.')
      return
    }

    if (!hasThirtyMinuteStep(normalizedStart) || !hasThirtyMinuteStep(normalizedEnd)) {
      setFormError('Les horaires doivent être sélectionnés par tranches de 30 minutes.')
      return
    }

    const parsedStartDateTime = toComparableDateTime(normalizedStart)
    const parsedEndDateTime = toComparableDateTime(normalizedEnd)

    if (!parsedStartDateTime || !parsedEndDateTime) {
      setFormError('Les dates saisies sont invalides.')
      return
    }

    const startDate = parsedStartDateTime
    const endDate = parsedEndDateTime
    const now = new Date()

    if (startDate < now) {
      setFormError('La date de départ ne peut pas être dans le passé.')
      return
    }

    if (endDate <= startDate) {
      setFormError('La date de fin doit être postérieure à la date de début.')
      return
    }

    const searchParams = new URLSearchParams()
    searchParams.set('start', normalizedStart)
    searchParams.set('end', normalizedEnd)

    navigate(`/vehicles?${searchParams.toString()}`)
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-8 sm:py-5">
        <form noValidate onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#1F2937]">Parking</label>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Rue+des+Mobilites+12,+1000+Bruxelles"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm transition hover:border-[#2563EB] hover:bg-blue-50/40 focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-blue-100"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1F2937]">Parking GetACar - Gare Centrale</p>
                <p className="text-sm text-slate-600">Rue des Mobilites 12, 1000 Bruxelles</p>
              </div>
            </a>
          </div>

          <SearchDateTimeField
            label="Date de début"
            dateId="search-start-date"
            timeId="search-start-time"
            dateValue={startDateValue}
            timeValue={startTimeValue}
            minDate={minimumDate}
            onDateChange={setStartDateValue}
            onTimeChange={setStartTimeValue}
          />

          <SearchDateTimeField
            label="Date de fin"
            dateId="search-end-date"
            timeId="search-end-time"
            dateValue={endDateValue}
            timeValue={endTimeValue}
            minDate={endMinimumDate}
            onDateChange={setEndDateValue}
            onTimeChange={setEndTimeValue}
          />

          <div className="flex items-end">
            <Button type="submit" variant="danger" size="lg" className="h-14 w-full rounded-2xl px-6 shadow-sm xl:w-auto">
              <Search className="h-5 w-5" aria-hidden="true" />
              Rechercher
            </Button>
          </div>
        </div>
        </form>

        {formError ? (
          <Alert variant="danger" title="Recherche impossible" message={formError} className="mt-5" />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 md:auto-rows-fr md:grid-cols-2 xl:grid-cols-4">
        {HIGHLIGHT_CARDS.map(({ title, description, Icon }) => (
          <Card
            key={title}
            className="h-full rounded-2xl border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.06)]"
          >
            <article aria-labelledby={`highlight-${title}`} className="flex h-full flex-col">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>

              <h3 id={`highlight-${title}`} className="mt-5 text-lg font-semibold text-[#1F2937]">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 md:min-h-[72px]">{description}</p>
            </article>
          </Card>
        ))}
      </div>
    </section>
  )
}
