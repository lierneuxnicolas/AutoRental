import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import InterventionCheckInForm from '../../components/interventions/InterventionCheckInForm'
import InterventionCheckOutForm from '../../components/interventions/InterventionCheckOutForm'
import InterventionWorkForm from '../../components/interventions/InterventionWorkForm'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { checkInIntervention, checkOutIntervention, getInterventionById, interruptIntervention, saveInterventionWork } from '../../services/workerInterventionService'
import type {
  WorkerInterventionResponse,
  WorkerInterventionStatus,
} from '../../types/workerIntervention'

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Non renseignée'
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getDetailErrorMessage(error: unknown): { title: string; message: string } {
  if (!axios.isAxiosError(error)) {
    return {
      title: 'Chargement impossible',
      message: 'Une erreur est survenue lors du chargement de l’intervention.',
    }
  }

  if (error.response?.status === 403) {
    return {
      title: 'Accès refusé',
      message: 'Vous n’avez pas les permissions pour consulter cette intervention.',
    }
  }

  if (error.response?.status === 404) {
    return {
      title: 'Intervention introuvable',
      message: 'Cette intervention de nettoyage est introuvable ou ne vous est pas assignée.',
    }
  }

  const payload = error.response?.data as { detail?: unknown } | string | undefined
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return {
      title: 'Chargement impossible',
      message: payload,
    }
  }

  if (payload && typeof payload === 'object' && typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return {
      title: 'Chargement impossible',
      message: payload.detail,
    }
  }

  return {
    title: 'Chargement impossible',
    message: 'Impossible de charger cette intervention pour le moment.',
  }
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
      return 'La demande ne peut pas être traitée pour cette intervention de nettoyage.'
    }

    if (error.response.status === 403) {
      return 'Vous n’avez pas les permissions pour démarrer cette intervention de nettoyage.'
    }

    if (error.response.status === 404) {
      return 'Intervention introuvable.'
    }

    if (error.response.status === 409) {
      return 'Cette intervention ne peut pas être démarrée dans son état actuel.'
    }
  }

  return 'Le démarrage de l’intervention de nettoyage a échoué. Veuillez réessayer.'
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
      return 'La demande de clôture est invalide pour cette intervention de nettoyage.'
    }

    if (error.response.status === 403) {
      return 'Vous n’avez pas les permissions pour terminer cette intervention de nettoyage.'
    }

    if (error.response.status === 404) {
      return 'Intervention introuvable.'
    }

    if (error.response.status === 409) {
      return 'Cette intervention ne peut pas être terminée dans son état actuel.'
    }
  }

  return 'La clôture de l’intervention de nettoyage a échoué. Veuillez réessayer.'
}

