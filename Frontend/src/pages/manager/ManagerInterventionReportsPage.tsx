import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
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
  return new Intl.DateTimeFormat(clientLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
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
  const { t } = useTranslation()
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
      <div><h1 className="text-3xl font-semibold text-[#0F172A]">{t("professional.rapports_d_intervention")}</h1><p className="mt-2 text-sm text-slate-500">{t("professional.consultez_les_interventions_terminees_et_les_decisions_necessaires")}</p></div>
      <Card><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"><Input type="search" label={t("professional.recherche_vehicule_immatriculation")} value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={t("professional.type")} value={type} onChange={(event) => setType(event.target.value as '' | InterventionType)} className="h-12 self-end rounded-2xl border border-slate-200 bg-white px-4 text-sm"><option value="">{t("professional.tous_les_types")}</option><option value="MECANIQUE">{t("professional.maintenance")}</option><option value="NETTOYAGE">{t("professional.nettoyage")}</option></select><select aria-label={t("professional.resultat")} value={result} onChange={(event) => setResult(event.target.value as '' | 'OK' | 'A_CONTROLER')} className="h-12 self-end rounded-2xl border border-slate-200 bg-white px-4 text-sm"><option value="">{t("professional.tous_les_resultats")}</option><option value="OK">OK</option><option value="A_CONTROLER">{t("professional.a_valider")}</option></select><Input type="date" label={t("professional.date_debut")} value={startDate} onChange={(event) => setStartDate(event.target.value)} /><Input type="date" label={t("professional.date_fin")} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></Card>
      {reportsQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><LoadingSpinner size="lg" aria-label={t("professional.chargement_des_rapports")} /></div> : null}
      {reportsQuery.isError ? <Alert variant="danger" title={t("client.chargement_impossible")} message={t("professional.les_rapports_n_ont_pas_pu_etre_charges")} /> : null}
      {!reportsQuery.isLoading && !reportsQuery.isError && reports.length === 0 ? <EmptyState title={t("professional.aucun_rapport_correspondant")} description={t("professional.aucune_intervention_terminee_ne_correspond_aux_filtres")} /> : null}
      {reports.length > 0 ? <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead className="bg-slate-50"><tr>{['Véhicule','Immatriculation','Type','Intervenant','Date de fin','Résultat','Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{professionalDisplay(t, heading)}</th>)}</tr></thead><tbody>{reports.map((intervention) => { const reportResult=resultFor(intervention); const badge=resultBadge(reportResult); return <tr key={intervention.id} className="border-t border-slate-100"><td className="px-4 py-3 text-sm font-medium">{intervention.vehicle.brand} {intervention.vehicle.model_name}</td><td className="px-4 py-3 text-sm text-slate-600">{intervention.vehicle.registration_number}</td><td className="px-4 py-3 text-sm">{intervention.intervention_type === 'MECANIQUE' ? t("professional.maintenance") : t("professional.nettoyage")}</td><td className="px-4 py-3 text-sm">{intervention.assigned_to ? `${intervention.assigned_to.first_name} ${intervention.assigned_to.last_name}` : '—'}</td><td className="px-4 py-3 text-sm">{formatDate(intervention.completed_at) ?? '—'}</td><td className="px-4 py-3"><StatusBadge label={professionalDisplay(t, badge.label)} variant={badge.variant} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setOpenId(openId === intervention.id ? null : intervention.id)}>{t("professional.voir_le_rapport")}</Button>{reportResult === 'A_CONTROLER' ? <Button size="sm" onClick={() => { setDecisionFor(intervention); setDecision('RETURN_TO_PARK'); setDecisionComment('') }}>{t("professional.decider")}</Button> : null}</div></td></tr>})}</tbody></table></div>{openId ? <div className="border-t border-slate-200 p-4 sm:p-6">{reports.filter((item) => item.id === openId).map((item) => <div key={item.id} className="space-y-4"><PersonnelInterventionReport intervention={item} heading="h2" /><div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><StatusBadge {...resultBadge(resultFor(item))} /><p className="text-sm text-slate-700">{resultFor(item) === 'OK' ? t("professional.vehicule_remis_automatiquement_au_parc") : t("professional.decision_requise")}</p></div></div>)}</div> : null}</div> : null}
      {decisionFor ? <Card className="border-amber-200" header={<h2 className="text-lg font-semibold">{t("professional.decision_gestionnaire")}</h2>}><div className="space-y-4"><select aria-label={t("professional.decision")} value={decision} onChange={(event) => setDecision(event.target.value as InterventionDecision)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm"><option value="RETURN_TO_PARK">{t("professional.remettre_au_parc")}</option><option value="MARK_UNAVAILABLE">{t("professional.rendre_indisponible")}</option><option value="PLAN_MAINTENANCE">{t("professional.planifier_une_maintenance")}</option><option value="PLAN_CLEANING">{t("professional.planifier_un_nettoyage")}</option></select>{decision === 'PLAN_MAINTENANCE' || decision === 'PLAN_CLEANING' ? <VehicleStatusForm currentStatus="A_CONTROLER" vehicleLabel={`${decisionFor.vehicle.brand} ${decisionFor.vehicle.model_name}`} vehicleId={decisionFor.vehicle.id} forcedStatus={decision === 'PLAN_MAINTENANCE' ? 'MAINTENANCE' : 'NETTOYAGE'} assignees={assigneesQuery.data ?? []} onCancel={() => setDecisionFor(null)} onSubmit={async (payload) => { const selectedDecision: InterventionDecision = payload.status === 'MAINTENANCE' ? 'PLAN_MAINTENANCE' : 'PLAN_CLEANING'; await decisionMutation.mutateAsync({ decision: selectedDecision, assigned_user_id: payload.assigned_user_id, planned_start_date: payload.planned_start_date, planned_end_date: payload.planned_end_date, description: payload.reason }) }} isSubmitting={decisionMutation.isPending} /> : <><Input label={t("professional.motif_commentaire")} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDecisionFor(null)}>{t("client.annuler")}</Button><Button disabled={decisionMutation.isPending} onClick={() => decisionMutation.mutate({ decision, comment: decisionComment })}>{t("professional.confirmer")}</Button></div></>}{decisionMutation.isError ? <Alert variant="danger" title={t("professional.decision_impossible")} message={t("professional.la_decision_n_a_pas_pu_etre_enregistree")} /> : null}</div></Card> : null}
    </section>
  )
}
