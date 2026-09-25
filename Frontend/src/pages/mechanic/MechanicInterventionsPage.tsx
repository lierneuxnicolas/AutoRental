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
        <LoadingSpinner size="lg" aria-label="Chargement des interventions" />
      </div>
    )
  }

  if (interventionsQuery.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les interventions n’ont pas pu être récupérées. Veuillez réessayer."
        />
        <button
          type="button"
          onClick={() => void interventionsQuery.refetch()}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          Réessayer
        </button>
      </div>
    )
  }

  const interventions = interventionsQuery.data?.results ?? []

  if (interventions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title="Aucune intervention assignée"
          description="Vous n'avez actuellement aucune intervention à traiter."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[#1F2937]">Mes interventions</h1>
      </div>

      <div className="grid gap-4">
        {resumeMutation.isError ? <Alert variant="danger" title="Reprise impossible" message={getResumeErrorMessage(resumeMutation.error)} /> : null}
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
                    {resumeMutation.isPending ? 'Reprise...' : 'Reprendre l’intervention'}
                  </Button>
                ) : null}
                {intervention.status === 'EN_PAUSE' ? null : intervention.status === 'PLANIFIEE' ? (
                  <Link to={`/mechanic/interventions/${intervention.id}`}><Button className="min-w-[11rem]">Commencer</Button></Link>
                ) : intervention.status === 'TERMINEE' ? (
                  <Link to={`/mechanic/interventions/${intervention.id}`}><Button variant="secondary" className="min-w-[11rem]">Voir le rapport</Button></Link>
                ) : (
                  <Link to={`/mechanic/interventions/${intervention.id}`}><Button variant="secondary" className="min-w-[11rem]">{intervention.status === 'EN_COURS' ? 'Voir l’intervention' : 'Voir le détail'}</Button></Link>
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
