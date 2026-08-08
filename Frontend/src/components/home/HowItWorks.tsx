import type { ComponentType } from 'react'
import { Car, CreditCard, RotateCcw, UserPlus } from 'lucide-react'
import Card from '../ui/Card'

type Step = {
  number: string
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Créer un compte',
    description: 'Inscrivez-vous gratuitement et complétez votre profil.',
    Icon: UserPlus,
  },
  {
    number: '02',
    title: 'Choisir un véhicule',
    description: 'Sélectionnez vos dates et le véhicule souhaité.',
    Icon: Car,
  },
  {
    number: '03',
    title: 'Payer et récupérer',
    description: 'Effectuez le paiement sécurisé puis récupérez votre voiture.',
    Icon: CreditCard,
  },
  {
    number: '04',
    title: 'Rouler et restituer',
    description: "Profitez du véhicule puis réalisez l'état des lieux de retour.",
    Icon: RotateCcw,
  },
]

export default function HowItWorks() {
  return (
    <section id="fonctionnement" className="mt-14 scroll-mt-24 sm:mt-16">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Comment fonctionne AutoRental ?
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Louez un véhicule en seulement quatre étapes.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ number, title, description, Icon }) => (
            <Card key={title} className="h-full rounded-2xl border-slate-200 bg-[#F8FAFC] shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
              <article aria-labelledby={`step-${number}-title`} className="h-full">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2563EB]">Étape {number}</p>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>

                <h3 id={`step-${number}-title`} className="mt-4 text-lg font-semibold text-[#1F2937]">
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