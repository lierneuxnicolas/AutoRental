import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type ProcessStep = {
  title: string
  image: string
  alt: string
}

const PROCESS_STEPS: ProcessStep[] = [
  {
    title: 'Création du compte et validation du profil',
    image: '/images/rental-process/rental-process-account.png',
    alt: 'Étapes de création du compte et de validation du profil GetaCar',
  },
  {
    title: 'Réservation du véhicule',
    image: '/images/rental-process/rental-process-reservation.png',
    alt: 'Étapes de réservation du véhicule GetaCar',
  },
  {
    title: 'Prise en charge du véhicule',
    image: '/images/rental-process/rental-process-pickup.png',
    alt: 'Étapes de prise en charge du véhicule GetaCar',
  },
  {
    title: 'Restitution du véhicule',
    image: '/images/rental-process/rental-process-return.png',
    alt: 'Étapes de restitution du véhicule GetaCar',
  },
]

export default function HowItWorks() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  const handleToggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index))
  }

  return (
    <section id="fonctionnement" className="scroll-mt-24">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Comment fonctionne GetaCar ?
          </h2>
        </div>

        <div className="mx-auto mt-8 max-w-6xl space-y-4 sm:mt-10 sm:space-y-5">
          {PROCESS_STEPS.map((step, index) => {
            const isOpen = openIndex === index
            const panelId = `${baseId}-panel-${index}`
            const buttonId = `${baseId}-button-${index}`

            return (
              <div
                key={step.title}
                className={`rounded-xl border bg-white transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm ${
                  isOpen
                    ? 'border-blue-300 bg-blue-50/40 shadow-[0_6px_20px_rgba(15,23,42,0.06)]'
                    : 'border-slate-200 shadow-[0_2px_10px_rgba(15,23,42,0.04)]'
                }`}
              >
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-5 py-3.5 text-left text-base font-semibold text-[#1F2937] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:text-lg"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => handleToggle(index)}
                  >
                    <span>{step.title}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 self-center text-[#2563EB] transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={`grid transition-all duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden px-5 pb-4">
                    <img src={step.image} alt={step.alt} className="w-full h-auto object-contain" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}