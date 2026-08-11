import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getMechanicInterventions } from '../../services/mechanicInterventionService'
import type { MechanicInterventionResponse, MechanicInterventionStatus } from '../../types/mechanicIntervention'

function mapStatusToBadge(status: MechanicInterventionStatus): { label: string; variant: StatusVariant } {
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

function getVehicleLabel(intervention: MechanicInterventionResponse): string {
  const vehicle = intervention.vehicle
  const registration = vehicle.registration_number?.trim()

  if (registration) {
    return `${vehicle.brand} ${vehicle.model_name} • ${registration}`
  }

  return `${vehicle.brand} ${vehicle.model_name}`
}

export default function MechanicInterventionsPage() {
  const interventionsQuery = useQuery({
    queryKey: ['mechanic-interventions'],
    queryFn: () => getMechanicInterventions(),
    refetchOnWindowFocus: false,
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
        <p className="text-sm text-slate-600">
          Consultez les interventions qui vous ont été assignées par le gestionnaire.
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
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Véhicule</p>
                    <p className="mt-1 text-sm text-[#1F2937]">{getVehicleLabel(intervention)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {intervention.description?.trim() ? intervention.description : 'Aucune description fournie.'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Réservation liée</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {intervention.reservation ? intervention.reservation.reference : 'Aucune réservation liée'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date de création</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTime(intervention.created_at)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dernière mise à jour</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTime(intervention.updated_at)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigné à</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {intervention.assigned_to
                        ? `${intervention.assigned_to.first_name} ${intervention.assigned_to.last_name}`.trim()
                        : 'Non renseigné'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Link
                  to={`/mechanic/interventions/${intervention.id}`}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#2563EB] transition hover:border-[#2563EB] hover:bg-slate-50"
                >
                  Voir le détail
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