export default function CleaningInterventionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [checkInSuccessMessage, setCheckInSuccessMessage] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [completeSuccessMessage, setCompleteSuccessMessage] = useState<string | null>(null)
  const [workError, setWorkError] = useState<string | null>(null)
  const [workSuccessMessage, setWorkSuccessMessage] = useState<string | null>(null)
  const [interruptError, setInterruptError] = useState<string | null>(null)
  const [interruptSuccessMessage, setInterruptSuccessMessage] = useState<string | null>(null)

  const interventionId = useMemo(() => {
    if (!id) {
      return null
    }

    const parsedId = Number(id)
    return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null
  }, [id])

  const interventionQuery = useQuery({
    queryKey: ['cleaning-intervention', interventionId],
    queryFn: () => getInterventionById('cleaning', interventionId as number),
    enabled: interventionId !== null,
    retry: false,
  })

  const checkInMutation = useMutation({
    mutationFn: (payload: Parameters<typeof checkInIntervention>[2]) => checkInIntervention('cleaning', interventionId as number, payload),
    onSuccess: async () => {
      setCheckInError(null)
      setCheckInSuccessMessage('Check-in enregistré. Intervention de nettoyage démarrée')
      await queryClient.invalidateQueries({ queryKey: ['cleaning-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['cleaning-intervention', interventionId] })
    },
    onError: (error) => {
      setCheckInSuccessMessage(null)
      setCheckInError(extractStartErrorMessage(error))
    },
  })

  const completeMutation = useMutation({
    mutationFn: (payload: Parameters<typeof checkOutIntervention>[2]) => checkOutIntervention('cleaning', interventionId as number, payload),
    onSuccess: async () => {
      setCompleteError(null)
      setCompleteSuccessMessage('Intervention de nettoyage terminée')
      await queryClient.invalidateQueries({ queryKey: ['cleaning-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['cleaning-intervention', interventionId] })
    },
    onError: (error) => {
      setCompleteSuccessMessage(null)
      setCompleteError(extractCompleteErrorMessage(error))
    },
  })

  const workMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveInterventionWork>[2]) => saveInterventionWork('cleaning', interventionId as number, payload),
    onSuccess: async () => {
      setWorkError(null)
      setWorkSuccessMessage('Travail enregistré')
      await queryClient.invalidateQueries({ queryKey: ['cleaning-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['cleaning-intervention', interventionId] })
    },
    onError: (error) => {
      setWorkSuccessMessage(null)
      setWorkError(extractCompleteErrorMessage(error))
    },
  })

  const interruptMutation = useMutation({
    mutationFn: (payload: Parameters<typeof interruptIntervention>[2]) => interruptIntervention('cleaning', interventionId as number, payload),
    onSuccess: async () => {
      setInterruptError(null)
      setInterruptSuccessMessage('Intervention interrompue. Le gestionnaire peut consulter le motif.')
      await queryClient.invalidateQueries({ queryKey: ['cleaning-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['cleaning-intervention', interventionId] })
    },
    onError: (error) => {
      setInterruptSuccessMessage(null)
      setInterruptError(extractStartErrorMessage(error))
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
    const { title, message } = getDetailErrorMessage(interventionQuery.error)

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title={title} message={message} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void interventionQuery.refetch()}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            Réessayer
          </button>
          <Link
            to="/cleaning/interventions"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            Retour à mes interventions
          </Link>
        </div>
      </div>
    )
  }

  const intervention: WorkerInterventionResponse | undefined = interventionQuery.data

  if (!intervention) {
    return null
  }

  const statusBadge = mapStatusToBadge(intervention.status)
  const activeStep = intervention.status === 'TERMINEE'
    ? 'done'
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
    const includesPhotos =
      typeof intervention === 'object' &&
      intervention !== null &&
      'photos' in intervention

    if (!includesPhotos) {
      return
    }

    await queryClient.invalidateQueries({ queryKey: ['cleaning-intervention', interventionId] })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1F2937]">{intervention.vehicle.brand} {intervention.vehicle.model_name}</h1>
          <p className="text-sm text-slate-600">
            {intervention.vehicle.registration_number} · {intervention.vehicle.parking_name ?? 'Parking non renseigné'} / {intervention.vehicle.parking_space_number ?? '—'}
          </p>
          {intervention.planned_start_at && intervention.planned_end_at ? (
            <p className="mt-2 text-sm font-medium text-slate-700">
              Prévue : {formatDateTime(intervention.planned_start_at)} → {formatDateTime(intervention.planned_end_at)}
            </p>
          ) : null}
        </div>
        <Link
          to="/cleaning/interventions"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          Retour à mes interventions
        </Link>
      </div>

      <Card className="border-slate-200">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mot / consigne du gestionnaire</p>
              <p className="mt-2 text-lg font-semibold leading-7 text-[#1F2937]">
                {intervention.description?.trim() ? intervention.description : 'Aucune consigne fournie.'}
              </p>
            </div>
            <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {stepItems.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2">
                <span className={[
                  'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold',
                  step.done ? 'bg-emerald-50 text-emerald-700' : activeStep === step.id ? 'bg-[#2563EB] text-white' : 'bg-slate-100 text-slate-500',
                ].join(' ')}>
                  {step.done ? '✓' : index + 1} {step.label}
                </span>
                {index < stepItems.length - 1 ? <span className="hidden h-px w-8 bg-slate-200 sm:block" /> : null}
              </div>
            ))}
          </div>

          {intervention.check_in ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Check-in terminé</p>
              <p className="mt-1">Km initial : {intervention.check_in.mileage} · {intervention.check_in.observations}</p>
            </div>
          ) : null}

          {checkInError ? <Alert variant="danger" title="Check-in impossible" message={checkInError} className="mt-5" /> : null}
          {checkInSuccessMessage ? <Alert variant="success" title="Succès" message={checkInSuccessMessage} className="mt-5" /> : null}
          {completeError ? <Alert variant="danger" title="Clôture impossible" message={completeError} className="mt-5" /> : null}
          {completeSuccessMessage ? <Alert variant="success" title="Succès" message={completeSuccessMessage} className="mt-5" /> : null}
          {workError ? <Alert variant="danger" title="Enregistrement impossible" message={workError} className="mt-5" /> : null}
          {workSuccessMessage ? <Alert variant="success" title="Succès" message={workSuccessMessage} className="mt-5" /> : null}
          {interruptError ? <Alert variant="danger" title="Interruption impossible" message={interruptError} className="mt-5" /> : null}
          {interruptSuccessMessage ? <Alert variant="success" title="Intervention interrompue" message={interruptSuccessMessage} className="mt-5" /> : null}

          {activeStep === 'checkin' ? (
            <div>
              <InterventionCheckInForm
                embedded
                role="cleaning"
                initialMileage={intervention.check_in?.mileage ?? null}
                disabled={checkInMutation.isPending}
                isSubmitting={checkInMutation.isPending}
                onInterrupt={(values) => {
                  setInterruptError(null)
                  setInterruptSuccessMessage(null)
                  void interruptMutation.mutateAsync(values)
                }}
                onSubmit={(values) => {
                  setCheckInError(null)
                  setCheckInSuccessMessage(null)
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
                role="cleaning"
                initialWorkData={intervention.work_data}
                initialEstimatedCost={intervention.estimated_cost}
                photos={intervention.check_in?.photos ?? []}
                disabled={workMutation.isPending}
                isSubmitting={workMutation.isPending}
                onSubmit={(values) => {
                  setWorkError(null)
                  setWorkSuccessMessage(null)
                  void workMutation.mutateAsync(values)
                }}
                onPhotoUploadSuccess={() => {
                  void handlePhotoUploadSuccess()
                }}
              />
            </div>
          ) : null}

          {activeStep === 'checkout' ? (
            <div>
              <InterventionCheckOutForm
                embedded
                role="cleaning"
                initialMileage={intervention.check_in?.mileage ?? null}
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
          ) : null}

          {activeStep === 'done' ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#2563EB]">Intervention terminée</p>
              <p className="mt-2 text-sm text-slate-700">Le rapport final est enregistré et consultable par le gestionnaire.</p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
