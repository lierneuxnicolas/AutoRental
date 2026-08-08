import { useState } from 'react'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function SearchSection() {
  const [pickupLocation, setPickupLocation] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
            className="lg:min-w-[260px]"
          />

          <Input
            label="Date et heure de début"
            type="datetime-local"
            placeholder="JJ/MM/AAAA --:--"
            value={startDateTime}
            onChange={(event) => setStartDateTime(event.target.value)}
            className="lg:min-w-[220px]"
          />

          <Input
            label="Date et heure de fin"
            type="datetime-local"
            placeholder="JJ/MM/AAAA --:--"
            value={endDateTime}
            onChange={(event) => setEndDateTime(event.target.value)}
            className="lg:min-w-[220px]"
          />

          <div className="lg:pb-0.5">
            <Button type="submit" variant="danger" size="lg" className="w-full lg:w-auto">
              Rechercher
            </Button>
          </div>
        </form>
      </Card>
    </section>
  )
}
