import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../feedback/Alert'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Button from '../ui/Button'

function toApiDateTime(value: string): string | null {
  if (!value) {
    return null
  }

  const normalizedValue = value.length === 16 ? `${value}:00` : value
  const parsedValue = new Date(normalizedValue)

  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }

  return parsedValue.toISOString()
}

export default function SearchSection() {
  const navigate = useNavigate()
  const [pickupLocation, setPickupLocation] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const normalizedStart = startDateTime.trim()
    const normalizedEnd = endDateTime.trim()
    const normalizedLocation = pickupLocation.trim()

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

    const searchParams = new URLSearchParams()
    searchParams.set('start', startIso)
    searchParams.set('end', endIso)

    if (normalizedLocation) {
      searchParams.set('location', normalizedLocation)
    }

    navigate(`/search?${searchParams.toString()}`)
  }

  return (
    <section className="mt-10">
      <Card className="border border-slate-200 bg-white p-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200 bg-[#F5F5F5] px-6 py-5 sm:px-8">
          <h2 className="text-2xl font-semibold text-[#1F2937]">Trouvez votre véhicule</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6 sm:px-8 lg:flex-row lg:items-end">
          <Input
            label="Lieu de prise en charge"
            placeholder="Ex: Bruxelles, Paris"
            value={pickupLocation}
            onChange={(event) => setPickupLocation(event.target.value)}
            className="lg:min-w-65"
          />

          <Input
            label="Date et heure de début"
            type="datetime-local"
            placeholder="JJ/MM/AAAA --:--"
            value={startDateTime}
            onChange={(event) => setStartDateTime(event.target.value)}
            className="lg:min-w-55"
          />

          <Input
            label="Date et heure de fin"
            type="datetime-local"
            placeholder="JJ/MM/AAAA --:--"
            value={endDateTime}
            onChange={(event) => setEndDateTime(event.target.value)}
            className="lg:min-w-55"
          />

          <div className="lg:pb-0.5">
            <Button type="submit" variant="danger" size="lg" className="w-full lg:w-auto">
              Rechercher
            </Button>
          </div>
        </form>

        {formError ? <Alert variant="danger" title="Recherche impossible" message={formError} className="mx-6 mb-6 sm:mx-8" /> : null}
      </Card>
    </section>
  )
}
