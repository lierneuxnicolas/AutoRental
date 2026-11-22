import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getManagementInterventions } from '../../services/managementInterventionService'
import { decideManagementIntervention, getManagementInterventionAssignees } from '../../services/managementInterventionService'
import type { InterventionDecision, InterventionType, ManagementInterventionResponse } from '../../types/managementIntervention'
import VehicleStatusForm from '../../components/vehicles/VehicleStatusForm'
import PersonnelInterventionReport from '../../components/interventions/PersonnelInterventionReport'

function formatDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function resultFor(intervention: ManagementInterventionResponse): 'OK' | 'A_CONTROLER' {
  if (intervention.intervention_type === 'MECANIQUE') {
    return 'OK'
  }
  const finalReport = asRecord(intervention.final_report)
  const checkOut = asRecord(finalReport.check_out)
  const work = intervention.work_data ?? asRecord(finalReport.work)
  return intervention.vehicle.status === 'A_CONTROLER'
    || checkOut.vehicle_operational === false
    || checkOut.vehicle_clean === false
    || checkOut.new_intervention_needed === true
    || Boolean(work.anomaly_type)
    || Boolean(work.anomaly_comment)
    ? 'A_CONTROLER'
    : 'OK'
}

function resultBadge(result: 'OK' | 'A_CONTROLER'): { label: string; variant: StatusVariant } {
  return result === 'OK'
    ? { label: 'OK', variant: 'success' }
    : { label: 'À valider', variant: 'warning' }
}

