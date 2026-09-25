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
  const [page, setPage] = useState(1)

  const interventionsQuery = useQuery({
    queryKey: ['cleaning-interventions', page],
    queryFn: () => getInterventions('cleaning', { page }),
    refetchOnWindowFocus: false,
  })

  if (interventionsQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner size="lg" aria-label="Chargement des interventions de nettoyage" />
      </div>
    )
  }

  if (interventionsQuery.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les interventions de nettoyage n’ont pas pu être récupérées. Veuillez réessayer."
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

  const response = interventionsQuery.data
  const interventions = response?.results ?? []

  if (interventions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title="Aucune intervention assignée"
          description="Vous n'avez actuellement aucune intervention de nettoyage à traiter."
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
                      ? 'Commencer'
                      : intervention.status === 'TERMINEE'
                        ? 'Voir le rapport'
                        : intervention.status === 'EN_COURS'
                          ? 'Voir l’intervention'
                          : 'Voir le détail'}
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
            Précédent
          </button>

          <p className="text-sm text-slate-600">Page {page}</p>

          <button
            type="button"
            disabled={!response.next}
            onClick={() => {
              setPage((currentPage) => currentPage + 1)
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Suivant
          </button>
        </div>
      ) : null}
    </div>
  )
}
