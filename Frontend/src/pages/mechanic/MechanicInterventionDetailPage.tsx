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
import { checkInMechanicIntervention, checkOutMechanicIntervention, getMechanicInterventionById, saveMechanicInterventionWork } from '../../services/mechanicInterventionService'
import type { MechanicInterventionResponse, MechanicInterventionStatus } from '../../types/mechanicIntervention'
import type { WorkerInterventionCheckInPhoto } from '../../types/workerIntervention'
import { resolveMediaUrl } from '../../utils/media'

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

function formatVehicleName(brand: string, modelName: string): string {
  return modelName.toLocaleLowerCase('fr-FR').startsWith(brand.toLocaleLowerCase('fr-FR'))
    ? modelName
    : `${brand} ${modelName}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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

function formatCurrency(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return null
  }
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatAnomalyType(value: unknown): string | null {
  const key = asText(value)
  if (!key) {
    return null
  }
  const labels: Record<string, string> = {
    autre: 'Autre',
    dommage: 'Dommage',
    nettoyage: 'Besoin de nettoyage',
    securite: 'Problème de sécurité',
  }
  return labels[key] ?? key
}

function yesNo(value: unknown): string | null {
  return typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : null
}

function SummaryField({ label, value }: { label: string; value: unknown }) {
  const text = asText(value)
  if (!text) {
    return null
  }
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm font-medium text-[#1F2937]">{text}</dd>
    </div>
  )
}

function PhotoGroup({ title, photos }: { title: string; photos: WorkerInterventionCheckInPhoto[] }) {
  const visiblePhotos = photos.filter((photo) => Boolean(resolveMediaUrl(photo.file)))
  return (
    <div>
      <h4 className="text-xs font-medium text-slate-600">{title}</h4>
      {visiblePhotos.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {visiblePhotos.map((photo) => (
            <img
              key={photo.id}
              src={resolveMediaUrl(photo.file) ?? undefined}
              alt={photo.caption || title}
              className="aspect-[4/3] w-full rounded-lg border border-slate-200 object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-500">Aucune photo</p>}
    </div>
  )
}

function CompletedInterventionSummary({ intervention }: { intervention: MechanicInterventionResponse }) {
  const finalReport = asRecord(intervention.final_report)
  const reportCheckIn = asRecord(finalReport.check_in)
  const work = asRecord(finalReport.work)
  const checkOut = asRecord(finalReport.check_out)
  const checkInPhotos = intervention.check_in?.photos ?? []
  const checkOutPhotos = intervention.check_out?.photos ?? []
  const beforePhotos = checkInPhotos.filter((photo) => (photo.caption || '').toLocaleLowerCase('fr-FR').includes('avant intervention'))
  const duringPhotos = checkInPhotos.filter((photo) => !(photo.caption || '').toLocaleLowerCase('fr-FR').includes('avant intervention'))
  const anomalyType = formatAnomalyType(work.anomaly_type)
  const hasPhotos = beforePhotos.length > 0 || duringPhotos.length > 0 || checkOutPhotos.length > 0
  const finalObservation = asText(checkOut.final_comment) ?? asText(checkOut.conclusions) ?? asText(checkOut.final_vehicle_state)

  return (
    <div className="divide-y divide-slate-200">
      <section className="pb-5">
        <h2 className="text-sm font-semibold text-[#2563EB]">Consigne du gestionnaire</h2>
        <p className="mt-2 text-sm leading-6 text-[#1F2937]">{intervention.description?.trim() || 'Aucune consigne fournie.'}</p>
      </section>

      <section className="py-5">
        <h2 className="text-sm font-semibold text-[#2563EB]">Intervention</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryField label="Début" value={formatDateTime(finalReport.started_at)} />
          <SummaryField label="Fin" value={formatDateTime(finalReport.completed_at)} />
          <SummaryField label="Kilométrage initial" value={reportCheckIn.mileage ?? intervention.check_in?.mileage} />
          <SummaryField label="Kilométrage final" value={checkOut.mileage ?? intervention.check_out?.mileage} />
        </dl>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <SummaryField label="Travail effectué" value={work.diagnostic ?? work.repairs_done} />
          {anomalyType ? <SummaryField label="Anomalie constatée" value={anomalyType} /> : null}
          {anomalyType ? <SummaryField label="Commentaire anomalie" value={work.anomaly_comment} /> : null}
          <SummaryField label="Coût éventuel" value={formatCurrency(finalReport.estimated_cost ?? intervention.estimated_cost)} />
        </dl>
      </section>

      <section className="py-5">
        <h2 className="text-sm font-semibold text-[#2563EB]">Check-out</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <SummaryField label="Observation finale" value={finalObservation} />
          <SummaryField label="Véhicule opérationnel" value={yesNo(checkOut.vehicle_operational)} />
          <SummaryField label="Nouvelle intervention nécessaire" value={yesNo(checkOut.new_intervention_needed)} />
        </dl>
      </section>

      {hasPhotos ? (
        <section className="pt-5">
          <h2 className="text-sm font-semibold text-[#2563EB]">Photos</h2>
          <div className="mt-3 grid gap-5 lg:grid-cols-3">
            <PhotoGroup title="Avant intervention" photos={beforePhotos} />
            <PhotoGroup title="Pendant intervention" photos={duringPhotos} />
            <PhotoGroup title="Après intervention" photos={checkOutPhotos} />
          </div>
        </section>
      ) : null}
    </div>
  )
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
  const queryClient = useQueryClient()
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [completeSuccessMessage, setCompleteSuccessMessage] = useState<string | null>(null)
  const [workError, setWorkError] = useState<string | null>(null)

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

    await queryClient.invalidateQueries({ queryKey: ['mechanic-intervention', interventionId] })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <Link
          to="/mechanic/interventions"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1F2937] transition hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          Retour à mes interventions
        </Link>
      </div>

      <Card className="border-slate-200">
        <div className="space-y-6">
          {activeStep !== 'done' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mot / consigne du gestionnaire</p>
                <p className="mt-2 text-lg font-semibold leading-7 text-[#1F2937]">
                  {intervention.description?.trim() ? intervention.description : 'Aucune consigne fournie.'}
                </p>
              </div>
              <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
            </div>
          ) : null}

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

          {activeStep !== 'done' && checkInError ? <Alert variant="danger" title="Check-in impossible" message={checkInError} className="mt-5" /> : null}
          {activeStep !== 'done' && completeError ? <Alert variant="danger" title="Clôture impossible" message={completeError} className="mt-5" /> : null}
          {activeStep !== 'checkout' && activeStep !== 'done' && completeSuccessMessage ? <Alert variant="success" title="Succès" message={completeSuccessMessage} className="mt-5" /> : null}
          {activeStep !== 'done' && workError ? <Alert variant="danger" title="Enregistrement impossible" message={workError} className="mt-5" /> : null}

          {activeStep === 'checkin' ? (
            <div>
              <InterventionCheckInForm
                embedded
                role="mechanic"
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
            <div>
              <InterventionCheckOutForm
                embedded
                role="mechanic"
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
            <CompletedInterventionSummary intervention={intervention} />
          ) : null}
        </div>
      </Card>
    </div>
  )
}
