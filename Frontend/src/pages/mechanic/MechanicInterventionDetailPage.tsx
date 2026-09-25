import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import InterventionCheckInForm from '../../components/interventions/InterventionCheckInForm'
import InterventionCheckOutForm from '../../components/interventions/InterventionCheckOutForm'
import PersonnelInterventionReport from '../../components/interventions/PersonnelInterventionReport'
import InterventionWorkflowProgress from '../../components/interventions/InterventionWorkflowProgress'
import InterventionWorkForm from '../../components/interventions/InterventionWorkForm'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { checkInMechanicIntervention, checkOutMechanicIntervention, getMechanicInterventionById, pauseMechanicIntervention, resumeMechanicIntervention, saveMechanicInterventionWork } from '../../services/mechanicInterventionService'
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

function formatVehicleName(brand: string, modelName: string): string {
  return modelName.toLocaleLowerCase('fr-FR').startsWith(brand.toLocaleLowerCase('fr-FR'))
    ? modelName
    : `${brand} ${modelName}`
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

function formatDateTime(value: unknown): string | null {
  const text = asText(value)
  if (!text) {
    return null
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}


function extractStartErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as unknown

    if (typeof payload === 'string' && payload.trim().length > 0) {
      return payload
    }

    if (payload && typeof payload === 'object') {
      const detail = (payload as { detail?: unknown }).detail
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail
      }

      const nonFieldErrors = (payload as { non_field_errors?: unknown[] }).non_field_errors
      if (Array.isArray(nonFieldErrors)) {
        const firstMessage = nonFieldErrors.find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        if (firstMessage) {
          return firstMessage
        }
      }
    }

    if (!error.response) {
      return 'Impossible de joindre le serveur. Veuillez réessayer.'
    }

    if (error.response.status === 400) {
      return 'La demande ne peut pas être traitée pour cette intervention.'
    }

    if (error.response.status === 403) {
      return 'Vous n’avez pas les permissions pour démarrer cette intervention.'
    }

    if (error.response.status === 404) {
      return 'Intervention introuvable.'
    }

    if (error.response.status === 409) {
      return 'Cette intervention ne peut pas être démarrée dans son état actuel.'
    }
  }

  return 'Le démarrage de l’intervention a échoué. Veuillez réessayer.'
}

function extractCompleteErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as unknown

    if (typeof payload === 'string' && payload.trim().length > 0) {
      return payload
    }

    if (payload && typeof payload === 'object') {
      const detail = (payload as { detail?: unknown }).detail
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail
      }

      const nonFieldErrors = (payload as { non_field_errors?: unknown[] }).non_field_errors
      if (Array.isArray(nonFieldErrors)) {
        const firstMessage = nonFieldErrors.find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        if (firstMessage) {
          return firstMessage
        }
      }
    }

    if (!error.response) {
      return 'Impossible de joindre le serveur. Veuillez réessayer.'
    }

    if (error.response.status === 400) {
      return 'La demande de clôture est invalide pour cette intervention.'
    }

    if (error.response.status === 403) {
      return 'Vous n’avez pas les permissions pour terminer cette intervention.'
    }

    if (error.response.status === 404) {
      return 'Intervention introuvable.'
    }

    if (error.response.status === 409) {
      return 'Cette intervention ne peut pas être terminée dans son état actuel.'
    }
  }

  return 'La clôture de l’intervention a échoué. Veuillez réessayer.'
}

