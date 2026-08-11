import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  CarFront,
  CreditCard,
  Lock,
  Shield,
  SlidersHorizontal,
  Users,
  Wrench,
} from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

type ActiveFeature = {
  title: string
  description: string
  to: string
  icon: typeof CalendarCheck
}

type UpcomingFeature = {
  title: string
  icon: typeof Users
}

const activeFeatures: ActiveFeature[] = [
  {
    title: 'Reservations',
    description: 'Suivez les reservations, appliquez les filtres management et accedez au detail.',
    to: '/admin/reservations',
    icon: CalendarCheck,
  },
  {
    title: 'Vehicules',
    description: 'Consultez et pilotez le parc vehicules, y compris statuts et photos.',
    to: '/admin/vehicles',
    icon: CarFront,
  },
  {
    title: 'Interventions',
    description: 'Creez et assignez les interventions de maintenance et de nettoyage.',
    to: '/admin/interventions',
    icon: Wrench,
  },
  {
    title: 'Factures',
    description: 'Accedez a la consultation des factures disponibles en management.',
    to: '/admin/invoices',
    icon: CreditCard,
  },
]

const upcomingFeatures: UpcomingFeature[] = [
  { title: 'Utilisateurs', icon: Users },
  { title: 'Roles', icon: Shield },
  { title: 'Statistiques', icon: SlidersHorizontal },
  { title: 'Parametres', icon: Lock },
]

export default function AdminDashboardPage() {
  return (
    <section className="space-y-8">
      <header className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Administration</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#0F172A] sm:text-4xl">Tableau de bord administrateur</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          Accedez aux fonctionnalites backend actuellement exposees pour votre role.
        </p>
      </header>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-[#0F172A]">Fonctionnalites disponibles</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeFeatures.map((feature) => {
            const Icon = feature.icon

            return (
              <Card
                key={feature.title}
                className="flex h-full flex-col"
                header={
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-lg font-semibold text-[#0F172A]">{feature.title}</h3>
                  </div>
                }
              >
                <div className="flex h-full flex-col justify-between gap-5">
                  <p className="text-sm leading-7 text-slate-600">{feature.description}</p>
                  <Link to={feature.to} className="inline-flex">
                    <Button variant="secondary" size="sm" className="w-full sm:w-auto">
                      Ouvrir
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-[#0F172A]">Fonctionnalites administrateur a venir</h2>
        <p className="text-sm text-slate-500">API backend non disponible actuellement.</p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {upcomingFeatures.map((feature) => {
            const Icon = feature.icon

            return (
              <Card
                key={feature.title}
                className="border-dashed border-slate-300 bg-slate-50"
                header={
                  <div className="flex items-center gap-3 opacity-70">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <h3 className="text-base font-semibold text-slate-700">{feature.title}</h3>
                  </div>
                }
              >
                <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                  <span>Bientot disponible</span>
                  <span className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.08em]">
                    Desactive
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
