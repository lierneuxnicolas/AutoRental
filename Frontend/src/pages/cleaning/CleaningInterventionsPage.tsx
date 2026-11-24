import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import PersonnelInterventionCard from '../../components/interventions/PersonnelInterventionCard'
import Button from '../../components/ui/Button'
import type { StatusVariant } from '../../components/ui/StatusBadge'
import { getInterventions } from '../../services/workerInterventionService'
import type { WorkerInterventionStatus } from '../../types/workerIntervention'

function mapStatusToBadge(status: WorkerInterventionStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'A_ATTRIBUER':
      return { label: 'A attribuer', variant: 'warning' }
    case 'ATTRIBUEE':
      return { label: 'Attribuée', variant: 'info' }
    case 'PLANIFIEE':
      return { label: 'Planifiée', variant: 'info' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'EN_PAUSE':
      return { label: 'En pause', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminée', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulée', variant: 'danger' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

export default function CleaningInterventionsPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)

  const interventionsQuery = useQuery({
    queryKey: ['cleaning-interventions', page],
    queryFn: () => getInterventions('cleaning', { page }),
    refetchOnWindowFocus: false,
  })

  if (interventionsQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner size="lg" aria-label={t("professional.chargement_des_interventions_de_nettoyage")} />
      </div>
    )
  }

  if (interventionsQuery.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title={t("client.chargement_impossible")}
          message={t("professional.les_interventions_de_nettoyage_n_ont_pas_pu_etre_recuperees_veuillez_reessayer")}
        />
        <button
          type="button"
          onClick={() => void interventionsQuery.refetch()}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          {t("client.reessayer_alt")}</button>
      </div>
    )
  }

  const response = interventionsQuery.data
  const interventions = response?.results ?? []

  if (interventions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title={t("professional.aucune_intervention_assignee")}
          description={t("professional.vous_n_avez_actuellement_aucune_intervention_de_nettoyage_a_traiter")}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[#1F2937]">{t("professional.mes_interventions")}</h1>
      </div>

      <div className="grid gap-4">
        {interventions.map((intervention) => {
          const statusBadge = mapStatusToBadge(intervention.status)

          return (
            <PersonnelInterventionCard
              key={intervention.id}
              intervention={intervention}
              statusBadge={statusBadge}
              action={(
                <Link to={`/cleaning/interventions/${intervention.id}`}>
                  <Button variant={intervention.status === 'PLANIFIEE' ? 'primary' : 'secondary'} className="min-w-[11rem]">
                    {intervention.status === 'PLANIFIEE'
                      ? t("professional.commencer")
                      : intervention.status === 'TERMINEE'
                        ? t("professional.voir_le_rapport")
                        : intervention.status === 'EN_COURS'
                          ? t("professional.voir_l_intervention")
                          : t("client.voir_le_detail")}
                  </Button>
                </Link>
              )}
            />
          )
        })}
      </div>

      {response && (response.previous || response.next) ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!response.previous || page <= 1}
            onClick={() => {
              setPage((currentPage) => Math.max(1, currentPage - 1))
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("client.precedent_alt")}</button>

          <p className="text-sm text-slate-600">{t("client.page")} {page}</p>

          <button
            type="button"
            disabled={!response.next}
            onClick={() => {
              setPage((currentPage) => currentPage + 1)
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("client.suivant")}</button>
        </div>
      ) : null}
    </div>
  )
}