export default function MechanicInterventionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [completeSuccessMessage, setCompleteSuccessMessage] = useState<string | null>(null)
  const [workError, setWorkError] = useState<string | null>(null)
  const [statusActionError, setStatusActionError] = useState<string | null>(null)

  const interventionId = useMemo(() => {
    if (!id) {
      return null
    }

    const parsedId = Number(id)
    return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null
  }, [id])

  const interventionQuery = useQuery({
    queryKey: ['mechanic-intervention', interventionId],
    queryFn: () => getMechanicInterventionById(interventionId as number),
    enabled: interventionId !== null,
    retry: false,
  })

  const checkInMutation = useMutation({
    mutationFn: (payload: Parameters<typeof checkInMechanicIntervention>[1]) => checkInMechanicIntervention(interventionId as number, payload),
    onSuccess: async () => {
      setCheckInError(null)
      await queryClient.invalidateQueries({ queryKey: ['mechanic-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['mechanic-intervention', interventionId] })
    },
    onError: (error) => {
      setCheckInError(extractStartErrorMessage(error))
    },
  })

  const completeMutation = useMutation({
    mutationFn: (payload: Parameters<typeof checkOutMechanicIntervention>[1]) => checkOutMechanicIntervention(interventionId as number, payload),
    onSuccess: async () => {
      setCompleteError(null)
      setCompleteSuccessMessage('Intervention terminée')
      await queryClient.invalidateQueries({ queryKey: ['mechanic-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['mechanic-intervention', interventionId] })
    },
    onError: (error) => {
      setCompleteSuccessMessage(null)
      setCompleteError(extractCompleteErrorMessage(error))
    },
  })

  const workMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveMechanicInterventionWork>[1]) => saveMechanicInterventionWork(interventionId as number, payload),
    onSuccess: async () => {
      setWorkError(null)
      await queryClient.invalidateQueries({ queryKey: ['mechanic-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['mechanic-intervention', interventionId] })
    },
    onError: (error) => {
      setWorkError(extractCompleteErrorMessage(error))
    },
  })

  const statusMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume') => (
      action === 'pause'
        ? pauseMechanicIntervention(interventionId as number)
        : resumeMechanicIntervention(interventionId as number)
    ),
    onSuccess: async () => {
      setStatusActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['mechanic-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['mechanic-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['mechanic-intervention', interventionId] })
    },
    onError: (error) => {
      setStatusActionError(extractCompleteErrorMessage(error))
    },
  })

  if (!interventionId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Intervention invalide" message="L'identifiant de l'intervention est invalide." />
      </div>
    )
  }

  if (interventionQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner size="lg" aria-label="Chargement de l'intervention" />
      </div>
    )
  }

  if (interventionQuery.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={interventionQuery.error instanceof Error ? interventionQuery.error.message : 'Une erreur est survenue.'}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void interventionQuery.refetch()}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            Réessayer
          </button>
          <Link
            to="/mechanic/interventions"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            Retour à mes interventions
          </Link>
        </div>
      </div>
    )
  }

  const intervention = interventionQuery.data

  if (!intervention) {
    return null
  }

  const statusBadge = mapStatusToBadge(intervention.status)
  const requestedStep = searchParams.get('step')
  const activeStep = intervention.status === 'TERMINEE'
    ? 'done'
    : requestedStep === 'work' && intervention.status === 'EN_COURS'
      ? 'work'
    : !intervention.check_in
      ? 'checkin'
      : !intervention.work_data
        ? 'work'
        : 'checkout'
  const stepItems = [
    { id: 'checkin', label: 'Check-in', done: Boolean(intervention.check_in) || intervention.status === 'TERMINEE' },
    { id: 'work', label: 'Intervention', done: Boolean(intervention.work_data) || intervention.status === 'TERMINEE' },
    { id: 'checkout', label: 'Check-out', done: Boolean(intervention.check_out) || intervention.status === 'TERMINEE' },
  ]

  const handlePhotoUploadSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mechanic-intervention', interventionId] })
    await queryClient.refetchQueries({ queryKey: ['mechanic-intervention', interventionId] })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {activeStep === 'done' ? (
          <div><h1 className="text-2xl font-semibold text-[#1F2937]">Rapport d’intervention</h1></div>
        ) : (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#1F2937]">
              {formatVehicleName(intervention.vehicle.brand, intervention.vehicle.model_name)}
            </h1>
            {activeStep === 'done' ? <StatusBadge label={statusBadge.label} variant={statusBadge.variant} /> : null}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-700">{intervention.vehicle.registration_number}</p>
          <p className="text-sm text-slate-600">
            {intervention.vehicle.parking_name ?? 'Parking non renseigné'} / {intervention.vehicle.parking_space_number ?? '—'}
          </p>
          {intervention.planned_start_at && intervention.planned_end_at ? (
            <p className="mt-2 text-sm font-medium text-slate-700">
              Prévue : {formatDateTime(intervention.planned_start_at)} → {formatDateTime(intervention.planned_end_at)}
            </p>
          ) : null}
        </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {activeStep === 'work' && intervention.check_in && (intervention.status === 'EN_COURS' || intervention.status === 'EN_PAUSE') ? (
            <Button
              variant={intervention.status === 'EN_COURS' ? 'secondary' : 'primary'}
              disabled={statusMutation.isPending}
              onClick={() => {
                setStatusActionError(null)
                void statusMutation.mutateAsync(intervention.status === 'EN_COURS' ? 'pause' : 'resume')
              }}
            >
              {intervention.status === 'EN_COURS' ? 'Mettre en pause' : 'Reprendre l’intervention'}
            </Button>
          ) : null}
          <Link to="/mechanic/interventions"><Button variant="secondary">Retour à mes interventions</Button></Link>
        </div>
      </div>

      <Card className="border-slate-200">
        <div className="space-y-6">
          {activeStep !== 'done' ? <StatusBadge label={statusBadge.label} variant={statusBadge.variant} /> : null}

          {activeStep !== 'done' ? <InterventionWorkflowProgress activeStep={activeStep} steps={stepItems} /> : null}

          {activeStep !== 'done' && checkInError ? <Alert variant="danger" title="Check-in impossible" message={checkInError} className="mt-5" /> : null}
          {activeStep !== 'done' && completeError ? <Alert variant="danger" title="Clôture impossible" message={completeError} className="mt-5" /> : null}
          {activeStep !== 'checkout' && activeStep !== 'done' && completeSuccessMessage ? <Alert variant="success" title="Succès" message={completeSuccessMessage} className="mt-5" /> : null}
          {activeStep !== 'done' && workError ? <Alert variant="danger" title="Enregistrement impossible" message={workError} className="mt-5" /> : null}
          {activeStep !== 'done' && statusActionError ? <Alert variant="danger" title="Mise à jour impossible" message={statusActionError} className="mt-5" /> : null}

          {activeStep === 'checkin' ? (
            <div>
              <InterventionCheckInForm
                embedded
                initialMileage={intervention.check_in?.mileage ?? null}
                disabled={checkInMutation.isPending}
                isSubmitting={checkInMutation.isPending}
                onSubmit={(values) => {
                  setCheckInError(null)
                  void checkInMutation.mutateAsync(values)
                }}
              />
            </div>
          ) : null}

          {activeStep === 'work' ? (
            <div>
              <InterventionWorkForm
                embedded
                interventionId={intervention.id}
                role="mechanic"
                initialWorkData={intervention.work_data}
                initialEstimatedCost={intervention.estimated_cost}
                workRequest={intervention.description}
                disabled={workMutation.isPending}
                isSubmitting={workMutation.isPending}
                onSubmit={(values) => {
                  setWorkError(null)
                  return workMutation.mutateAsync(values).then(() => undefined)
                }}
                onPhotoUploadSuccess={() => {
                  void handlePhotoUploadSuccess()
                }}
              />
            </div>
          ) : null}

          {activeStep === 'checkout' ? (
            intervention.status === 'EN_PAUSE' ? (
              <Alert
                variant="warning"
                title="Intervention en pause"
                message="Reprenez l’intervention avant d’effectuer le check-out."
              />
            ) : (
              <div>
                <InterventionCheckOutForm
                  embedded
                  initialMileage={intervention.check_in?.mileage ?? null}
                  initialEnergyLevel={intervention.check_in?.energy_level_percent ?? null}
                  disabled={completeMutation.isPending}
                  isSubmitting={completeMutation.isPending}
                  onSubmit={(values) => {
                    if (completeMutation.isPending) {
                      return
                    }

                    setCompleteError(null)
                    setCompleteSuccessMessage(null)
                    void completeMutation.mutateAsync(values)
                  }}
                />
              </div>
            )
          ) : null}

          {activeStep === 'done' ? (
            <PersonnelInterventionReport intervention={intervention} />
          ) : null}
        </div>
      </Card>
    </div>
  )
}
