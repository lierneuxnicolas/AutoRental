import { useState, type FormEvent } from 'react'
import type { ComponentType } from 'react'
import { CarFront, CreditCard, MapPin, Search, Smartphone, Unlock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Alert from '../feedback/Alert'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { buildRentalDateTime, getFollowingDate, getMinimumStartDate, getRentalClock, RETURN_CLOCK } from '../../utils/rentalPeriod'

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


type SearchDateFieldProps = {
  label: string
  id: string
  value: string
  minDate: string
  onChange: (value: string) => void
}

function SearchDateField({
  label,
  id,
  value,
  minDate,
  onChange,
}: SearchDateFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#1F2937]">{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        min={minDate}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full min-w-0 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:bg-blue-50/40 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  )
}

export default function SearchSection() {
  const navigate = useNavigate()
  const [startDateValue, setStartDateValue] = useState('')
  const [endDateValue, setEndDateValue] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const minimumDate = getMinimumStartDate()
  const endMinimumDate = startDateValue ? getFollowingDate(startDateValue) : getFollowingDate(minimumDate)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!startDateValue || !endDateValue) {
      setFormError('Veuillez renseigner une date de début et une date de fin.')
      return
    }

    if (startDateValue < getMinimumStartDate()) {
      setFormError('La date de départ ne peut pas être dans le passé.')
      return
    }

    if (endDateValue <= startDateValue) {
      setFormError('La date de retour doit être postérieure à la date de départ.')
      return
    }

    const clock = getRentalClock(startDateValue)
    const searchParams = new URLSearchParams()
    searchParams.set('start', buildRentalDateTime(startDateValue, clock))
    searchParams.set('end', buildRentalDateTime(endDateValue, RETURN_CLOCK))

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

          <SearchDateField
            label="Date de début"
            id="search-start-date"
            value={startDateValue}
            minDate={minimumDate}
            onChange={setStartDateValue}
          />

          <SearchDateField
            label="Date de fin"
            id="search-end-date"
            value={endDateValue}
            minDate={endMinimumDate}
            onChange={setEndDateValue}
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
