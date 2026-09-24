import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getMechanicInterventions, resumeMechanicIntervention } from '../../services/mechanicInterventionService'
import type { MechanicInterventionResponse, MechanicInterventionStatus } from '../../types/mechanicIntervention'

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
  return `${vehicle.brand} ${vehicle.model_name}`
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
        <p className="text-sm text-slate-600">
          Consultez les interventions qui vous ont été assignées par le gestionnaire.
        </p>
      </div>

      <div className="grid gap-4">
        {resumeMutation.isError ? <Alert variant="danger" title="Reprise impossible" message={getResumeErrorMessage(resumeMutation.error)} /> : null}
        {interventions.map((intervention) => {
          const statusBadge = mapStatusToBadge(intervention.status)

          return (
            <Card
              key={intervention.id}
              className="border-slate-200"
              header={
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-baseline gap-3">
                    <p className="text-sm font-semibold text-[#2563EB]">{intervention.reference || `#${intervention.id}`}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{intervention.intervention_type}</p>
                  </div>
                  <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-3">
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Véhicule</p>
                  <div className="mt-1 space-y-1 text-sm">
                    <p className="text-slate-700">{getVehicleLabel(intervention)}</p>
                    <p className="text-slate-600">{intervention.vehicle.registration_number || 'Immatriculation non renseignée'}</p>
                    <p className="text-slate-600">Couleur : {intervention.vehicle.color || 'Non renseignée'}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Localisation</p>
                  <p className="mt-1 text-sm text-slate-700">Parking : {intervention.vehicle.parking_name ?? 'Non renseigné'}</p>
                  <p className="mt-1 text-sm text-slate-700">Place : {intervention.vehicle.parking_space_number ?? '—'}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Responsable</p>
                  <p className="mt-1 text-sm text-slate-700">Gestionnaire : {`${intervention.created_by.first_name} ${intervention.created_by.last_name}`.trim() || intervention.created_by.email}</p>
                  <p className="mt-1 text-sm text-slate-700">Attribuée à : {intervention.assigned_to ? `${intervention.assigned_to.first_name} ${intervention.assigned_to.last_name}`.trim() || intervention.assigned_to.email : 'Non renseigné'}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Travail demandé</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{intervention.description?.trim() ? intervention.description : 'Aucune consigne fournie.'}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Planification</p>
                  <p className="mt-1 text-sm text-slate-700">Début : {intervention.planned_start_at ? formatDateTime(intervention.planned_start_at) : 'Non renseigné'}</p>
                  <p className="mt-1 text-sm text-slate-700">Fin : {intervention.planned_end_at ? formatDateTime(intervention.planned_end_at) : 'Non renseignée'}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Réalisation</p>
                  <p className="mt-1 text-sm text-slate-700">Prise en charge : {intervention.started_at ? formatDateTime(intervention.started_at) : '—'}</p>
                  <p className="mt-1 text-sm text-slate-700">Remise : {intervention.completed_at ? formatDateTime(intervention.completed_at) : '—'}</p>
                  {intervention.reservation ? <p className="mt-3 text-sm text-slate-600">Réservation liée : {intervention.reservation.reference}</p> : null}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
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
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
