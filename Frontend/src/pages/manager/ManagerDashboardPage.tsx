import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, CarFront, Euro, FileCheck, UsersRound, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import Button from '../../components/ui/Button'
import api from '../../services/api'

interface DashboardSummary {
  pending_documents: number
  available_vehicles: number
  reservations_to_check: number
  active_users: number
  open_interventions: number
  revenue: {
    amount: string
    currency: string
  }
}



export default function ManagerDashboardPage() {
  const { t } = useTranslation()
  const countFormat = new Intl.NumberFormat(clientLocale())
  const summary = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<DashboardSummary>('/management/dashboard/', { signal })
      return data
    },
  })
  const data = summary.data
  const revenue = data?.revenue
  const metrics = [
    {
      label: 'Documents à valider',
      value: data && countFormat.format(data.pending_documents),
      to: '/manager/documents',
      Icon: FileCheck,
      iconClass: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Véhicules disponibles',
      value: data && countFormat.format(data.available_vehicles),
      to: '/manager/vehicles',
      Icon: CarFront,
      iconClass: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Réservations à contrôler',
      value: data && countFormat.format(data.reservations_to_check),
      to: '/manager/reservations',
      Icon: CalendarCheck,
      iconClass: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Chiffre d’affaires du mois',
      value: revenue && new Intl.NumberFormat(clientLocale(), { style: 'currency', currency: revenue.currency }).format(Number(revenue.amount)),
      Icon: Euro,
      iconClass: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Utilisateurs actifs',
      value: data && countFormat.format(data.active_users),
      to: '/manager/users',
      Icon: UsersRound,
      iconClass: 'bg-blue-50 text-blue-700',
      startCenteredRow: true,
    },
    {
      label: 'Interventions en cours',
      value: data && countFormat.format(data.open_interventions),
      to: '/manager/interventions',
      Icon: Wrench,
      iconClass: 'bg-orange-50 text-orange-700',
    },
  ]

  return (
    <section className="space-y-4 sm:space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{t("navigation.dashboard")}</h1>

      {summary.isPending ? <p role="status" className="text-sm text-slate-600">{t("professional.chargement_des_indicateurs")}</p> : null}
      {summary.isError ? (
        <div className="space-y-2">
          <Alert variant="danger" title={t("professional.indicateurs_indisponibles")} message={t("professional.le_tableau_de_bord_n_a_pas_pu_etre_actualise")} />
          <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>{t("client.reessayer_alt")}</Button>
        </div>
      ) : null}
      <dl aria-label={t("professional.indicateurs_du_tableau_de_bord")} className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {metrics.map(({ label, value, to, Icon, iconClass, startCenteredRow }) => (
          <div key={label} className={`relative flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-center sm:px-5 sm:py-4 ${startCenteredRow ? 'lg:col-start-2' : ''} ${to ? 'transition-colors hover:border-slate-300 hover:bg-slate-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-700' : ''}`}>
            <dt className="flex flex-col items-center gap-2 text-base leading-tight font-medium text-slate-700 sm:text-lg">
              <span aria-hidden="true" className={`grid size-12 place-items-center rounded-xl sm:size-14 ${iconClass}`}><Icon className="size-6 sm:size-7" /></span>
              {to ? <Link to={to} className="after:absolute after:inset-0 focus-visible:outline-none">{professionalDisplay(t, label)}</Link> : professionalDisplay(t, label)}
            </dt>
            <dd className="mt-auto [overflow-wrap:anywhere] text-[1.375rem]/tight font-bold tracking-tight tabular-nums text-slate-900 min-[375px]:text-[1.625rem] sm:text-[2rem]">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
