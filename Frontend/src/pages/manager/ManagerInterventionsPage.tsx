import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  assignManagementIntervention,
  createManagementIntervention,
  getManagementInterventions,
} from '../../services/managementInterventionService'
import type {
  InterventionStatus,
  InterventionType,
  ManagementInterventionAssignRequest,
  ManagementInterventionCreateRequest,
  ManagementInterventionResponse,
} from '../../types/managementIntervention'

type InterventionViewMode = 'assigned' | 'all'

function mapStatusToBadge(status: InterventionStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'A_ATTRIBUER':
      return { label: 'A attribuer', variant: 'warning' }
    case 'ATTRIBUEE':
      return { label: 'Attribuee', variant: 'info' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'TERMINEE':
      return { label: 'Terminee', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulee', variant: 'danger' }
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

function getPersonLabel(person: ManagementInterventionResponse['assigned_to'] | ManagementInterventionResponse['created_by'] | null): string | null {
  if (!person) {
    return null
  }

  const fullName = `${person.first_name} ${person.last_name}`.trim()
  return fullName.length > 0 ? fullName : person.email
}

interface BackendValidationErrorPayload {
  detail?: string
  non_field_errors?: string[]
  vehicle_id?: string[]
  reservation_id?: string[]
  type?: string[]
  description?: string[]
  assigned_user_id?: string[]
}

function toGeneralError(payload: BackendValidationErrorPayload | undefined): string {
  if (!payload) {
    return 'Une erreur est survenue. Veuillez réessayer.'
  }

  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length > 0) {
    return payload.non_field_errors.join(' ')
  }

  return 'Une erreur est survenue. Veuillez réessayer.'
}

export default function ManagerInterventionsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<InterventionViewMode>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [vehicleId, setVehicleId] = useState('')
  const [reservationId, setReservationId] = useState('')
  const [type, setType] = useState<InterventionType>('MECANIQUE')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastCreatedIntervention, setLastCreatedIntervention] = useState<ManagementInterventionResponse | null>(null)
  const [assignFormOpenForId, setAssignFormOpenForId] = useState<number | null>(null)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null)

  const interventionsQuery = useQuery({
    queryKey: ['manager-interventions', page],
    queryFn: () => getManagementInterventions({ page }),
    enabled: viewMode === 'all',
  })

  const assignedInterventionsQuery = useQuery({
    queryKey: ['manager-interventions-assigned'],
    queryFn: async () => {
      const allInterventions: ManagementInterventionResponse[] = []
      const visitedPages = new Set<number>()
      let nextPage: number | null = 1

      while (nextPage !== null) {
        if (visitedPages.has(nextPage)) {
          break
        }

        visitedPages.add(nextPage)

        const response = await getManagementInterventions({ page: nextPage })
        allInterventions.push(...response.results)

        if (!response.next) {
          nextPage = null
          continue
        }

        let parsedNextPage: number | null

        try {
          const nextUrl = new URL(response.next, 'http://localhost')
          const pageValue = Number(nextUrl.searchParams.get('page'))
          parsedNextPage = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : null
        } catch {
          parsedNextPage = null
        }

        nextPage = parsedNextPage
      }

      return allInterventions.filter((intervention) => intervention.assigned_to !== null)
    },
    enabled: viewMode === 'assigned',
  })

  const createMutation = useMutation({
    mutationFn: (payload: ManagementInterventionCreateRequest) => createManagementIntervention(payload),
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ManagementInterventionAssignRequest }) => assignManagementIntervention(id, payload),
  })

  const interventions = useMemo(
    () => interventionsQuery.data?.results ?? [],
    [interventionsQuery.data?.results],
  )

  const displayedInterventions = useMemo(() => {
    if (interventions.length > 0) {
      return interventions
    }

    return lastCreatedIntervention ? [lastCreatedIntervention] : []
  }, [interventions, lastCreatedIntervention])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    const normalizedPayload: ManagementInterventionCreateRequest = {
      vehicle_id: Number(vehicleId),
      reservation_id: reservationId ? Number(reservationId) : null,
      type,
      description: description.trim(),
    }

    try {
      const createdIntervention = await createMutation.mutateAsync(normalizedPayload)
      setIsCreateOpen(false)
      setVehicleId('')
      setReservationId('')
      setType('MECANIQUE')
      setDescription('')
      setLastCreatedIntervention(createdIntervention)
      setViewMode('all')
      setPage(1)
      await queryClient.invalidateQueries({ queryKey: ['manager-interventions'] })
      await queryClient.invalidateQueries({ queryKey: ['manager-interventions-assigned'] })
      setSuccessMessage('L’intervention a été créée avec succès.')
      await queryClient.refetchQueries({ queryKey: ['manager-interventions'] })
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setFormError('Une erreur inattendue est survenue.')
        return
      }

      const statusCode = error.response?.status
      const backendPayload = error.response?.data as BackendValidationErrorPayload | undefined

      if (statusCode === 403) {
        setFormError('Vous n’avez pas les permissions pour créer une intervention.')
        return
      }

      if (statusCode === 400) {
        setFormError(toGeneralError(backendPayload))
        return
      }

      setFormError(toGeneralError(backendPayload))
    }
  }

  const handleAssignSubmit = async (event: React.FormEvent<HTMLFormElement>, interventionId: number) => {
    event.preventDefault()
    setAssignError(null)
    setAssignSuccessMessage(null)

    const parsedUserId = Number(assignUserId)

    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
      setAssignError('Veuillez saisir un identifiant utilisateur valide.')
      return
    }

    try {
      await assignMutation.mutateAsync({
        id: interventionId,
        payload: { assigned_user_id: parsedUserId },
      })

      setAssignFormOpenForId(null)
      setAssignUserId('')
      await queryClient.invalidateQueries({ queryKey: ['manager-interventions'] })
      await queryClient.invalidateQueries({ queryKey: ['manager-interventions-assigned'] })
      if (viewMode === 'assigned') {
        await assignedInterventionsQuery.refetch()
      } else {
        await interventionsQuery.refetch()
      }
      setAssignSuccessMessage('L’intervention a été assignée avec succès.')
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setAssignError('Une erreur inattendue est survenue.')
        return
      }

      const statusCode = error.response?.status
      const backendPayload = error.response?.data as BackendValidationErrorPayload | undefined

      if (statusCode === 403) {
        setAssignError('Vous n’avez pas les permissions pour assigner cette intervention.')
        return
      }

      if (statusCode === 404) {
        setAssignError('L’intervention demandée est introuvable.')
        return
      }

      if (statusCode === 400) {
        setAssignError(toGeneralError(backendPayload))
        return
      }

      setAssignError(toGeneralError(backendPayload))
    }
  }

  const hasPreviousPage = Boolean(interventionsQuery.data?.previous)
  const hasNextPage = Boolean(interventionsQuery.data?.next)
  const activeIsLoading = viewMode === 'assigned' ? assignedInterventionsQuery.isLoading : interventionsQuery.isLoading
  const activeIsError = viewMode === 'assigned' ? assignedInterventionsQuery.isError : interventionsQuery.isError
  const currentInterventions = viewMode === 'assigned'
    ? (assignedInterventionsQuery.data ?? [])
    : displayedInterventions
  const currentCount = viewMode === 'assigned'
    ? currentInterventions.length
    : (interventionsQuery.data?.count ?? currentInterventions.length)

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Interventions</h1>
          <p className="mt-1 text-sm text-slate-500">Consultez la liste des interventions de gestion.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
          Créer une intervention
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={viewMode === 'assigned' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setViewMode('assigned')}
        >
          Assignées
        </Button>
        <Button
          variant={viewMode === 'all' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setViewMode('all')}
        >
          Toutes
        </Button>
      </div>

      {successMessage ? (
        <Alert variant="success" title="Intervention créée" message={successMessage} />
      ) : null}

      {formError ? (
        <Alert variant="danger" title="Création impossible" message={formError} />
      ) : null}

      {assignSuccessMessage ? (
        <Alert variant="success" title="Intervention assignée" message={assignSuccessMessage} />
      ) : null}

      {assignError ? (
        <Alert variant="danger" title="Assignation impossible" message={assignError} />
      ) : null}

      {isCreateOpen ? (
        <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Nouvelle intervention</h2>}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Vehicle ID"
                type="number"
                min="1"
                required
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                placeholder="Ex: 12"
              />
              <Input
                label="Reservation ID"
                type="number"
                min="1"
                value={reservationId}
                onChange={(event) => setReservationId(event.target.value)}
                placeholder="Optionnel"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]" htmlFor="intervention-type">
                Type d’intervention
              </label>
              <select
                id="intervention-type"
                value={type}
                onChange={(event) => setType(event.target.value as InterventionType)}
                className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              >
                <option value="MECANIQUE">MECANIQUE</option>
                <option value="NETTOYAGE">NETTOYAGE</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#1F2937]" htmlFor="intervention-description">
                Description
              </label>
              <textarea
                id="intervention-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                placeholder="Description de l’intervention"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Création...' : 'Créer l’intervention'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {activeIsLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des interventions" />
        </div>
      ) : null}

      {activeIsError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message="Les interventions n'ont pas pu être récupérées. Veuillez réessayer."
        />
      ) : null}

      {!activeIsLoading && !activeIsError && currentInterventions.length === 0 ? (
        <EmptyState
          title={viewMode === 'assigned' ? 'Aucune intervention assignée' : 'Aucune intervention'}
          description={
            viewMode === 'assigned'
              ? 'Aucune intervention n’est actuellement assignée.'
              : 'Aucune intervention n’est actuellement enregistrée.'
          }
        />
      ) : null}

      {!activeIsLoading && !activeIsError && currentInterventions.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {currentCount} intervention{currentCount > 1 ? 's' : ''}
            </p>
            {viewMode === 'all' ? (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={!hasPreviousPage}>
                  Précédent
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPage((currentPage) => currentPage + 1)} disabled={!hasNextPage}>
                  Suivant
                </Button>
              </div>
            ) : null}
          </div>

          {currentInterventions.map((intervention) => {
            const status = mapStatusToBadge(intervention.status)
            const assignedTo = getPersonLabel(intervention.assigned_to)
            const createdBy = getPersonLabel(intervention.created_by)

            return (
              <Card
                key={intervention.id}
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Référence</p>
                      <p className="text-base font-semibold text-[#0F172A]">{intervention.reference}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge variant={status.variant} label={status.label} />
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                        {intervention.intervention_type}
                      </span>
                    </div>
                  </div>
                }
              >
                <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <p className="font-medium text-[#1F2937]">Description</p>
                    <p className="mt-1 whitespace-pre-line">{intervention.description || 'Aucune description fournie.'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Véhicule</p>
                    <p className="mt-1">
                      {intervention.vehicle.brand} {intervention.vehicle.model_name}
                    </p>
                    <p className="text-slate-500">{intervention.vehicle.registration_number}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Réservation</p>
                    <p className="mt-1">{intervention.reservation ? intervention.reservation.reference : 'Aucune réservation liée'}</p>
                  </div>
                  {assignedTo ? (
                    <div>
                      <p className="font-medium text-[#1F2937]">Assigné à</p>
                      <p className="mt-1">{assignedTo}</p>
                    </div>
                  ) : null}
                  {createdBy ? (
                    <div>
                      <p className="font-medium text-[#1F2937]">Créé par</p>
                      <p className="mt-1">{createdBy}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="font-medium text-[#1F2937]">Créé le</p>
                    <p className="mt-1">{formatDateTime(intervention.created_at)}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  {intervention.status === 'A_ATTRIBUER' ? (
                    <>
                      {assignFormOpenForId === intervention.id ? (
                        <form className="flex w-full flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 md:flex-row md:items-end" onSubmit={(event) => handleAssignSubmit(event, intervention.id)}>
                          <div className="flex-1">
                            <label className="mb-2 block text-sm font-medium text-[#1F2937]" htmlFor={`assign-user-${intervention.id}`}>
                              assigned_user_id
                            </label>
                            <Input
                              id={`assign-user-${intervention.id}`}
                              type="number"
                              min="1"
                              required
                              value={assignUserId}
                              onChange={(event) => setAssignUserId(event.target.value)}
                              placeholder="ID utilisateur autorisé"
                            />
                            <p className="mt-2 text-sm text-slate-500">
                              Saisissez l’ID d’un utilisateur autorisé. Aucune liste d’utilisateurs n’est disponible dans cette vue.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" size="sm" onClick={() => setAssignFormOpenForId(null)}>
                              Annuler
                            </Button>
                            <Button type="submit" variant="primary" size="sm" disabled={assignMutation.isPending}>
                              {assignMutation.isPending ? 'Assignation...' : 'Confirmer'}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => {
                          setAssignFormOpenForId(intervention.id)
                          setAssignUserId('')
                          setAssignError(null)
                        }}>
                          Assigner
                        </Button>
                      )}
                    </>
                  ) : null}
                  <Button variant="secondary" size="sm" disabled>
                    Voir le détail
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
