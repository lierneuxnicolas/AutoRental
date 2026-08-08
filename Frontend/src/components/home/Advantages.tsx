import type { ComponentType } from 'react'
import { Headphones, ShieldCheck, Smartphone, Unlock } from 'lucide-react'
import Card from '../ui/Card'

type Advantage = {
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

const ADVANTAGES: Advantage[] = [
  {
    title: 'Location 100 % en ligne',
    description:
      'Réservez, payez et gérez votre location directement depuis votre espace personnel.',
    Icon: Smartphone,
  },
  {
    title: 'Déverrouillage simple',
    description:
      "Accédez à votre véhicule depuis l'application après avoir réalisé l'état des lieux.",
    Icon: Unlock,
  },
  {
    title: 'Paiement sécurisé',
    description: 'Vos paiements et votre caution sont traités de manière sécurisée.',
    Icon: ShieldCheck,
  },
  {
    title: 'Assistance',
    description:
      'Retrouvez facilement les informations utiles et signalez un problème pendant votre location.',
    Icon: Headphones,
  },
]

export default function Advantages() {
  return (
    <section className="mt-14 sm:mt-16" aria-labelledby="advantages-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="advantages-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Pourquoi choisir AutoRental ?
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Une expérience de location simple, rapide et entièrement numérique.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 md:grid-cols-2 lg:grid-cols-4">
          {ADVANTAGES.map(({ title, description, Icon }) => (
            <Card
              key={title}
              className="h-full rounded-2xl border-slate-200 bg-[#F8FAFC] shadow-[0_6px_20px_rgba(15,23,42,0.06)]"
            >
              <article aria-labelledby={`advantage-${title}`} className="h-full">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>

                <h3 id={`advantage-${title}`} className="mt-5 text-lg font-semibold text-[#1F2937]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}