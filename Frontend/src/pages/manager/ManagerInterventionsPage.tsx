import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import PersonnelInterventionReport from '../../components/interventions/PersonnelInterventionReport'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import {
  assignManagementIntervention,
  getManagementInterventions,
} from '../../services/managementInterventionService'
import type {
  InterventionStatus,
  ManagementInterventionAssignRequest,
  ManagementInterventionResponse,
} from '../../types/managementIntervention'

function mapStatusToBadge(status: InterventionStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'A_ATTRIBUER':
      return { label: 'A attribuer', variant: 'warning' }
    case 'ATTRIBUEE':
      return { label: 'Attribuee', variant: 'info' }
    case 'PLANIFIEE':
      return { label: 'Planifiée', variant: 'info' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'EN_PAUSE':
      return { label: 'En pause', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminee', variant: 'success' }
    case 'ANNULEE':
      return { label: 'Annulee', variant: 'danger' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(clientLocale(), {
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [assignFormOpenForId, setAssignFormOpenForId] = useState<number | null>(null)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null)
  const [reportOpenForId, setReportOpenForId] = useState<number | null>(null)

  const interventionsQuery = useQuery({
    queryKey: ['manager-interventions'],
    queryFn: async () => {
      const allInterventions: ManagementInterventionResponse[] = []
      let nextPage: number | null = 1

      while (nextPage !== null) {
        const response = await getManagementInterventions({ page: nextPage })
        allInterventions.push(...response.results)
        if (!response.next) {
          nextPage = null
        } else {
          const nextUrl = new URL(response.next, window.location.origin)
          const parsedPage = Number(nextUrl.searchParams.get('page'))
          nextPage = Number.isInteger(parsedPage) && parsedPage > nextPage ? parsedPage : null
        }
      }

      return allInterventions
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ManagementInterventionAssignRequest }) => assignManagementIntervention(id, payload),
  })

  const interventions = interventionsQuery.data ?? []

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
      await interventionsQuery.refetch()
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

  return (
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold text-[#0F172A]">{t("professional.liste_des_interventions")}</h1>

      {assignSuccessMessage ? (
        <Alert variant="success" title={t("professional.intervention_assignee")} message={professionalDisplay(t, assignSuccessMessage)} />
      ) : null}

      {assignError ? (
        <Alert variant="danger" title={t("professional.assignation_impossible")} message={professionalDisplay(t, assignError)} />
      ) : null}

      {interventionsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label={t("professional.chargement_des_interventions")} />
        </div>
      ) : null}

      {interventionsQuery.isError ? (
        <Alert
          variant="danger"
          title={t("client.chargement_impossible")}
          message={t("professional.les_interventions_n_ont_pas_pu_etre_recuperees_veuillez_reessayer")}
        />
      ) : null}

      {!interventionsQuery.isLoading && !interventionsQuery.isError && interventions.length === 0 ? (
        <EmptyState
          title={t("professional.aucune_intervention")}
          description={t("professional.aucune_intervention_n_est_actuellement_enregistree")}
        />
      ) : null}

      {!interventionsQuery.isLoading && !interventionsQuery.isError && interventions.length > 0 ? (
        <div className="space-y-4">
          {interventions.map((intervention) => {
            const status = mapStatusToBadge(intervention.status)
            const assignedTo = getPersonLabel(intervention.assigned_to)
            const createdBy = getPersonLabel(intervention.created_by)

            return (
              <Fragment key={intervention.id}>
                <Card
                  header={
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("client.reference_alt")}</p>
                        <p className="text-base font-semibold text-[#0F172A]">{intervention.reference}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant={status.variant} label={professionalDisplay(t, status.label)} />
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                          {intervention.intervention_type}
                        </span>
                      </div>
                    </div>
                  }
                >
                  <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="font-medium text-[#1F2937]">{t("client.description")}</p>
                      <p className="mt-1 whitespace-pre-line">{intervention.description || 'Aucune description fournie.'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">{t("client.vehicule_alt")}</p>
                      <p className="mt-1">
                        {intervention.vehicle.brand} {intervention.vehicle.model_name}
                      </p>
                      <p className="text-slate-500">{intervention.vehicle.registration_number}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">{t("client.reservation")}</p>
                      <p className="mt-1">{intervention.reservation ? intervention.reservation.reference : t("professional.aucune_reservation_liee")}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">{t("professional.personne_affectee")}</p>
                      <p className="mt-1">{assignedTo ?? 'Non affectée'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">{t("professional.cree_par")}</p>
                      <p className="mt-1">{createdBy ?? '—'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[#1F2937]">{t("professional.cree_le")}</p>
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
                                placeholder={t("professional.id_utilisateur_autorise")}
                              />
                              <p className="mt-2 text-sm text-slate-500">
                                {t("professional.saisissez_l_id_d_un_utilisateur_autorise_aucune_liste_d_utilisateurs_n")}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="secondary" size="sm" onClick={() => setAssignFormOpenForId(null)}>
                                {t("client.annuler")}</Button>
                              <Button type="submit" variant="primary" size="sm" disabled={assignMutation.isPending}>
                                {assignMutation.isPending ? t("professional.assignation") : t("professional.confirmer")}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <Button variant="primary" size="sm" onClick={() => {
                            setAssignFormOpenForId(intervention.id)
                            setAssignUserId('')
                            setAssignError(null)
                          }}>
                            {t("professional.assigner")}</Button>
                        )}
                      </>
                    ) : null}
                    {intervention.status === 'TERMINEE' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-expanded={reportOpenForId === intervention.id}
                        aria-controls={reportOpenForId === intervention.id ? 'intervention-report-' + intervention.id : undefined}
                        onClick={() => setReportOpenForId((current) => current === intervention.id ? null : intervention.id)}
                      >
                        {t("professional.voir_le_rapport")}</Button>
                    ) : null}
                  </div>

                </Card>
                {reportOpenForId === intervention.id ? (
                  <div id={'intervention-report-' + intervention.id}>
                    {intervention.final_report ? (
                      <PersonnelInterventionReport intervention={intervention} heading="h2" />
                    ) : (
                      <p className="text-sm text-slate-600">{t("professional.aucun_rapport_final_disponible")}</p>
                    )}
                  </div>
                ) : null}
              </Fragment>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