export default function ManagerInterventionReportsPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'' | InterventionType>('')
  const [result, setResult] = useState<'' | 'OK' | 'A_CONTROLER'>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [decisionFor, setDecisionFor] = useState<ManagementInterventionResponse | null>(null)
  const [decision, setDecision] = useState<InterventionDecision>('RETURN_TO_PARK')
  const [decisionComment, setDecisionComment] = useState('')
  const queryClient = useQueryClient()

  const reportsQuery = useQuery({
    queryKey: ['manager-intervention-reports'],
    queryFn: async () => {
      const all: ManagementInterventionResponse[] = []
      let page: number | null = 1
      while (page !== null) {
        const response = await getManagementInterventions({ page })
        all.push(...response.results)
        if (!response.next) { page = null } else {
          const nextUrl = new URL(response.next, 'http://localhost')
          const nextPage = Number(nextUrl.searchParams.get('page'))
          page = Number.isInteger(nextPage) && nextPage > 0 ? nextPage : null
        }
      }
      return all.filter((item) => item.status === 'TERMINEE')
    },
  })

  const reports = useMemo(() => (reportsQuery.data ?? []).filter((intervention) => {
    const normalized = search.trim().toLowerCase()
    const haystack = [intervention.reference, intervention.vehicle.brand, intervention.vehicle.model_name, intervention.vehicle.registration_number, intervention.assigned_to?.first_name, intervention.assigned_to?.last_name, intervention.assigned_to?.email].filter(Boolean).join(' ').toLowerCase()
    const completed = intervention.completed_at ? new Date(intervention.completed_at).getTime() : 0
    return (!normalized || haystack.includes(normalized))
      && (!type || intervention.intervention_type === type)
      && (!result || resultFor(intervention) === result)
      && (!startDate || completed >= new Date(`${startDate}T00:00:00`).getTime())
      && (!endDate || completed <= new Date(`${endDate}T23:59:59`).getTime())
  }), [endDate, reportsQuery.data, result, search, startDate, type])

  const assigneesQuery = useQuery({ queryKey: ['manager-intervention-assignees'], queryFn: getManagementInterventionAssignees, enabled: decisionFor !== null })
  const decisionMutation = useMutation({
    mutationFn: (payload: Parameters<typeof decideManagementIntervention>[1]) => decideManagementIntervention(decisionFor?.id ?? 0, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['manager-intervention-reports'] })
      setDecisionFor(null)
      setOpenId(null)
    },
  })

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="text-3xl font-semibold text-[#0F172A]">Rapports d’intervention</h1><p className="mt-2 text-sm text-slate-500">Consultez les interventions terminées et les décisions nécessaires.</p></div>
      <Card><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"><Input type="search" label="Recherche véhicule / immatriculation" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Type" value={type} onChange={(event) => setType(event.target.value as '' | InterventionType)} className="h-12 self-end rounded-2xl border border-slate-200 bg-white px-4 text-sm"><option value="">Tous les types</option><option value="MECANIQUE">Maintenance</option><option value="NETTOYAGE">Nettoyage</option></select><select aria-label="Résultat" value={result} onChange={(event) => setResult(event.target.value as '' | 'OK' | 'A_CONTROLER')} className="h-12 self-end rounded-2xl border border-slate-200 bg-white px-4 text-sm"><option value="">Tous les résultats</option><option value="OK">OK</option><option value="A_CONTROLER">À valider</option></select><Input type="date" label="Date début" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><Input type="date" label="Date fin" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></Card>
      {reportsQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><LoadingSpinner size="lg" aria-label="Chargement des rapports" /></div> : null}
      {reportsQuery.isError ? <Alert variant="danger" title="Chargement impossible" message="Les rapports n’ont pas pu être chargés." /> : null}
      {!reportsQuery.isLoading && !reportsQuery.isError && reports.length === 0 ? <EmptyState title="Aucun rapport correspondant" description="Aucune intervention terminée ne correspond aux filtres." /> : null}
      {reports.length > 0 ? <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead className="bg-slate-50"><tr>{['Véhicule','Immatriculation','Type','Intervenant','Date de fin','Résultat','Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>)}</tr></thead><tbody>{reports.map((intervention) => { const reportResult=resultFor(intervention); const badge=resultBadge(reportResult); return <tr key={intervention.id} className="border-t border-slate-100"><td className="px-4 py-3 text-sm font-medium">{intervention.vehicle.brand} {intervention.vehicle.model_name}</td><td className="px-4 py-3 text-sm text-slate-600">{intervention.vehicle.registration_number}</td><td className="px-4 py-3 text-sm">{intervention.intervention_type === 'MECANIQUE' ? 'Maintenance' : 'Nettoyage'}</td><td className="px-4 py-3 text-sm">{intervention.assigned_to ? `${intervention.assigned_to.first_name} ${intervention.assigned_to.last_name}` : '—'}</td><td className="px-4 py-3 text-sm">{formatDate(intervention.completed_at) ?? '—'}</td><td className="px-4 py-3"><StatusBadge label={badge.label} variant={badge.variant} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setOpenId(openId === intervention.id ? null : intervention.id)}>Voir le rapport</Button>{reportResult === 'A_CONTROLER' ? <Button size="sm" onClick={() => { setDecisionFor(intervention); setDecision('RETURN_TO_PARK'); setDecisionComment('') }}>Décider</Button> : null}</div></td></tr>})}</tbody></table></div>{openId ? <div className="border-t border-slate-200 p-4 sm:p-6">{reports.filter((item) => item.id === openId).map((item) => <div key={item.id} className="space-y-4"><PersonnelInterventionReport intervention={item} heading="h2" /><div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><StatusBadge {...resultBadge(resultFor(item))} /><p className="text-sm text-slate-700">{resultFor(item) === 'OK' ? 'Véhicule remis automatiquement au parc.' : 'Décision requise.'}</p></div></div>)}</div> : null}</div> : null}
      {decisionFor ? <Card className="border-amber-200" header={<h2 className="text-lg font-semibold">Décision gestionnaire</h2>}><div className="space-y-4"><select aria-label="Décision" value={decision} onChange={(event) => setDecision(event.target.value as InterventionDecision)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm"><option value="RETURN_TO_PARK">Remettre au parc</option><option value="MARK_UNAVAILABLE">Rendre indisponible</option><option value="PLAN_MAINTENANCE">Planifier une maintenance</option><option value="PLAN_CLEANING">Planifier un nettoyage</option></select>{decision === 'PLAN_MAINTENANCE' || decision === 'PLAN_CLEANING' ? <VehicleStatusForm currentStatus="A_CONTROLER" vehicleLabel={`${decisionFor.vehicle.brand} ${decisionFor.vehicle.model_name}`} vehicleId={decisionFor.vehicle.id} forcedStatus={decision === 'PLAN_MAINTENANCE' ? 'MAINTENANCE' : 'NETTOYAGE'} assignees={assigneesQuery.data ?? []} onCancel={() => setDecisionFor(null)} onSubmit={async (payload) => { const selectedDecision: InterventionDecision = payload.status === 'MAINTENANCE' ? 'PLAN_MAINTENANCE' : 'PLAN_CLEANING'; await decisionMutation.mutateAsync({ decision: selectedDecision, assigned_user_id: payload.assigned_user_id, planned_start_date: payload.planned_start_date, planned_end_date: payload.planned_end_date, description: payload.reason }) }} isSubmitting={decisionMutation.isPending} /> : <><Input label="Motif / commentaire" value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDecisionFor(null)}>Annuler</Button><Button disabled={decisionMutation.isPending} onClick={() => decisionMutation.mutate({ decision, comment: decisionComment })}>Confirmer</Button></div></>}{decisionMutation.isError ? <Alert variant="danger" title="Décision impossible" message="La décision n’a pas pu être enregistrée." /> : null}</div></Card> : null}
    </section>
  )
}
