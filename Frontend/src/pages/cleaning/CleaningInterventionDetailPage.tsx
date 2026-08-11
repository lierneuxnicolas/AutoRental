import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import InterventionCompleteForm, { type InterventionCompleteFormValues } from '../../components/interventions/InterventionCompleteForm'
import InterventionPhotoUpload from '../../components/interventions/InterventionPhotoUpload'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { completeIntervention, getInterventionById, startIntervention } from '../../services/workerInterventionService'
import type {
  WorkerInterventionAssigneeSummary,
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

function getPersonLabel(person: WorkerInterventionAssigneeSummary | null): string {
  if (!person) {
    return 'Non renseigné'
  }

  const fullName = `${person.first_name} ${person.last_name}`.trim()
  return fullName.length > 0 ? fullName : person.email
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
  const [startError, setStartError] = useState<string | null>(null)
  const [startSuccessMessage, setStartSuccessMessage] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [completeSuccessMessage, setCompleteSuccessMessage] = useState<string | null>(null)

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

  const startMutation = useMutation({
    mutationFn: () => startIntervention('cleaning', interventionId as number),
    onSuccess: async () => {
      setStartError(null)
      setStartSuccessMessage('Intervention de nettoyage démarrée')
      await queryClient.invalidateQueries({ queryKey: ['cleaning-intervention', interventionId] })
      await queryClient.invalidateQueries({ queryKey: ['cleaning-interventions'] })
      await queryClient.refetchQueries({ queryKey: ['cleaning-intervention', interventionId] })
    },
    onError: (error) => {
      setStartSuccessMessage(null)
      setStartError(extractStartErrorMessage(error))
    },
  })

  const completeMutation = useMutation({
    mutationFn: (payload: InterventionCompleteFormValues) => completeIntervention('cleaning', interventionId as number, payload),
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
  const showStartAction = intervention.status === 'ATTRIBUEE'
  const showPhotoUploadSection = intervention.status === 'EN_COURS'
  const showCompleteForm = intervention.status === 'EN_COURS'

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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1F2937]">Détail de l'intervention</h1>
          <p className="text-sm text-slate-600">{intervention.reference || `#${intervention.id}`}</p>
        </div>
        <Link
          to="/cleaning/interventions"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          Retour à mes interventions
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card
          className="border-slate-200"
          header={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#2563EB]">Intervention</p>
                <p className="text-sm text-slate-600">Détails de la tâche assignée</p>
              </div>
              <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Référence</p>
              <p className="mt-1 text-sm text-[#1F2937]">{intervention.reference || `#${intervention.id}`}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Type</p>
              <p className="mt-1 text-sm text-[#1F2937]">{intervention.intervention_type}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Statut</p>
              <p className="mt-1 text-sm text-[#1F2937]">{statusBadge.label}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Créée le</p>
              <p className="mt-1 text-sm text-[#1F2937]">{formatDateTime(intervention.created_at)}</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {intervention.description?.trim() ? intervention.description : 'Aucune description fournie.'}
            </p>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dernière mise à jour</p>
            <p className="mt-1 text-sm text-[#1F2937]">{formatDateTime(intervention.updated_at)}</p>
          </div>

          {startError ? <Alert variant="danger" title="Démarrage impossible" message={startError} className="mt-5" /> : null}
          {startSuccessMessage ? <Alert variant="success" title="Succès" message={startSuccessMessage} className="mt-5" /> : null}
          {completeError ? <Alert variant="danger" title="Clôture impossible" message={completeError} className="mt-5" /> : null}
          {completeSuccessMessage ? <Alert variant="success" title="Succès" message={completeSuccessMessage} className="mt-5" /> : null}

          {showStartAction ? (
            <div className="mt-6">
              <Button
                variant="primary"
                className="w-full sm:w-auto"
                disabled={startMutation.isPending}
                onClick={() => {
                  if (startMutation.isPending) {
                    return
                  }

                  setStartError(null)
                  setStartSuccessMessage(null)
                  void startMutation.mutateAsync()
                }}
              >
                {startMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Démarrage de l'intervention de nettoyage" />
                    Démarrage...
                  </span>
                ) : (
                  'Démarrer l’intervention'
                )}
              </Button>
            </div>
          ) : null}

          {showPhotoUploadSection ? (
            <div className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Photos de l’intervention</h2>
              <InterventionPhotoUpload
                interventionId={intervention.id}
                role="cleaning"
                onUploadSuccess={() => {
                  void handlePhotoUploadSuccess()
                }}
              />
            </div>
          ) : null}

          {showCompleteForm ? (
            <div className="mt-6">
              <InterventionCompleteForm
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
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200" header={<p className="text-sm font-semibold text-[#2563EB]">Véhicule</p>}>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Identifiant</p>
                <p className="mt-1 text-sm text-[#1F2937]">#{intervention.vehicle.id}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Marque</p>
                <p className="mt-1 text-sm text-[#1F2937]">{intervention.vehicle.brand}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Modèle</p>
                <p className="mt-1 text-sm text-[#1F2937]">{intervention.vehicle.model_name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Immatriculation</p>
                <p className="mt-1 text-sm text-[#1F2937]">{intervention.vehicle.registration_number}</p>
              </div>
            </div>
          </Card>

          <Card className="border-slate-200" header={<p className="text-sm font-semibold text-[#2563EB]">Réservation</p>}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Référence</p>
              <p className="mt-1 text-sm text-[#1F2937]">
                {intervention.reservation ? intervention.reservation.reference : 'Aucune réservation liée'}
              </p>
            </div>
          </Card>

          {intervention.assigned_to || intervention.created_by ? (
            <Card className="border-slate-200" header={<p className="text-sm font-semibold text-[#2563EB]">Assignation</p>}>
              <div className="space-y-3">
                {intervention.assigned_to ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigné à</p>
                    <p className="mt-1 text-sm text-[#1F2937]">{getPersonLabel(intervention.assigned_to)}</p>
                  </div>
                ) : null}
                {intervention.created_by ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Créé par</p>
                    <p className="mt-1 text-sm text-[#1F2937]">{getPersonLabel(intervention.created_by)}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
