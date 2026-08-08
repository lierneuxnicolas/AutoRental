import type { ComponentType } from 'react'
import { CalendarCheck, RotateCcw, Search, Unlock } from 'lucide-react'

type Step = {
  number: string
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Rechercher',
    description: 'Choisissez vos dates et trouvez un véhicule disponible.',
    Icon: Search,
  },
  {
    number: '02',
    title: 'Réserver',
    description: 'Créez votre réservation et confirmez-la en ligne.',
    Icon: CalendarCheck,
  },
  {
    number: '03',
    title: 'Déverrouiller',
    description: "Réalisez l'état des lieux puis déverrouillez le véhicule depuis l'application.",
    Icon: Unlock,
  },
  {
    number: '04',
    title: 'Restituer',
    description: "Effectuez l'état des lieux de retour et restituez le véhicule.",
    Icon: RotateCcw,
  },
]

export default function HowItWorks() {
  return (
    <section id="fonctionnement" className="mt-14 scroll-mt-24 sm:mt-16">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Comment ça marche ?
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Toute la location se fait en ligne: de la réservation à la restitution, sans paperasse.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(({ number, title, description, Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold tracking-[0.2em] text-[#2563EB]">{number}</span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-[#1F2937]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}