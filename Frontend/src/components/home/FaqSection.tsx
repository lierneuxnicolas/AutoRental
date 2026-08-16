import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import Card from '../ui/Card'

type FaqItem = {
  question: string
  answer: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Comment réserver un véhicule ?',
    answer:
      'Choisissez vos dates, sélectionnez un véhicule disponible puis effectuez votre réservation en ligne.',
  },
  {
    question: 'Quand dois-je téléverser mon permis ?',
    answer:
      "Votre permis de conduire et votre carte d'identité devront être validés avant votre première réservation.",
  },
  {
    question: 'Comment récupérer le véhicule ?',
    answer:
      "Après validation de votre réservation, rendez-vous au parking et suivez les instructions dans l'application.",
  },
  {
    question: 'Comment restituer le véhicule ?',
    answer:
      "Effectuez l'état des lieux de retour directement depuis votre téléphone puis verrouillez le véhicule.",
  },
  {
    question: 'Puis-je annuler une réservation ?',
    answer: 'Oui, selon les conditions générales de location.',
  },
]

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  const handleToggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index))
  }

  return (
    <section className="mt-14 sm:mt-16" aria-labelledby="faq-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="faq-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Questions fréquentes
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Tout ce qu'il faut savoir avant votre réservation.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-4xl space-y-4 sm:mt-10">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index
            const panelId = `${baseId}-panel-${index}`
            const buttonId = `${baseId}-button-${index}`

            return (
              <Card key={item.question} className="rounded-2xl border-slate-200 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 text-left text-base font-semibold text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => handleToggle(index)}
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-[#2563EB] transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={`grid transition-all duration-200 ease-out ${isOpen ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm leading-7 text-slate-600">{item.answer}</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function ContactSection() {
  return (
    <section className="mt-14 sm:mt-16" aria-labelledby="contact-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563EB]">Contact</p>
          <h3 id="contact-title" className="mt-3 text-2xl font-semibold text-[#1F2937]">Nous sommes là pour vous aider</h3>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2563EB]">Email</p>
            <p className="mt-3 text-base font-semibold text-[#1F2937]">bonjour@getacar.be</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2563EB]">Téléphone</p>
            <p className="mt-3 text-base font-semibold text-[#1F2937]">+32 2 555 12 34</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2563EB]">Adresse</p>
            <p className="mt-3 text-base font-semibold text-[#1F2937]">Avenue de l’Innovation 12, 1000 Bruxelles</p>
          </div>
        </div>
      </div>
    </section>
  )
}