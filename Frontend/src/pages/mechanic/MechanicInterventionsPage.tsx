import { professionalDisplay } from '../../i18n/professionalDisplay'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import PersonnelInterventionCard from '../../components/interventions/PersonnelInterventionCard'
import Button from '../../components/ui/Button'
import type { StatusVariant } from '../../components/ui/StatusBadge'
import { getMechanicInterventions, resumeMechanicIntervention } from '../../services/mechanicInterventionService'
import type { MechanicInterventionStatus } from '../../types/mechanicIntervention'

function mapStatusToBadge(status: MechanicInterventionStatus): { label: string; variant: StatusVariant } {
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

function getResumeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
  }
  return 'La reprise de l’intervention a échoué. Veuillez réessayer.'
}

export default function MechanicInterventionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const interventionsQuery = useQuery({
    queryKey: ['mechanic-interventions'],
    queryFn: () => getMechanicInterventions(),
    refetchOnWindowFocus: false,
  })
  const resumeMutation = useMutation({
    mutationFn: (id: number) => resumeMechanicIntervention(id),
    onSuccess: async (_intervention, id) => {
      await queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] })
      navigate(`/mechanic/interventions/${id}?step=work`)
    },
  })

  if (interventionsQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner size="lg" aria-label={t("professional.chargement_des_interventions")} />
      </div>
    )
  }

  if (interventionsQuery.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title={t("client.chargement_impossible")}
          message={t("professional.les_interventions_n_ont_pas_pu_etre_recuperees_veuillez_reessayer")}
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

  const interventions = interventionsQuery.data?.results ?? []

  if (interventions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title={t("professional.aucune_intervention_assignee")}
          description={t("professional.vous_n_avez_actuellement_aucune_intervention_a_traiter")}
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
        {resumeMutation.isError ? <Alert variant="danger" title={t("professional.reprise_impossible")} message={professionalDisplay(t, getResumeErrorMessage(resumeMutation.error))} /> : null}
        {interventions.map((intervention) => {
          const statusBadge = mapStatusToBadge(intervention.status)

          return (
            <PersonnelInterventionCard
              key={intervention.id}
              intervention={intervention}
              statusBadge={statusBadge}
              action={(
                <>
                {intervention.status === 'EN_PAUSE' ? (
                  <Button
                    className="min-w-[11rem]"
                    disabled={resumeMutation.isPending}
                    onClick={() => void resumeMutation.mutateAsync(intervention.id)}
                  >
                    {resumeMutation.isPending ? t("professional.reprise") : t("professional.reprendre_l_intervention")}
                  </Button>
                ) : null}
                {intervention.status === 'EN_PAUSE' ? null : intervention.status === 'PLANIFIEE' ? (
                  <Link to={`/mechanic/interventions/${intervention.id}`}><Button className="min-w-[11rem]">{t("professional.commencer")}</Button></Link>
                ) : intervention.status === 'TERMINEE' ? (
                  <Link to={`/mechanic/interventions/${intervention.id}`}><Button variant="secondary" className="min-w-[11rem]">{t("professional.voir_le_rapport")}</Button></Link>
                ) : (
                  <Link to={`/mechanic/interventions/${intervention.id}`}><Button variant="secondary" className="min-w-[11rem]">{intervention.status === 'EN_COURS' ? t("professional.voir_l_intervention") : t("client.voir_le_detail")}</Button></Link>
                )}
                </>
              )}
            />
          )
        })}
      </div>
    </div>
  )
}
