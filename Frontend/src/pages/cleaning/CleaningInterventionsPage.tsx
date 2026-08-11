import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getInterventions } from '../../services/workerInterventionService'
import type { WorkerInterventionResponse, WorkerInterventionStatus } from '../../types/workerIntervention'

function mapStatusToBadge(status: WorkerInterventionStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'A_ATTRIBUER':
      return { label: 'A attribuer', variant: 'warning' }
    case 'ATTRIBUEE':
      return { label: 'Attribuée', variant: 'info' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'TERMINEE':
      return { label: 'Terminée', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulée', variant: 'danger' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getPersonLabel(assignedTo: WorkerInterventionResponse['assigned_to']): string {
  if (!assignedTo) {
    return 'Non renseigné'
  }

  const fullName = `${assignedTo.first_name} ${assignedTo.last_name}`.trim()
  return fullName.length > 0 ? fullName : assignedTo.email
}

function getVehicleLabel(intervention: WorkerInterventionResponse): string {
  return `${intervention.vehicle.brand} ${intervention.vehicle.model_name}`
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
        <p className="text-sm text-slate-600">
          Consultez les interventions de nettoyage qui vous ont été assignées.
        </p>
      </div>

      <div className="grid gap-4">
        {interventions.map((intervention) => {
          const statusBadge = mapStatusToBadge(intervention.status)

          return (
            <Card
              key={intervention.id}
              className="border-slate-200"
              header={
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#2563EB]">
                      {intervention.reference || `#${intervention.id}`}
                    </p>
                    <p className="text-sm text-slate-600">{intervention.intervention_type}</p>
                  </div>
                  <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {intervention.description?.trim() ? intervention.description : 'Aucune description fournie.'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Véhicule</p>
                    <p className="mt-1 text-sm text-[#1F2937]">{getVehicleLabel(intervention)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Immatriculation</p>
                    <p className="mt-1 text-sm text-[#1F2937]">{intervention.vehicle.registration_number || 'Non renseignée'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Réservation liée</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {intervention.reservation ? intervention.reservation.reference : 'Aucune réservation liée'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date de création</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTime(intervention.created_at)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigné à</p>
                    <p className="mt-1 text-sm text-slate-700">{getPersonLabel(intervention.assigned_to)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Link
                  to={`/cleaning/interventions/${intervention.id}`}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#2563EB] transition hover:border-[#2563EB] hover:bg-slate-50"
                >
                  Voir le détail
                </Link>
              </div>
            </Card>
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
